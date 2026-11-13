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
python3 -m pytest tests/ -q            # add --run-slow for live-analysis tests
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

## Authentication & access control

- **Sign-in**: `POST /v1/auth/login` with `{email | user_id, password}`. A password is always required; missing, empty, or wrong passwords return `401 invalid_credentials`. Five failed attempts per account in five minutes return `429`.
- **Sessions**: login returns a signed token (`v1.<payload>.<HMAC-SHA256>`) with an expiry (8 h, `INSAAF_SESSION_TTL_SECONDS`) and a server-side session row. Every protected route needs `Authorization: Bearer <token>`; the session must exist, be unexpired and unrevoked. Role and chamber are read from the `users` table on each request, never from headers or token claims. `POST /v1/auth/logout` revokes the session.
- **Signing key**: `INSAAF_AUTH_SECRET` (≥ 32 chars), otherwise a random key generated once into `backend/.auth_secret` (gitignored).
- **Passwords**: PBKDF2-HMAC-SHA256 with per-user salt. Legacy salted-SHA-256 hashes are upgraded on the next successful login. Each demo account has its own password: set `INSAAF_DEMO_PASSWORDS` (JSON `{user_id: password}`) or let first start generate them into `backend/.demo_credentials` (gitignored).
- **Tenant isolation**: every matter route checks the actor's chamber. Another chamber's matter returns the same `404` as a matter that does not exist.
- **Permissions** (`app/auth.py`, `PERMISSIONS`):

| Action | Senior | Junior | Clerk | Student |
|---|---|---|---|---|
| Read matters (role-filtered) | ✓ | ✓ | civil/property only | moot matter only |
| Create matter, upload document, docket flags | ✓ | ✓ | ✓ | — |
| Export draft DOCX | ✓ | ✓ | ✓ | — |
| Run pipeline / search / recalculate / insert verified citation | ✓ | ✓ | — | — |
| Edit fact, submit draft for review | ✓ | ✓ | — | — |
| Approve draft, override findings | ✓ | — | — | — |
| Delete matter | ✓ | — | — | — |
| Delete document | ✓ | ✓ | — | — |
| Retrain model, reset demo, ledger tamper demo | ✓ | — | — | — |

Tests: `python3 -m pytest tests/ -q` (fast, offline). `--run-slow` adds six positive-path tests that compute live analysis stages.

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
