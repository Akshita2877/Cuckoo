"""Frontier-LLM baseline (Claude Opus 5.5 via the Anthropic SDK).

Returns {"label": str|None, "confidence": int|None, "latency_ms", "input_tokens", "output_tokens"}.
Note: claude-opus-5-5 rejects temperature (400), so it is not sent; effort is set to "low".
Run directly for a smoke test:  python src/llm_client.py
"""
import asyncio
import json
import os
import time

import anthropic
from dotenv import load_dotenv

load_dotenv()

MODEL = "claude-opus-5-5"
PROMPT = ('Classify this document as exactly one of: {classes}. Reply with JSON only:\n'
          '{{"label": "<one of the classes>", "confidence": <0-100>}}. Document: {text}')

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        # SDK retries 429/5xx/connection errors with backoff; 60 s per attempt.
        _client = anthropic.AsyncAnthropic(api_key=os.environ["LLM_API_KEY"],
                                           timeout=60.0, max_retries=4)
    return _client


def _parse(raw: str, classes: list[str]) -> tuple[str, int]:
    obj = json.loads(raw.strip())
    label, conf = obj["label"], obj["confidence"]
    if label not in classes:
        raise ValueError(f"label {label!r} not in classes")
    if isinstance(conf, bool) or not isinstance(conf, (int, float)) or not 0 <= conf <= 100:
        raise ValueError(f"bad confidence {conf!r}")
    return label, int(round(conf))


async def classify(text: str, classes: list[str]) -> dict:
    msg = PROMPT.format(classes=", ".join(classes), text=text)
    in_tok = out_tok = 0
    t0 = time.perf_counter()
    label = conf = None
    for _ in range(2):  # one try + one retry on parse failure
        resp = await _get_client().messages.create(
            model=MODEL,
            max_tokens=2048,
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": msg}],
        )
        in_tok += resp.usage.input_tokens
        out_tok += resp.usage.output_tokens
        raw = "".join(b.text for b in resp.content if b.type == "text")
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
    print(asyncio.run(classify(demo, ["invoice", "letter", "form", "resume", "report", "memo"])))
