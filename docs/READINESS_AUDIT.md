# Insaaf AI — Hackathon Production Readiness Audit (Phase 1)

**Audit Date:** 2026-11-13  
**Repository Root:** `/Users/sanjaywaradkar/learning/hackathons/insaaf`  
**Audit Scope:** Independent verification of repository structure, uncommitted changes, F1–F14 requirements against [`docs/WORK_PLAN.md`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/docs/WORK_PLAN.md), test status, and live endpoint behavior prior to hackathon judging.

---

## 1. Executive Summary & Readiness Verdict

| Dimension | Current Observed State | Verdict |
|---|---|---|
| **Core Architecture** | FastAPI backend (`backend/`), React + Vite + Tailwind CSS v4 frontend (`frontend/`), scikit-learn / LightGBM ML pipeline (`ml/`), deterministic YAML rule engine (`rules/`). | **Solid core, needs targeted hardening** |
| **Automated Test Suite** | `pytest -v` in `backend/`: **6 / 6 tests pass** in 7.95s. `npx tsc --noEmit` in `frontend/`: **0 TypeScript errors**. | **Passes baseline regression checks** |
| **Live Environment Keys** | `GEMINI_API_KEY`: set, `SERPAPI_API_KEY`: set, `TELEGRAM_BOT_TOKEN`: set; `KANOON_API_TOKEN`: unset (uses HTML scraper + SerpAPI + SQLite cache); `BHASHINI_API_KEY`: unset (uses Gemini fallback); `INSAAF_AUTH_SECRET`: unset (uses hardcoded default string). | **Ready for demo with fallbacks** |
| **Judge Self-Serve Readiness** | **4 P0 blockers** exist: (1) Gemini returning float `1.0` for `translation_confidence` crashes `GET /v1/matters/{id}/facts` (`HTTP 500`) on newly created matters; (2) 19 matter stage/mutation endpoints lack tenant RLS checks; (3) Passwordless login & spoofable headers bypass authentication; (4) `POST /v1/demo/reset` fails to restore deleted baseline matters (`mat_001`–`mat_003`) if any matter remains in SQLite, while `student`/`clerk` can `DELETE` matters. | **NOT YET DEMO-SAFE (Fix P0s first)** |

---

## 2. Actual Repository Structure

