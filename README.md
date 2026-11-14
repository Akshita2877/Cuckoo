# Cuckoo

**Find mislabeled documents before they poison your dataset.**

Cuckoo parses scanned documents with NDI, asks a decision model (**Drex**, by NACE) to classify each one
**without ever seeing its label**, and flags the documents where Drex confidently disagrees with the
label it was given. A local open LLM runs the same task as a baseline.

> Like a cuckoo's egg in another bird's nest, a mislabeled document looks like it belongs.
> Cuckoo finds it.

---

## How it works

```
scanned docs ──NDI──▶ data/parsed/<doc_id>.json ──┬──▶ Drex (one choice question) ──▶ results/drex.jsonl ─┐
                                                  │                                                     ├─▶ score.py ─▶ metrics.json ─▶ demo/
                                                  └──▶ local LLM baseline (Ollama) ──▶ results/llm.jsonl ─┘
                         data/labels.csv ───────────────────────────────────────────────── (scoring only) ──┘
```

- **Blind setup:** a model only ever receives the document's page-one text and the list of classes.
  Labels are read only at scoring time, never in a model call.
- **One pass, real probabilities:** Drex answers a single choice question ("What type of document
  is this?") and returns a probability for every class, with no generated text to parse.
- **Flag:** a document is flagged when Drex's top class differs from its given label with high
  confidence. The threshold and scoring live in `src/score.py`.
- **Baseline:** a local LLM gets the same text and classes and returns `{"label", "confidence"}` as JSON.

## Repo layout

| Path | What | Owner |
|---|---|---|
| `src/drex_client.py` | Drex client: `classify(text, classes) -> probs` | A |
| `src/llm_client.py` | Local LLM baseline via Ollama | A |
| `src/run_eval.py` | Runs a model over every parsed doc, resumable | A |
| `results/drex.jsonl`, `results/llm.jsonl` | Model outputs, one line per doc | A |
| `demo/top.js` | Fills the demo page from `metrics.json` | A |
| `config.py` | Classes, paths, seed, prices | B |
| `data/`, `src/make_noise.py`, `src/ingest_ndi.py` | Dataset, planted label errors, NDI parsing | B |
| `src/score.py`, `src/charts.py`, `results/metrics.json`, `results/charts/` | Scoring and charts | B |
| `demo/index.html` | Demo page | B |

## Setup

Requires Python 3.11+ and [Ollama](https://ollama.com).

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then fill in NACE_API_KEY (never commit .env)
ollama serve                  # or open the Ollama app
ollama pull llama3.2          # baseline model; override with LOCAL_MODEL in .env
```

`.env` keys:

| Key | Purpose |
|---|---|
| `NACE_API_KEY` | Drex API key from console.nace.ai (`nace_sk_...`) |
| `LOCAL_MODEL` | Ollama model for the baseline (default `llama3.2`) |
| `OLLAMA_URL` | Ollama server (default `http://localhost:11434`) |

## Usage

```bash
# check the Drex key (free, no billing)
.venv/bin/python src/drex_client.py --check

# smoke-test the local LLM
.venv/bin/python src/llm_client.py

# go / no-go: Drex on the first 20 parsed docs vs. true labels
.venv/bin/python src/drex_client.py 20

# full runs (resumable: re-run to pick up new or failed docs)
.venv/bin/python src/run_eval.py --model drex            # 8 concurrent by default
.venv/bin/python src/run_eval.py --model llm             # 1 at a time (Ollama is serial)
.venv/bin/python src/run_eval.py --model drex --limit 20 # partial run

# validate outputs: line count, duplicate doc_ids, null probs/labels
.venv/bin/python src/run_eval.py --model drex --check
.venv/bin/python src/run_eval.py --model llm --check
```

### Demo page

`demo/index.html` loads `../results/metrics.json` with `fetch`, which browsers block on `file://`.
Serve the repo root:

```bash
python3 -m http.server 8000     # then open http://localhost:8000/demo/
```

## Data contracts

**Input**: `data/parsed/<doc_id>.json`
```json
{"doc_id": "...", "text": "<page one text>", "source": "..."}
```

**Output**: one JSON line per document. These formats are fixed; scoring depends on them.
```jsonc
// results/drex.jsonl
{"doc_id": "...", "probs": {"<class>": 0.0, ...}, "latency_ms": 0, "input_tokens": 0}
// results/llm.jsonl   (label/confidence are null if the reply could not be parsed)
{"doc_id": "...", "label": "<class>", "confidence": 0, "latency_ms": 0, "input_tokens": 0, "output_tokens": 0}
```

**Metrics**: `results/metrics.json`, read by `demo/top.js`
`n_test`, `n_planted_errors_test`, `threshold`, `drex{...}` and `llm{...}` (each with `errors_found`,
`false_alarms`, `recall`, `precision`, `budget_curve{"5","10","20"}`, `latency_p50_ms`,
`latency_p95_ms`, `cost_per_1k_docs`), and `top_flags[]` (`doc_id`, `given_label`, `drex_top`,
`drex_probs`, `flag_score`, `flipped`).

## Models

| | Drex | Baseline |
|---|---|---|
| Served by | NACE hosted API (`POST /v1/systemone`) | Ollama, on the local machine |
| Model | `drex-latest` (currently `drex-max-v1.1`) | `llama3.2` (configurable) |
| Output | probability per class | JSON `{label, confidence 0-100}`, schema-constrained, temperature 0 |
| Cost | billed per input token only | no per-token cost |
| Retries | backoff on 429/500/503/529, honours `retry-after-ms` | backoff on connection/HTTP errors; one retry on unparseable reply |

## Results

Numbers are filled from `results/metrics.json` after the full run. None are reported until then.

## Limitations

- The baseline is a small local model, not a frontier LLM, so the comparison is against an open model
  running on a laptop.
- Documents with empty text (failed OCR) still get a confident class from both models. `run_eval.py`
  lists them so they can be excluded.
- Latency for the local baseline depends on the machine it runs on.

## Team workflow

- Person A works on branch `models`, Person B on `data`. No direct commits to `main`.
- Hand-off: `git pull origin main`, merge your branch into `main`, push.
- Never commit `.env` or API keys.
