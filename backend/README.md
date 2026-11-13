# Backend — API + Pipeline

**Owner**: @Labreo
**Stack**: FastAPI + SQLite (`insaaf.db`) + Deterministic YAML Rules Engine + Calibrated ML (`scikit-learn` / `lightgbm`) + Live APIs (Indian Kanoon, Gemini 2.5 Flash, Bhashini/Devanagari voice, Solana Devnet RPC, Telegram alerts).

## Run Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Test suite:
```bash
pytest backend/tests/test_backend.py -v
```

30-case golden suite:
```bash
python3 ml/eval/run_golden_eval.py
```

Connect the frontend to the live backend:
```bash
cd frontend
VITE_USE_MOCKS=false VITE_API_BASE=http://localhost:8000/v1 npm run dev
```

## Layout
| Folder | Holds | Features |
|---|---|---|
| `app/api/` | FastAPI routes matching `docs/API_CONTRACT.md` under `/v1` | all |
| `app/models/` | Pydantic v2 schemas matching `frontend/src/lib/types.ts` | all |
| `app/pipeline/` | 11-stage orchestrator, SSE stream, Nyaya Queue, DOCX export | F1, F12 |
| `app/services/kanoon/` | Live Indian Kanoon client, 8s time budget, SQLite cache | F3, F7 |
| `app/services/llm/` | Gemini 2.5 Flash client + Authority Lock verification | F4, F8 |
| `app/services/bhashini/` | Konkani/Marathi/Hindi speech-to-text & translation | F4 |
| `app/services/notify/` | Telegram deadline alerts | F12 |
| `app/rules_engine/` | Deterministic YAML evaluator (`rules/*.yaml`) | F5, F6, F14, Statute Clock |
| `app/ml/` | Insaaf AI-B Score, 6-identity Bias Firewall, Court-Aware pooling, Retrain | F2, F9, F10, F13 |
| `app/ledger/` | SHA-256 hash-chained Reviewer Ledger + Solana Devnet anchor | F11, F13 |
| `tests/` | Rule engines, COVID exclusion, ledger tamper test, Authority Lock, full API contract | — |