```text
insaaf/
├── backend/
│   ├── app/
│   │   ├── api/routes.py               # All /v1/* HTTP & SSE endpoints (1084 lines)
│   │   ├── config.py                   # Pydantic settings loading backend/.env
│   │   ├── db.py                       # SQLite schema, password hashing, HMAC tokens, envelope crypto, seed data
│   │   ├── ledger/chain.py             # SHA-256 hash chain, tamper verify, Solana devnet anchor RPC
│   │   ├── main.py                     # FastAPI app + lifespan init + CORS
│   │   ├── ml/service.py               # Calibrated outcome classifier, court shrinkage, Bias Firewall masker, retraining
│   │   ├── models/schemas.py           # Strict Pydantic v2 response/request contracts
│   │   ├── pipeline/orchestrator.py    # 11-stage SSE pipeline, stage caching, DOCX builder, Nyaya Queue
│   │   ├── rules_engine/engine.py      # Proof ledger, Statute Clock (COVID tolling), Settle/Fight, Law Change Radar
│   │   └── services/
│   │       ├── bhashini/client.py      # Bhashini ASR/NMT + Gemini translation fallback
│   │       ├── kanoon/client.py        # Direct HTML scraper -> SerpAPI -> SQLite kanoon_cache & LANDMARK_DOCS
│   │       ├── llm/client.py           # Gemini Flash / Vision OCR, fact extraction, treatment classifier, Authority Lock
│   │       └── notify/client.py        # Telegram Bot deadline alert client
│   ├── insaaf.db                       # Pre-warmed SQLite database (untracked runtime state)
│   └── tests/test_backend.py           # 6 pytest tests (including test_auth_rls_and_overrides)
├── frontend/
│   └── src/
│       ├── intro/Intro.tsx             # 6.7s Velvet & Lady Justice SVG trace cinematic opener
│       ├── components/
│       │   ├── AuthModal.tsx           # Chamber sign-in & 1-click persona switcher modal
│       │   ├── ReviewDrawer.tsx        # Slide-over advocate review / ledger seal drawer
│       │   ├── Shell.tsx               # App chrome, sidebar docket rail, RBAC role switcher
│       │   └── primitives.tsx          # Paper-and-Ink cards, badges, rings, SourceSheet inspector
│       ├── lib/{api,sound,store,types,utils}.ts
│       └── screens/
│           ├── Landing.tsx             # Public dark editorial showcase + live demo triggers
│           ├── Home.tsx                # Chamber Docket & Nyaya Priority Queue
│           ├── NewMatter.tsx           # Matter Intake, language selector, sample/file staging
│           ├── Matter.tsx              # 11-tab Workbench shell + document strip + urgency flags
│           ├── Alerts.tsx              # Limitation Watchlist + Telegram alert trigger
│           ├── LedgerScreen.tsx        # Chamber audit chain + F13 model retrain dashboard
│           ├── Me.tsx                  # Chamber profile, RBAC policies, custody access log, Demo Reset
│           └── matter/                 # 11 workbench tabs (Pipeline, Facts, Proof, Clock, Precedents, Citations, ScoreTab, AdviceTab, DraftTab, Radar, LedgerTab)
├── ml/
│   ├── data/pull_judgments.py          # Synthetic 240-row judgment dataset generator (seed 20261113)
│   ├── eval/run_golden_eval.py         # Held-out 50-case calibration & LightGBM comparison script
│   └── training/train_b_score.py       # Calibrated LogisticRegression + LightGBM training & artifact export
├── rules/
│   ├── law_change/mappings.yaml        # IPC / CrPC / IEA -> BNS / BNSS / BSA effective 2024-07-01
│   ├── proof_ledger/property.yaml      # Property / Civil Recovery / Criminal evidentiary checklists
│   ├── settle_or_fight/eligibility.yaml# Lok Adalat s.21, s.12A Mediation, BNSS s.289 Plea Bargaining
│   └── statute_clock/limitation.yaml   # Limitation Act articles + SC COVID tolling window (716 days)
├── demo/matters/mat_001..mat_003/      # Synthetic PDF, DOCX, and Konkani voice JSON fixtures
└── docs/
    ├── WORK_PLAN.md                    # Original architecture and F1-F14 build plan
    └── API_CONTRACT.md                 # Shared frontend-backend REST/SSE schema contract
```

---

## 3. Git Status & Uncommitted Changes Inventory

Working tree at audit time contains **17 uncommitted items** (`16` modified tracked files, `1` untracked file) — all preserved intact during this audit:

| File | Change Type | Purpose of Uncommitted Changes |
|---|---|---|
| [`backend/app/db.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py) | Modified (`+165` lines) | Added `users` table (5 seeded accounts across `org_chamber_a` & `org_chamber_b`), `hash_password`, `sign_session_token`, `verify_session_token`, `encrypt_envelope_bytes`, `mat_004` Chamber B matter. |
| [`backend/app/api/routes.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py) | Modified (`+465` lines) | Added `/v1/auth/accounts`, `/v1/auth/login`, `_resolve_actor`, `_can_access_matter`, `mat_001`–`mat_004` filtering on selected endpoints, `.enc` write on upload, Gemini Vision OCR fallback, `POST /v1/alerts/test`. |
| [`backend/app/models/schemas.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/models/schemas.py) | Modified (`+28` lines) | Added `AuthAccount`, `LoginRequest`, `LoginResponse`, optional `token` / `rls_policy` fields on `MeResponse`, extended `ReviewRequest` validation. |
| [`backend/app/pipeline/orchestrator.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py) | Modified (`+2` lines) | Minor wiring adjustments for stage persistence and review state. |
| [`backend/app/services/llm/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py) | Modified (`+33` lines) | Added `extract_image_ocr()` using Gemini multimodal image input for scanned PDFs. |
| [`backend/tests/test_backend.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/tests/test_backend.py) | Modified (`+70` lines) | Added `test_auth_rls_and_overrides` covering Chamber B login, `mat_004` isolation, `clerk`/`student` 403 review blocks, `senior` override & seal. |
| [`frontend/src/components/AuthModal.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/components/AuthModal.tsx) | Untracked (`221` lines) | New Chamber Sign-In & 1-Click Tenant Persona Switcher modal. |
| [`frontend/src/components/Shell.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/components/Shell.tsx) | Modified (`+27` lines) | Added `"Switch Login"` trigger and integrated `<AuthModal />` into sidebar & top header. |
| [`frontend/src/screens/Landing.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Landing.tsx) | Modified (`+20` lines) | Added `"Chamber Login"` CTA button opening `<AuthModal />`. |
| [`frontend/src/screens/Me.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Me.tsx) | Modified (`+71` lines) | Added `Demo Chamber Personas` 1-click switch grid, RLS policy box, and `<AuthModal />`. |
| [`frontend/src/screens/Alerts.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Alerts.tsx) | Modified (`+87` lines) | Added `"Send Live Telegram Alert"` button calling `POST /v1/alerts/test`. |
| [`frontend/src/lib/api.ts`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/lib/api.ts) | Modified (`+53` lines) | Added `Authorization: Bearer` header injection, `accounts()`, `login()`, `sendTestAlert()`, `token` persistence. |
| [`frontend/src/lib/store.ts`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/lib/store.ts) | Modified (`+27` lines) | Added `localStorage` (`insaaf_token`) persistence for Bearer token. |
| [`frontend/src/lib/types.ts`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/lib/types.ts) | Modified (`+15` lines) | Added `AuthAccount`, `rls_policy`, `token`, `key_fingerprint` fields. |
| [`frontend/src/screens/matter/Clock.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Clock.tsx), [`DraftTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/DraftTab.tsx), [`Precedents.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Precedents.tsx) | Modified (`+10` lines each) | Added `useEffect` reset on `id` change so switching matters clears stale tab local state. |

