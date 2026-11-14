"""LLM baseline served locally by Ollama (no API key).

Returns {"label": str|None, "confidence": int|None, "latency_ms", "input_tokens", "output_tokens"}.
Needs `ollama serve` running and the model pulled (`ollama pull <LOCAL_MODEL>`).
Run directly for a smoke test:  python src/llm_client.py
"""
import asyncio
import json
import os
import time

import httpx
from dotenv import load_dotenv
from tenacity import (AsyncRetrying, retry_if_exception_type, stop_after_attempt,
                      wait_exponential_jitter)

load_dotenv()

MODEL = os.getenv("LOCAL_MODEL", "llama3.2")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
TIMEOUT_S = 120.0   # local generation is slower than a hosted API, and requests queue
NUM_CTX = 8192      # Ollama's default context can silently cut long pages
PROMPT = ('Classify this document as exactly one of: {classes}. Reply with JSON only:\n'
          '{{"label": "<one of the classes>", "confidence": <0-100>}}. Document: {text}')

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=OLLAMA_URL, timeout=TIMEOUT_S)
    return _client


def _schema(classes: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "label": {"type": "string", "enum": classes},
            "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
        },
        "required": ["label", "confidence"],
    }


def _parse(raw: str, classes: list[str]) -> tuple[str, int]:
    obj = json.loads(raw.strip())
    label, conf = obj["label"], obj["confidence"]
    if label not in classes:
        raise ValueError(f"label {label!r} not in classes")
    if isinstance(conf, bool) or not isinstance(conf, (int, float)) or not 0 <= conf <= 100:
        raise ValueError(f"bad confidence {conf!r}")
    return label, int(round(conf))


async def _chat(body: dict) -> dict:
    async for attempt in AsyncRetrying(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential_jitter(initial=1, max=10),
        stop=stop_after_attempt(3),
        reraise=True,
    ):
        with attempt:
            r = await _get_client().post("/api/chat", json=body)
            if r.status_code == 404:
                raise RuntimeError(f"model {MODEL!r} not found; run: ollama pull {MODEL}")
            r.raise_for_status()
            return r.json()


async def classify(text: str, classes: list[str]) -> dict:
    body = {
        "model": MODEL,
        "messages": [{"role": "user",
                      "content": PROMPT.format(classes=", ".join(classes), text=text)}],
        "format": _schema(classes),
        "stream": False,
        "options": {"temperature": 0, "num_ctx": NUM_CTX},
    }
    in_tok = out_tok = 0
    t0 = time.perf_counter()
    label = conf = None
    for _ in range(2):  # one try + one retry on parse failure
        data = await _chat(body)
        p_tok = int(data.get("prompt_eval_count", 0))
        if p_tok >= NUM_CTX - 64:
            print(f"[llm] WARNING prompt hit context limit ({p_tok}/{NUM_CTX}); Ollama may have cut the text")
        in_tok += p_tok
        out_tok += int(data.get("eval_count", 0))
        raw = data.get("message", {}).get("content", "")
        try:
            label, conf = _parse(raw, classes)
            break
        except (ValueError, KeyError, TypeError) as e:  # json.JSONDecodeError is a ValueError
            print(f"[llm] parse failure ({e}); raw={raw[:120]!r}")
    return {
        "label": label,
        "confidence": conf,
        "latency_ms": int((time.perf_counter() - t0) * 1000),
        "input_tokens": in_tok,
        "output_tokens": out_tok,
    }


if __name__ == "__main__":
    demo = "INVOICE #4411\nBill to: Acme Corp\nAmount due: $1,200.00\nDue date: 2026-12-01"
    print(MODEL, asyncio.run(classify(demo, ["invoice", "letter", "form", "resume", "report", "memo"])))
