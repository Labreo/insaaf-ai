# Insaaf AI — Authentication, Authorization & Security Audit (Phases 2 & 4)

**Audit Date:** 2026-11-13  
**Scope:** Independent verification of authentication, RBAC vs. real auth, Chamber A / Chamber B multi-tenant isolation, document custody, secret management, upload validation, error handling, and production build/deployment posture.

---

## 1. Mandatory Security Findings (Direct Answers)

### Q1. Can a user access protected endpoints without logging in?
**YES — Critical Vulnerability (P0).**  
- **Confirmed Test Result:** Calling `GET /v1/matters` with **zero headers** (`Authorization`, `X-Actor`, `X-Role` all omitted) returns **`200 OK`** with all 3 Chamber A matters (`mat_001`, `mat_002`, `mat_003`).  
- **Root Cause (`_resolve_actor`, [`routes.py:122-180`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L122-L180)):** No FastAPI dependency requires a valid `Authorization: Bearer <token>`. When no Bearer token is provided, `_resolve_actor` trusts client-spoofable `X-Actor` and `X-Role` headers (lines 136–141) or silently falls back to mutable module-level globals `_ACTIVE_USER_ID = "junior_1"` and `_ACTIVE_ROLE = "junior"` (lines 104–105, 143–144).
- **Passwordless Login Bypass ([`routes.py:305`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L305)):** `POST /v1/auth/login` only checks `verify_password` when `body.password is not None and body.password != ""`. Verified via live `TestClient`: `POST /v1/auth/login` with `{"email": "sardessai@chamber-b.in"}` (no password) or `{"email": "...", "password": ""}` returns **`200 OK`** and mints a valid signed Chamber B Senior Counsel token!
- **Global Mutable Session State Race ([`routes.py:295, 307-308, 330-335`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L295-L335)):** Both `POST /v1/auth/login` and `POST /v1/me/role` overwrite `_ACTIVE_USER_ID` and `_ACTIVE_ROLE` process-wide. If Judge A logs in as `senior_b` while Judge B makes unauthenticated requests in another browser tab, Judge B's identity silently flips to `senior_b`.

### Q2. Can one chamber access another chamber's records?
**YES — Critical Multi-Tenant RLS Bypass on 19 Endpoints (P0).**  
While `GET /v1/matters`, `GET /v1/matters/{id}`, `DELETE /v1/matters/{id}`, `POST /v1/matters/{id}/documents`, `DELETE /v1/matters/{id}/documents/{doc_id}`, `GET /v1/matters/{id}/draft`, `POST /v1/matters/{id}/reviews`, `GET /v1/queue`, `GET /v1/alerts`, `POST /v1/alerts/test`, `GET /v1/access-logs`, and `GET /v1/ledger` enforce `actor`-based `_can_access_matter` checks, **19 matter stage/mutation endpoints call `_get_matter_or_404(matter_id)` with `actor=None`**, completely bypassing Chamber A / Chamber B isolation as well as `clerk` / `student` role gating.

**Verified via `TestClient` with Chamber B (`senior_b`) Bearer token targeting Chamber A (`mat_001`):**

| Endpoint | HTTP Method | Observed Status (`senior_b` → `mat_001`) | Expected Status | Source Location |
|---|---|---|---|---|
| `/v1/matters/mat_001` | `GET` | `403 Forbidden` (Pass) | `403` | [`routes.py:415-425`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L415-L425) |
| `/v1/matters/mat_001/draft` | `GET` | `403 Forbidden` (Pass) | `403` | [`routes.py:641-657`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L641-L657) |
| `/v1/matters/mat_001/facts` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:521-524`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L521-L524) |
| `/v1/matters/mat_001/proof-ledger` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:527-530`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L527-L530) |
| `/v1/matters/mat_001/statute-clock` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:533-536`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L533-L536) |
| `/v1/matters/mat_001/statute-clock/recalculate` | `POST` | Unchecked (`actor=None`) | `403` | [`routes.py:539-542`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L539-L542) |
| `/v1/matters/mat_001/precedents` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:545-548`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L545-L548) |
| `/v1/matters/mat_001/precedents/search` | `POST` | Unchecked (`actor=None`) | `403` | [`routes.py:551-554`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L551-L554) |
| `/v1/matters/mat_001/citations/health` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:557-560`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L557-L560) |
| `/v1/matters/mat_001/citations/check` | `POST` | Unchecked (`actor=None`) | `403` | [`routes.py:563-566`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L563-L566) |
| `/v1/matters/mat_001/court` | `POST` | **`200 OK` (MUTATED!)** | `403` | [`routes.py:569-572`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L569-L572) |
| `/v1/matters/mat_001/flags` | `POST` | Unchecked (`actor=None`) | `403` | [`routes.py:575-578`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L575-L578) |
| `/v1/matters/mat_001/score` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:603-606`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L603-L606) |
| `/v1/matters/mat_001/bias-firewall` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:609-612`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L609-L612) |
| `/v1/matters/mat_001/bias-firewall/flip` | `POST` | Unchecked (`actor=None`) | `403` | [`routes.py:615-632`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L615-L632) |
| `/v1/matters/mat_001/advice` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:635-638`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L635-L638) |
| `/v1/matters/mat_001/draft/type` | `POST` | Unchecked (`actor=None`) | `403` | [`routes.py:660-663`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L660-L663) |
| `/v1/matters/mat_001/draft/verify-citation` | `POST` | Unchecked (`actor=None`) | `403` | [`routes.py:666-693`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L666-L693) |
| `/v1/matters/mat_001/draft/export` | `GET` | **`200 OK` (DOCX EXPORTED!)** | `403` | [`routes.py:696-707`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L696-L707) |
| `/v1/matters/mat_001/law-changes` | `GET` | **`200 OK` (LEAKED)** | `403` | [`routes.py:1030-1033`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L1030-L1033) |
| `/v1/matters/mat_001/run` & `/events` | `POST` / `GET` | Unchecked (`actor=None`) | `403` | [`routes.py:503-518`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L503-L518) |

