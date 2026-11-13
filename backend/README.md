# Backend — API + pipeline

**Owner**: @Labreo
**Stack (suggested)**: FastAPI + Postgres (pgvector) + Redis job queue. Python, because the ML, the Kanoon client and document parsing all live in Python anyway.

## Layout
| Folder | Holds | Features |
|---|---|---|
| `app/api/` | routes, matching `docs/API_CONTRACT.md` exactly | all |
| `app/models/` | pydantic schemas: the contract in code | all |
| `app/pipeline/` | orchestrator (job state machine) + SSE events | F1 |
| `app/pipeline/stages/` | intake, facts, proof_ledger, statute_clock, search, rag, citation_health, bias_firewall, score, advice, draft | F1–F10 |
| `app/services/kanoon/` | Kanoon client, time budget, Postgres cache | F3, F7 |
| `app/services/llm/` | structured-output LLM client | F4, F8 |
| `app/services/bhashini/` | Konkani/Marathi/Hindi speech-to-text + translation | F4 |
| `app/services/notify/` | push / calendar for deadlines | F12 |
| `app/rules_engine/` | loads `rules/*.yaml`, evaluates them against facts | F5, F6, F14, Statute Clock |
| `app/ml/` | model serving, Bias Firewall, Court-Aware pooling | F2, F9, F10 |
| `app/ledger/` | hash-chained reviewer ledger, optional Solana devnet anchor | F11, F13 |
| `tests/` | rule engines, ledger tamper test, org isolation, Authority Lock | — |

## Must-haves
- Secrets in `.env` only. Commit `.env.example` with key names, never values.
- Cache every Kanoon response, and keep a demo mode that replays the cache.
- Add a `/health/deep` endpoint.
