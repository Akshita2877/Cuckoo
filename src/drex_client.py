"""Drex (NACE) client: one choice question per document, returns per-class probabilities.

API per https://console.nace.ai/docs/drex/quickstart :
  POST https://console.nace.ai/v1/systemone
  body {"model", "state": <text>, "questions": {id: {"type": "choice", "instructions", "criteria": {label: desc}}}}
  resp answers[id].probabilities {label: p}, usage.input_tokens (billed), evaluation_time_ms

Run directly for the go/no-go check:  python src/drex_client.py [N]
"""
import asyncio
import os
import time

import httpx
from dotenv import load_dotenv
from tenacity import (AsyncRetrying, retry_if_exception, stop_after_attempt,
                      wait_exponential_jitter)

load_dotenv()

BASE_URL = os.getenv("NACE_BASE_URL", "https://console.nace.ai")
MODEL = "drex-latest"
QUESTION = "What type of document is this?"
TIMEOUT_S = 30.0
RETRYABLE = {429, 500, 503, 529}

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        key = os.environ["NACE_API_KEY"]
        _client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=TIMEOUT_S,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
    return _client


class RetryableError(Exception):
    def __init__(self, msg: str, wait_s: float = 0.0):
        super().__init__(msg)
        self.wait_s = wait_s


def _is_retryable(e: BaseException) -> bool:
    return isinstance(e, (RetryableError, httpx.TimeoutException, httpx.TransportError))


async def _post(body: dict) -> dict:
    r = await _get_client().post("/v1/systemone", json=body)
    if r.status_code in RETRYABLE:
        wait_ms = float(r.headers.get("retry-after-ms", 0) or 0)
        if wait_ms:
            await asyncio.sleep(wait_ms / 1000)  # honour server's retry hint
        raise RetryableError(f"HTTP {r.status_code}: {r.text[:200]}", wait_ms / 1000)
    if r.status_code != 200:
        raise RuntimeError(f"Drex HTTP {r.status_code}: {r.text[:300]}")
    return r.json()


async def classify(text: str, classes: list[str]) -> dict:
    """Return {"probs": {class: float}, "latency_ms": int, "input_tokens": int}."""
    body = {
        "model": MODEL,
        "state": text,
        "questions": {
            "doc_type": {
                "type": "choice",
                "instructions": QUESTION,
                "criteria": {c: None for c in classes},
            }
        },
    }
    t0 = time.perf_counter()
    async for attempt in AsyncRetrying(
        retry=retry_if_exception(_is_retryable),
        wait=wait_exponential_jitter(initial=1, max=20),
        stop=stop_after_attempt(5),
        reraise=True,
    ):
        with attempt:
            data = await _post(body)
    latency_ms = int((time.perf_counter() - t0) * 1000)

    raw = data["answers"]["doc_type"]["probabilities"]
    missing = [c for c in classes if c not in raw]
    if missing:
        raise RuntimeError(f"Drex response missing classes {missing}")
    total = sum(float(raw[c]) for c in classes)
    if total <= 0:
        raise RuntimeError("Drex probabilities sum to 0")
    probs = {c: float(raw[c]) / total for c in classes}  # renormalise rounding drift
    return {
        "probs": probs,
        "latency_ms": latency_ms,
        "input_tokens": int(data["usage"]["input_tokens"]),
    }


async def _go_no_go(n: int) -> None:
    """Classify the first n parsed docs; compare to labels.csv (labels never sent to Drex)."""
    import json
    import sys
    from pathlib import Path

    import pandas as pd

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import config

    labels = pd.read_csv(config.LABELS_CSV)
    true_col = "true_label" if "true_label" in labels.columns else labels.columns[1]
    truth = dict(zip(labels["doc_id"].astype(str), labels[true_col].astype(str)))
    print(f"(true class column: {true_col})")

    files = sorted(Path(config.PARSED_DIR).glob("*.json"))[:n]
    right = 0
    for f in files:
        doc = json.loads(f.read_text())
        res = await classify(doc["text"], config.CLASSES)
        top = max(res["probs"], key=res["probs"].get)
        true = truth.get(doc["doc_id"], "?")
        right += top == true
        print(f"{doc['doc_id']:<20} top={top:<14} p={res['probs'][top]:.3f}  true={true}"
              f"  {'OK' if top == true else 'MISS'}  {res['latency_ms']}ms")
    print(f"\n{right}/{len(files)} correct -> {'GO' if right >= 0.8 * len(files) else 'NO-GO'}")


if __name__ == "__main__":
    import sys

    asyncio.run(_go_no_go(int(sys.argv[1]) if len(sys.argv) > 1 else 20))