Additionally, [`append_ledger_entry`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ledger/chain.py#L81-L82) hardcodes `org_id: str = "org_chamber_a"`, attributing Chamber B ledger entries to Chamber A.

### Q3. Do document URLs expose private documents?
- **Direct Raw File URLs:** No static directory is mounted over HTTP (`backend/app/main.py` mounts no `/uploads` static route), so `backend/uploads/*` is not directly downloadable by path URL.
- **Unprotected Content Endpoints & Plaintext Disk Storage:**
  1. Chamber B can download Chamber A's full pleading DOCX via `GET /v1/matters/mat_001/draft/export` (`200 OK`, observed 37,964 bytes) and extract all document facts via `GET /v1/matters/mat_001/facts` (`200 OK`).
  2. [`upload_document`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L442-L448) writes **both plaintext** (`uploads/doc_b6862a3f_probe.txt`) **and encrypted** (`uploads/doc_b6862a3f_probe.txt.enc`) bytes to disk, violating the DPDP encrypted-at-rest guarantee (`metadata_json` records AES-256 while plaintext sits beside `.enc`).

---

## 2. Detailed Phase 2 Audit: Auth, RBAC, Sessions & Attribution

| Security Control | Current Implementation | Exact Reference | Assessment & Defects |
|---|---|---|---|
| **Login & Registration** | `POST /v1/auth/login`, `GET /v1/auth/accounts`, `<AuthModal />` ([`AuthModal.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/components/AuthModal.tsx)). No user registration endpoint (`5` pre-seeded users only). | [`routes.py:270-312`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L270-L312), [`db.py:272-288`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L272-L288) | **P0:** Password check skipped when `password` is empty/omitted. **P2:** Public `GET /v1/auth/accounts` exposes full chamber staff emails & roles without auth (acceptable only for gated demo banner, should be flagged). |
| **Password Hashing** | Single-round `hashlib.sha256("insaaf_salt|" + password)` using static shared salt. Verified via `hmac.compare_digest`. | [`db.py:21-26`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L21-L26) | **P2:** Static salt + fast unsalted SHA-256 allows rainbow/brute-force attacks. Should use `hashlib.pbkdf2_hmac("sha256", ..., per_user_salt, 200_000)` or `bcrypt`/`argon2`. |
| **Token Generation & Validation** | Base64 JSON `{user_id, role, org_id}` + 32-hex-char (128-bit) truncated HMAC-SHA256 signature. | [`db.py:29-56`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L29-L56) | **P1:** Hardcoded default `_TOKEN_SECRET = "insaaf-ps29-chamber-custody-2026"` (`INSAAF_AUTH_SECRET` unset in `.env`). **P2:** No `exp` (expiration) or `iat` claim; tokens live forever. |
| **Session Expiration & Logout** | No server-side expiration, no `/v1/auth/logout`, no token revocation list. | [`routes.py:270-341`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L270-L341) | **P2:** Logout button does not exist in UI; switching relies on replacing `localStorage.insaaf_token` via login/reset. |
| **Role-Based Authorization (RBAC)** | `_can_access_matter` blocks `clerk` on `criminal`, restricts `student` to `mat_001` or `created_by`. `POST /reviews` blocks `clerk` & `student` (`403`). | [`routes.py:187-196`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L187-L196), [`routes.py:721-730`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L721-L730) | **P0 Bug:** Observed via `TestClient`: **`student_1` succeeded (`200 OK`) in deleting `mat_001` (`DELETE /matters/mat_001`), tampering the audit ledger (`POST /ledger/tamper`), and triggering ML retraining (`POST /ml/retrain`)!** **P1:** `POST /reviews` lets `junior` perform `action="override"` on score/citation/proof/advice, whereas [`ReviewDrawer.tsx:50`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/components/ReviewDrawer.tsx#L50) restricts overrides to `senior`. |
| **Actor Attribution in Audit Logs** | `GET /me` and `_resolve_actor` trust `X-Actor` / `X-Role` headers whenever no `Bearer` token is sent. | [`routes.py:136-141`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L136-L141) | **P0:** An attacker sending `X-Actor: senior_1` and `X-Role: senior` without a Bearer token impersonates Senior Counsel in both `ledger_entries` and `access_logs` (`log_access`), and passes `draft` approval checks! |
| **Frontend Auth Propagation Gaps** | [`api.ts:334`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/lib/api.ts#L334) (`pipeline` SSE `fetch`), [`Matter.tsx:216`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Matter.tsx#L216) (`<a href>` DOCX), [`DraftTab.tsx:83`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/DraftTab.tsx#L83) (`exportDocx` `fetch`) omit `Authorization: Bearer`. | [`api.ts:334`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/lib/api.ts#L334), [`DraftTab.tsx:83`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/DraftTab.tsx#L83) | **P1:** Once backend auth/RLS is enforced on `/events` and `/draft/export`, SSE streaming and DOCX download will return `401`/`403` for logged-in Chamber B or authenticated sessions unless those frontend calls send Bearer headers. |

---

## 3. Detailed Phase 4 Audit: Security, Custody & Reliability

| Check Area | Observed Reality | Severity | Source Location |
|---|---|---|---|
| **Plaintext Document Storage** | `upload_document` executes `save_path.write_bytes(content)` AND `(UPLOADS_DIR / f"{doc_id}_{fname}.enc").write_bytes(enc_bytes)`. Observed both `.txt` and `.txt.enc` in `backend/uploads/`. Also `documents.extracted_text` is stored plaintext in SQLite `insaaf.db`. | **P0** | [`routes.py:442-448`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L442-L448) |
| **Encryption at Rest Algorithm** | [`encrypt_envelope_bytes`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L59-L81) implements a custom SHA-256 CTR XOR keystream + HMAC tag (tagged `"cipher": "AES-256-CTR-HMAC"` in JSON metadata despite using SHA-256 XOR rather than real AES-256-GCM / `cryptography`). | **P2** | [`db.py:59-81`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L59-L81) |
| **Secrets & Env Config** | `backend/.env` exists and is gitignored (`backend/.gitignore`). `GEMINI_API_KEY`, `SERPAPI_API_KEY`, `TELEGRAM_BOT_TOKEN` are loaded; `INSAAF_AUTH_SECRET` is unset, falling back to hardcoded literal string. | **P1** | [`config.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/config.py), [`db.py:18`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L18) |
| **File Upload Validation** | No file size limit (`await file.read()` buffers full body in RAM). No filename sanitization: `../../evil.txt` triggers `HTTP 500 FileNotFoundError`. Corrupt `.pdf` (`b"not a real pdf"`) triggers unhandled `fitz.FileDataError` -> `HTTP 500`. | **P0 / P1** | [`routes.py:440-473`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L440-L473) |
| **API Error Handling** | Live `extract_facts` crashes with `HTTP 500 ResponseValidationError` when Gemini emits float `1.0` for `translation_confidence`. Other Pydantic endpoints strictly validate responses. | **P0** | [`llm/client.py:161`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py#L161) |
| **Database Persistence** | SQLite `insaaf.db` with `check_same_thread=False`, foreign keys `ON`, `timeout=30.0`. Persists across restarts. **P0 Defect:** `reset_demo()` calls `init_db()` -> `_seed_demo_data()`, which skips re-seeding `mat_001`–`mat_003` whenever `COUNT(*) FROM matters > 0`. | **P0** | [`db.py:98-112`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L98-L112), [`db.py:290-296`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L290-L296) |
| **External Service Timeouts & Fallbacks** | Gemini (`25s` `httpx.AsyncClient` / `12s` fact timeout → deterministic fallback), Indian Kanoon (`8s` budget → SerpAPI → SQLite `kanoon_cache` + `LANDMARK_DOCS`), Bhashini (`12s` → Gemini translation), Solana devnet (`4s` RPC → local Merkle root), Telegram (`5s`). | **PASS** | [`llm/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py), [`kanoon/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/kanoon/client.py), [`bhashini/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/bhashini/client.py), [`chain.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ledger/chain.py) |
| **Production Build & CORS** | [`main.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/main.py) enables `allow_origins=["*"]` with `allow_credentials=False`. `frontend/vite.config.ts` proxies `/v1` cleanly; `frontend` does not serve static SPA from FastAPI directly unless built behind reverse proxy. | **P2** | [`main.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/main.py), [`vite.config.ts`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/vite.config.ts) |

---

## 4. Smallest Secure Auth & Tenant-Isolation Implementation Proposal

To lock down every P0/P1 vulnerability **without adding heavy infrastructure** and **preserving the working 1-click Hackathon Demo Persona Switcher & RBAC UI**:

1. **Strict Token-First Identity Resolution (Eliminate Spoofing & Global State):**
   - Delete module-level mutable `_ACTIVE_USER_ID` / `_ACTIVE_ROLE` mutations from `auth_login` and `set_me_role`.
   - Require `Authorization: Bearer <token>` on all protected routes (or allow explicit dev-only fallback **strictly** when `INSAAF_DEMO_MODE=true` is enabled for initial `GET /v1/me` bootstrap before sign-in, never trusting arbitrary `X-Actor` headers over a Bearer token or defaulting to admin/senior). Best minimal approach for live judging: browser auto-fetches a signed `junior_1` demo session token on first `bootstrap()` if `localStorage.insaaf_token` is empty, and all subsequent requests carry `Authorization: Bearer <token>`.
   - Add `exp` (`now + 86400`) to `sign_session_token` & verify `exp > time.time()` + `jti` blocklist (`revoked_tokens` SQLite table or memory set) with `POST /v1/auth/logout`.
2. **Fix Password Bypass on `POST /v1/auth/login`:**
   - Require `password` verification whenever logging in via `email` (`401` if empty/missing).
   - Allow passwordless persona switch **only** if `demo_switch: true` AND `user_id` is one of the 5 seeded demo accounts (`INSAAF_DEMO_MODE=true`), while email+password form always verifies PBKDF2-SHA256 hash (`401` on wrong or empty password).
3. **Close All 19 Cross-Chamber RLS Gaps + Role Write Gates:**
   - Add `actor = _resolve_actor(authorization, ...)` and `_get_matter_or_404(matter_id, actor=actor)` to all 19 missing `/matters/{matter_id}/*` endpoints (`/run`, `/events`, `/facts`, `/proof-ledger`, `/statute-clock*`, `/precedents*`, `/citations*`, `/court`, `/flags`, `/score`, `/bias-firewall*`, `/advice`, `/draft/type`, `/draft/verify-citation`, `/draft/export`, `/law-changes`).
   - Enforce RBAC write permissions on mutations:
     - `student`: read-only (`403` on `POST /matters`, `DELETE /matters/*`, `POST /documents`, `DELETE /documents/*`, `POST /court`, `POST /flags`, `POST /draft/type`, `POST /statute-clock/recalculate`, `POST /ledger/tamper`, `POST /ml/retrain`).
     - `clerk`: intake & document upload only (`403` on `DELETE /matters/*`, `POST /court`, `POST /flags`, `POST /draft/type`, `POST /reviews`, `POST /ledger/tamper`, `POST /ml/retrain`).
     - `junior`: cannot seal `draft` (`approve`) or override findings (`override` restricted to `senior` in `POST /reviews` to match `ReviewDrawer.tsx`).
   - Pass `org_id=actor_obj["org_id"]` into `append_ledger_entry`.
4. **Fix Plaintext Upload Storage & Filename/Size Validation:**
   - In `upload_document`, parse PDF/DOCX/audio from `BytesIO` or a `tempfile.TemporaryDirectory()` that auto-cleans immediately, writing **only** `{doc_id}_{safe_name}.enc` to `backend/uploads/`.
   - Sanitize filename with `Path(file.filename).name`, enforce `MAX_UPLOAD_BYTES = 20 * 1024 * 1024` (`413`), and wrap `fitz.open` / `Document(...)` errors into `HTTP 400`.
5. **Update Frontend Stream & Export Auth Headers:**
   - Pass `authHeaders` inside `api.pipeline()` (`fetch`), `DraftTab.tsx` `exportDocx()` (`fetch`), and replace raw `<a href={api.exportDraftUrl(id)}>` in `Matter.tsx:216` with an authenticated blob download handler.