---

## 4. Requirement Mapping: F1–F14 vs. `docs/WORK_PLAN.md`

Status definitions used strictly below:
- **Implemented & tested**: Core contract works end-to-end and is covered by passing tests / verified API checks (with any edge defects noted).
- **Partially implemented**: Working core slice exists for demo paths, but diverges significantly from [`docs/WORK_PLAN.md`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/docs/WORK_PLAN.md) or contains non-trivial gaps.
- **Implemented but unverified**: Code exists but lacked runtime verification or automated coverage.
- **Missing / Broken**: Required capability is absent or fails under normal user action.

| ID | Feature | Classification | Exact Implementation References | Verified Working Behavior | Discrepancies vs. `WORK_PLAN.md` & Defects Found |
|---|---|---|---|---|---|
| **F1** | **Whole-Matter Pipeline + Statute Clock + DOCX Export** | **Partially implemented** | [`orchestrator.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L428-L555), [`engine.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/rules_engine/engine.py#L86-L214), [`routes.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L503-L707) | Live SSE streams 11 stages (`23` events, `22.3s` end-to-end on new matter). SC COVID tolling (`2020-03-15` to `2022-02-28`) verified (+716 days). DOCX export produces valid 37.9 KB Word file. | **1.** `POST /matters/{id}/run` ([`routes.py:503-507`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L503-L507)) is a no-op stub; actual execution triggers on `GET /events`.<br>**2.** Stages are not individually resumable on failure (`WORK_PLAN.md` §3 F1.1).<br>**3.** Switching draft type via `POST /draft/type` ([`orchestrator.py:530-608`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L530-L608)) replaces Gemini prose with hardcoded template paragraphs.<br>**4. P0 Bug:** Live fact extraction via Gemini crashes `GET /facts` (`500`) if `translation_confidence` is returned as a float (`1.0`). |
| **F2** | **Bias Firewall** | **Partially implemented** | [`ml/service.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L18-L65), [`ml/service.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L168-L215), [`ScoreTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/ScoreTab.tsx#L199-L327) | 6-identity counterfactual loop (`baseline`, `muslim`, `dalit`, `tribal`, `female`, `non_english_speaking`) runs on pipeline and via live `POST /bias-firewall/flip` (`Δ = 0.00`, `ε = 0.02`). | **1.** `extract_features_for_matter()` ([`ml/service.py:65`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L65)) has `_ = masked_text` — the classifier never reads text, making `Δ = 0.00` guaranteed by construction.<br>**2.** Counterfactual invariance on **reasoning text / factor explanations** (`WORK_PLAN.md` §3 F2.4) is missing.<br>**3.** `IDENTITY_MASK_PATTERNS` only strips 5 honorific prefixes and 11 literal identity strings (no general NER). |
| **F3** | **Time-Boxed Precedent Research (Indian Kanoon)** | **Partially implemented** | [`kanoon/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/kanoon/client.py#L478-L613), [`orchestrator.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L57-L63), [`orchestrator.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L694-L755) | 3-tier waterfall (Direct `indiankanoon.org` HTML → SerpAPI `google_light` → SQLite `kanoon_cache` + `LANDMARK_DOCS`) enforces 8s budget (`elapsed_ms` capped `<= budget_ms`) and caches results (`95.5%` hit rate). Live `POST /precedents/search` works. | **1.** `_build_search_query(matter, facts)` ([`orchestrator.py:57-63`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L57-L63)) ignores `facts` and `matter["title"]`, returning 1 of 3 hardcoded queries per `case_type`.<br>**2.** `_build_prec_results` ([`orchestrator.py:694-732`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L694-L732)) uses substring keywords (`"suraj lamp"`, `"12a"`) and fixed rank decrements for stance and similarity instead of semantic similarity (`WORK_PLAN.md` §3 F3.3). |
| **F4** | **Multilingual Fact Card & Intake** | **Implemented & tested** *(with P0/P1 bugs)* | [`routes.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L428-L500), [`llm/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py#L130-L229), [`bhashini/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/bhashini/client.py#L72-L164) | Parses real PDF (`PyMuPDF` + Gemini Vision OCR fallback), DOCX (`python-docx`), JSON/voice notes (`Bhashini` + Gemini translation fallback). Preserves Konkani Devanagari script alongside English in UI. | **1. P0 Bug:** `extract_facts` ([`llm/client.py:161`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py#L161)) does not coerce `original.translation_confidence` from Gemini float (`1.0`) to `'high'|'medium'|'low'`, throwing HTTP `500` on `GET /facts` for live matters.<br>**2. P1 Bug:** Uploading/deleting documents on an existing matter does not invalidate `stage_results`, leaving stale facts/scores until manually re-run. |
| **F5** | **Proof Ledger** | **Implemented & tested** | [`rules/proof_ledger/property.yaml`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/rules/proof_ledger/property.yaml), [`engine.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/rules_engine/engine.py#L29-L83), [`Proof.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Proof.tsx) | Deterministic YAML rules for `property`, `civil_recovery`, `criminal` evaluate document evidence against statutory prerequisites and link source spans. Senior override marks items `present`. | Keyword matcher (`present_any`, `weak_any`, `negative_any`); negated keywords in prose (e.g., *"no registered sale deed"*) work via `negative_any` in YAML when configured. |
| **F6** | **Settle-or-Fight Advisor** | **Implemented & tested** | [`rules/settle_or_fight/eligibility.yaml`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/rules/settle_or_fight/eligibility.yaml), [`engine.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/rules_engine/engine.py#L217-L308), [`AdviceTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/AdviceTab.tsx) | Evaluates Lok Adalat s.21, Commercial Courts s.12A mandatory mediation, Court-Annexed Mediation s.89 CPC, and BNSS s.289 plea bargaining (including `< 7 years` + socio-economic exclusion). | Deterministic rule thresholds (`score_prob < 0.72` recommends `mediate` on `mat_001`). Matches `WORK_PLAN.md` §3 F6. |
| **F7** | **Citation Health Check** | **Partially implemented** | [`orchestrator.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L611-L674), [`llm/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py#L231-L252), [`Citations.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Citations.tsx) | Presets (*ADM Jabalpur*, *Suresh Kumar Koushal*, *Suraj Lamp*, *Patil Automation*) return accurate overruled (`red`, `blocks_draft: true`) or followed (`green`) authorities with citing case sources. | **1. Discrepancy:** Arbitrary citations (`else` branch, [`orchestrator.py:656-668`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L656-L668)) do **not** run a downstream `citedby:` search (`kanoon_client.citedby` exists at [`kanoon/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/kanoon/client.py#L530) but is never called); instead, the case title is compared to itself (`by: None`). Probe for `"State of Goa v. Test Party 2020"` returned `"Arvind Kejriwal vs Directorate Of Enforcement"` (`followed`).<br>**2.** Backend `POST /reviews` (draft approve) & `GET /draft/export` do **not** check whether `citation_health` has any un-overridden `blocks_draft: true` item. |
| **F8** | **Drafting with Authority Lock (RAG)** | **Partially implemented** | [`llm/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py#L254-L413), [`DraftTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/DraftTab.tsx) | Generates 3 formal paragraphs bound strictly to verified `source_id`s, displays `"No verified authority found."` quarantine for unsupported legal assertions, and rejects fake citations (`Imaginary Case (2099) 1 SCC 1` -> `verified: false`). | **1.** No OpenNyAI rhetorical-role segmentation or BM25 + dense vector index (`WORK_PLAN.md` §3 F8.1–F8.2); RAG corpus simply deduplicates `SourceRef`s from Proof/Precedents/Clock.<br>**2.** `verify_citation_against_corpus` ([`llm/client.py:384-399`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py#L384-L399)) accepts any claim mentioning a case's lead surname even if the claim states the opposite holding. |
| **F9** | **Insaaf AI-B Score (Calibrated ML)** | **Partially implemented** | [`ml/data/pull_judgments.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/ml/data/pull_judgments.py#L60-L112), [`ml/training/train_b_score.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/ml/training/train_b_score.py), [`ml/service.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L63-L120) | Serves calibrated `LogisticRegression` (`CalibratedClassifierCV` isotonic) with feature attributions, discrete outcome bands (`weak`/`uncertain`/`moderate`/`strong`), and reliability plot (`38/50 = 76%`, `Brier 0.1520–0.1527`). | Training data in `pull_judgments.py` is 240 synthetic rows from `random.Random(20261113)` rather than 1,500 real scraped Kanoon judgments with InLegalBERT embeddings and SHAP values (`WORK_PLAN.md` §3 F9.1–F9.4). |
| **F10** | **Court-Aware Hierarchical Pooling** | **Broken** *(2 of 4 UI court buttons)* | [`ScoreTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/ScoreTab.tsx#L28-L33), [`train_b_score.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/ml/training/train_b_score.py#L41-L70), [`ml/service.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L136-L163) | `'District Court, North Goa'` (`p̂ = 46.7%`) and `'Bombay High Court (Goa bench)'` (`p̂ = 49.3%`) compute Bayesian shrinkage (`(n*p_local + k*p_parent)/(n+k)`). | **P1 Bug:** `ScoreTab.tsx:28-33` shows 4 buttons (`'Civil Judge Senior Division, Mapusa'`, `'District Court, North Goa'`, `'Bombay High Court (Goa bench)'`, `'Supreme Court of India'`). `'Supreme Court of India'` and `'Civil Judge Senior Division, Mapusa'` are missing from `COURT_HIERARCHY` and silently map back to `'District Court, North Goa'` ([`ml/service.py:138-146`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L138-L146)). Confirmed via `POST /court`. |
| **F11** | **Chamber Workspace, Security, Audit & Solana Ledger** | **Partially implemented** | [`ledger/chain.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ledger/chain.py#L1-L202), [`db.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L18-L82), [`routes.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L122-L490) | SHA-256 hash chain, live tamper simulation (`broken_at: led_001`), Merkle root computation, and live Solana devnet `getLatestBlockhash` RPC work end-to-end. | **1. P0 Security:** `upload_document` writes plaintext copies alongside `.enc` in `backend/uploads/`.<br>**2. P0 Auth/RLS:** 19 matter stage/mutation endpoints lack tenant checks (`actor=None`), allowing cross-chamber reads/writes.<br>**3. P1 Bug:** `append_ledger_entry` ([`chain.py:81-82`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ledger/chain.py#L81-L82)) hardcodes `org_id = 'org_chamber_a'`. |
| **F12** | **Nyaya Priority Queue & Deadline Alerts** | **Implemented & tested** | [`orchestrator.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L782-L842), [`notify/client.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/notify/client.py), [`Alerts.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Alerts.tsx) | Ranks chamber matters by limitation urgency + proof gaps + urgency flags (`senior_citizen`, `interim_relief`, `undertrial_custody`). Live `POST /alerts/test` wired to Telegram Bot. | None significant (works cleanly and respects `org_id` tenant scoping on `GET /queue` and `GET /alerts`). |
| **F13** | **Disagreement → Retraining Loop** | **Implemented & tested** | [`ml/service.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L293-L353), [`routes.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L767-L928), [`LedgerScreen.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/LedgerScreen.tsx) | Senior overrides log to `ledger_entries`; `POST /ml/retrain` incorporates overrides, retrains calibrated classifier + LGBM benchmark (`b-score-0.7 -> 0.8`), and records `retrain_runs`. | `retrain_from_overrides` ([`ml/service.py:311`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L311)) derives synthetic label `outcome = 1` strictly if `"underweighted"` appears in `note.lower()`, otherwise `0`. |
| **F14** | **Law Change Radar (BNS/BNSS/BSA)** | **Implemented & tested** | [`rules/law_change/mappings.yaml`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/rules/law_change/mappings.yaml), [`engine.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/rules_engine/engine.py#L19-L65), [`Radar.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Radar.tsx) | Deterministic crosswalk (`IPC 420 -> BNS 318(4)`, `IPC 302 -> BNS 103`, `CrPC 438 -> BNSS 482`, etc.) evaluates `2024-07-01` cutoff accurately via offence date. | Automated live Indian Kanoon statutory amendment scraping by `fromdate` (`WORK_PLAN.md` §3 F14.2) is not implemented. |

---

## 5. Prioritized Backlog & Proposed Execution Order

### Priority Definitions
- **P0**: Blocks live demonstration or creates a security / tenant-isolation vulnerability.
- **P1**: Major functionality or usability problem affecting judge testing.
- **P2**: Important reliability, accuracy, or UI polish.
- **P3**: Optional post-hackathon enhancement.

### Prioritized Issue List

| Priority | ID | Summary of Issue | Exact Location |
|---|---|---|---|
| **P0** | **P0-1** | **Live `GET /facts` crashes (`HTTP 500`) on newly uploaded matters**: Gemini returns `translation_confidence: 1.0` (float) violating Pydantic `Literal["high","medium","low"]`. | [`llm/client.py:161`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/services/llm/client.py#L161) |
| **P0** | **P0-2** | **Cross-tenant RLS bypass & unauthenticated access on 19 matter stage/mutation endpoints**: `_get_matter_or_404(matter_id)` called without `actor`, allowing `senior_b` to read/mutate `mat_001` (`200 OK`), and unauthenticated callers to bypass login via fallback `_ACTIVE_USER_ID`. | [`routes.py:503-707`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L503-L707), [`routes.py:1030-1033`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L1030-L1033) |
| **P0** | **P0-3** | **Passwordless authentication bypass & cross-session global state race**: `POST /v1/auth/login` skips password verification when `password` is `""` or `None`, and mutates global `_ACTIVE_ROLE` / `_ACTIVE_USER_ID`. | [`routes.py:104-105`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L104-L105), [`routes.py:293-312`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L293-L312) |
| **P0** | **P0-4** | **`student` & `clerk` can delete matters, tamper ledger, & trigger ML retrain + `POST /v1/demo/reset` fails to restore deleted baseline matters (`mat_001`–`mat_003`)** when any single matter (`mat_004`) remains in SQLite (`existing != 0`). | [`routes.py:356-383`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L356-L383), [`routes.py:846-928`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L846-L928), [`db.py:290-296`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L290-L296) |
| **P0** | **P0-5** | **Plaintext client files written alongside `.enc` + path traversal `500`**: `upload_document` leaves raw unencrypted PDF/DOCX/TXT bytes on disk in `backend/uploads/` and does not sanitize `Path(file.filename).name`. | [`routes.py:438-449`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L438-L449) |
| **P1** | **P1-1** | **Court-Aware shrinkage buttons silently broken for 2 of 4 UI options**: `'Supreme Court of India'` and `'Civil Judge Senior Division, Mapusa'` fall back to `'District Court, North Goa'`. | [`ScoreTab.tsx:28-33`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/ScoreTab.tsx#L28-L33), [`ml/service.py:138-157`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L138-L157) |
| **P1** | **P1-2** | **Stale `stage_results` cache after document upload/deletion** on existing matters: uploading or removing evidence does not invalidate cached stages (`facts`, `proof_ledger`, `score`, `draft`). | [`routes.py:370-383`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L370-L383), [`routes.py:428-500`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L428-L500) |
| **P1** | **P1-3** | **Corrupt / oversized PDF uploads trigger `HTTP 500`** (`fitz.FileDataError`) and DOCX download links (`Matter.tsx:216` & `DraftTab.tsx:83`) + SSE `EventSource`/`fetch` (`api.ts:334`) do not pass `Authorization: Bearer`. | [`routes.py:443-473`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L443-L473), [`api.ts:334`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/lib/api.ts#L334), [`DraftTab.tsx:83`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/DraftTab.tsx#L83) |
| **P1** | **P1-4** | **`append_ledger_entry` hardcodes `org_id = 'org_chamber_a'`** and `blocks_draft: true` on overruled citations is not enforced on draft approval/export. | [`chain.py:81-82`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ledger/chain.py#L81-L82), [`routes.py:696-805`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/api/routes.py#L696-L805) |
| **P1** | **P1-5** | **UI Case Record document chips are non-interactive** (no remove button calling `api.removeDocument` and no extracted-text preview), and 11-tab bar has hidden scrollbars with no status badges. | [`Matter.tsx:237-296`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Matter.tsx#L237-L296) |
| **P2** | **P2-1** | Arbitrarily queried citations (`check_matter_citation` `else` branch) skip `kanoon_client.citedby()`, and `set_matter_draft_type` discards LLM paragraphs for boilerplate. | [`orchestrator.py:530-668`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/pipeline/orchestrator.py#L530-L668) |
| **P2** | **P2-2** | Session tokens have no `exp` expiration claim, no `/v1/auth/logout` endpoint, and password hashing uses static-salt SHA-256 instead of PBKDF2-HMAC-SHA256. | [`db.py:20-56`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/db.py#L20-L56) |
| **P2** | **P2-3** | Calibration reliability curve lacks axes/legend, and `Pipeline.tsx` shows pre-seeded stages as all `done` without indicating staleness if new evidence is attached. | [`ScoreTab.tsx:330-347`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/ScoreTab.tsx#L330-L347), [`Pipeline.tsx:81-110`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Pipeline.tsx#L81-L110) |
| **P3** | **P3-1** | Replace synthetic ML corpus, keyword proof matching, and `verify_citation_against_corpus` surname matching with InLegalBERT + real scraped judgments + OpenNyAI rhetorical roles (post-hackathon). | [`pull_judgments.py`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/ml/data/pull_judgments.py), [`ml/service.py:65`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/backend/app/ml/service.py#L65) |

---

## 6. Proposed Remediation Execution Order (Pending User Approval)

No application code has been modified in this audit phase. After review of all 5 audit documents, recommended execution order is:

1. **Batch 1 — Live Crash & State Recovery (P0-1, P0-4):**
   - Normalize Gemini `original` dict in `extract_facts` (`translation_confidence` coerced to `'high'|'medium'|'low'`).
   - Make `POST /v1/demo/reset` unconditionally re-seed `mat_001`–`mat_004`, seeded documents, seeded ledger entries, and reset `meta` cleanly.
   - Enforce RBAC blocks so `clerk` and `student` cannot call `DELETE /matters/{id}`, `DELETE /documents/{doc_id}`, `POST /ledger/tamper`, `POST /ml/retrain`, `POST /draft/type`, `POST /court`, or `POST /flags`.
2. **Batch 2 — Auth, Tenant RLS & Custody Security (P0-2, P0-3, P0-5, P1-3, P1-4, P2-2):**
   - Enforce `actor = _resolve_actor(...)` and `_get_matter_or_404(matter_id, actor=actor)` across **all 19 missing matter endpoints**, plus pass `actor["org_id"]` into `append_ledger_entry`.
   - Fix `POST /v1/auth/login` password bypass (require valid password unless explicit `demo_switch: true` on non-sensitive demo mode), add `exp` claim + `/v1/auth/logout`, stop mutating global `_ACTIVE_ROLE`/`_ACTIVE_USER_ID` on bearer requests, and pass `Authorization` headers in frontend SSE `fetch` + DOCX export `fetch`.
   - Remove plaintext file write in `upload_document` (parse PDF/DOCX from memory or temp file removed in `finally`, keeping only `.enc`), sanitize `Path(fname).name`, enforce max file size (e.g., 20 MB), and convert corrupt PDF/DOCX parse errors into HTTP `400`.
   - Enforce `blocks_draft: true` gate on senior `approve` / `export` unless explicitly overridden.
3. **Batch 3 — Functional Accuracy & UI/UX Polish (P1-1, P1-2, P1-5, P2-1, P2-3):**
   - Add `'Supreme Court of India'` and `'Civil Judge Senior Division, Mapusa'` to `COURT_HIERARCHY` (or align `ScoreTab.tsx` buttons with calibrated hierarchy).
   - Clear `stage_results` on document upload/delete so tabs reflect fresh evidence.
   - Wire `kanoon_client.citedby()` into `check_matter_citation` for arbitrary citations.
   - Apply non-invasive UI polish (calibration axes/legend, interactive Case Record chips, tab scroll indicators).
4. **Batch 4 — Re-Run Full Acceptance Suite & Demo Rehearsal (`docs/JUDGE_ACCEPTANCE_TESTS.md` + `docs/DEMO_RUNBOOK.md`).**

