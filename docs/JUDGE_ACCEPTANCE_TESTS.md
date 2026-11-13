# Insaaf AI — Judge Acceptance Test Report

**Date:** 2026-11-13 · **Tester stance:** independent judge, black-box over HTTP plus a browser pass of the real UI · **Harness:** [`backend/scripts/judge_acceptance.py`](../backend/scripts/judge_acceptance.py) (re-runnable) · **Recovery tests:** [`backend/tests/test_acceptance_failures.py`](../backend/tests/test_acceptance_failures.py)

> [!IMPORTANT]
> **Verdict: READY WITH LIMITATIONS.** The seeded 3-minute demo and a fresh, unfamiliar matter both work end to end, all authentication/tenant/RBAC negative tests fail closed, and no P0 remains open. Two things keep this from a plain READY: the free-tier Gemini quota is a live, observed single point of degradation (see §6), and several claims must not be made (see [`DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md) §7). This pass also found and fixed real defects; they are listed honestly in §6.

## 1. How this was run

- A **clean copy of the repo with a fresh SQLite DB** was started on `:8100` so tests could not disturb the working demo database on `:8000`. Seeding ran from scratch (`backend/insaaf.db` absent), which also proved clean startup.
- The harness logs in through the real `/v1/auth/login`, drives the real endpoints (including the SSE pipeline), and reads SQLite directly to compare API output with stored rows.
- External services were **live**: Gemini (Gemini 2.5 family), Indian Kanoon (public HTML), SerpAPI. Bhashini has no key (Gemini fallback). Telegram was **not** fired.
- Negative tests run first, against the un-overridden seeded state.
- Final harness result on the fixed code: **72 PASS · 1 FAIL · 4 n/a** (1 fail = a live-quota health flag, §6).

## 2. Part 1 — Complete senior-advocate workflow (live backend)

| ID | Area | Probe | Expected | Observed | Verdict |
|---|---|---|---|---|---|
| P1.1 | Login | senior_1 + seeded password | 200 + token | token issued | **PASS** |
| P1.1b | Login | GET /me | role senior, Chamber A | senior / Chamber A — Goa | **PASS** |
| P1.2 | Nyaya Queue | GET /queue | ranked high->low, mat_001 first | ['mat_001', 'mat_002', 'mat_003'] priorities [0.62, 0.33, 0.25] | **PASS** |
| P1.3 | Matter | GET /matters/mat_001 | title, court, >=1 doc | Fernandes v. Naik — possession of plot, Mapusa (FICTIONAL) \| Civil Judge Senior Division, Mapusa \| 3 docs | **PASS** |
| P1.4 | Facts | GET /facts | cards with status + source; Konkani original kept, voice = alleged | 7 cards, statuses ['alleged', 'disputed', 'documented'], konkani cards 1 (['alleged']) | **PASS** |
| P1.5 | Proof Ledger | GET /proof-ledger | deterministic items, critical gap flagged | 5 items; missing=['Registered sale deed', 'Payment trail to seller'] | **PASS** |
| P1.6 | Pipeline | GET /events (SSE) on seeded mat_001 | 11 stages reach done, no failed | 23 events, done=11 in 33.5s, failed=[] | **PASS** |
| P1.7a | Precedents | GET /precedents | results with SourceRef, budget 8000 | 5 results; elapsed 1465ms budget 8000 | **PASS** |
| P1.7b | Precedents | POST /precedents/search custom query | <= budget, results with sources | 200, 5 results in 3.5s, cached=False | **PASS** |
| P1.8 | Source | open top precedent source | title, court, paragraph text, indiankanoon URL containing doc id | Suraj Lamp & Industries v. State of Haryana \| Supreme Court of India \| url=https://indiankanoon.org/doc/1565619/ \| snippet 480 chars | **PASS** |
| P1.8b | Source | snippet free of page chrome | no nav/menu text | In general, the measures are: (i) to amend Registration Act, 1908 by Amendment Act 48 of 2001 with e | **PASS** |
| P1.9a | Citations | GET /citations/health | overruled authority present and blocks draft | [('Suresh Kumar Koushal v. Naz Fo', 'overruled', True), ('Suraj Lamp & Industries v. Sta', 'followed', False), ('State Of Goa vs Sanjay Thakran', 'followed', False)] | **PASS** |
| P1.9b | Citations | check ADM Jabalpur | red/overruled, overruling case is a DIFFERENT case | red/overruled by=Justice K.S. Puttaswamy (Retd.) v. Union of India | **PASS** |
| P1.10a | AI-B score | GET /score | band, factors, held-out eval, court-aware block | band=uncertain eval=38/50 court=Civil Judge Senior Division, Mapusa | **PASS** |
| P1.10b | Court pooling | 4 UI courts each resolve to themselves, distinct pooled rate | 4 distinct | {'Civil Judge Senior Division, Mapusa': ('Civil Judge Senior Division, Mapusa', 0.461), 'District Court, North Goa': ('District Court, North Goa', 0.467), 'Bombay High Court (Goa bench)': ('Bombay High Court (Goa bench)', 0.493), 'Supreme Court of India': ('Su | **PASS** |
| P1.11 | Bias Firewall | GET + 5 live flips | 6 rows, all \|delta\|<=eps, passed | eps=0.02 passed=True deltas={'muslim': 0.0, 'dalit': 0.0, 'tribal': 0.0, 'female': 0.0, 'non_english_speaking': 0.0} | **PASS** |
| P1.11b | Bias Firewall | limitation (honesty) | classifier uses only structured features, not text | scores ignore party text by construction; the firewall proves masking + feature invariance, not fairness of a text model | n/a |
| P1.12a | Draft | GET /draft | paragraphs bound to sources; unsupported claim quarantined | 4 paras, 1 quarantined, watermark='AI-assisted draft — advocate review required' | **PASS** |
| P1.12b | Authority Lock | fake / real / misattributed holding | False / True / False | False / True / False | **PASS** |
| P1.13a | Advice | GET /advice | recommendation + reasons + sources | mediate conf=high | **PASS** |
| P1.13b | Statute Clock | recalc cause 2020-02-01 | COVID tolling 2020-03-15..2022-02-28 (+716d) -> expiry 2034-01-17 | expires 2034-01-17 excluded=[('2020-03-15', '2022-02-28')] | **PASS** |
| P1.14 | Review | junior submits; approve blocked (409) while overruled citations stand; senior overrides each with reason; approve succeeds | 200 / 409 / overrides 200 / 200 | 200 / 409 / [200, 200] / 200 | **PASS** |
| P1.15 | Audit ledger | GET /ledger + verify | valid chain, new entries present with actor/role | valid=True entries=6 last=senior_1/senior/approve linked=True | **PASS** |
| P1.16 | Persistence | API vs SQLite (facts, ledger rows) | identical to stored rows | facts match=True ledger rows=6 api entries=6 | **PASS** |

**Browser pass (real UI, `:5173` → live `:8000`, signed in as `senior_1`):** Nyaya Queue showed `mat_001` (62), `mat_002` (33), `mat_003` (25) with flags; the matter header, findings rail (7 fact cards, 2 critical proof gaps, 41 days left, 2 adverse precedents, 1 blocking citation, weak band, ledger hash chain verified) and the three case documents rendered from backend data. Rail values matched the API values in the table above.

> [!NOTE]
> P1.11b is not a failure but a limit you must state: the AI-B classifier is a logistic model over **structured features only** (deed present, stamp duty, possession, payment trail, limitation, precedent ratio, court prior). Party text never reaches it, so a Δ of 0.00 across identities is *guaranteed by design*. The firewall demonstrates identity masking and feature invariance; it does not demonstrate that a text model is fair.

## 3. Part 2 — Negative tests

| ID | Area | Probe | Expected | Observed | Verdict |
|---|---|---|---|---|---|
| N1 | Auth | empty password | 401 | 401 | **PASS** |
| N1b | Auth | missing password field | 401/422 | 401 | **PASS** |
| N1c | Auth | 5000-char password | 401/422 no crash | 401 | **PASS** |
| N2 | Auth | GET facts, no token | 401 | 401 | **PASS** |
| N2b | Auth | forged bearer token | 401 | 401 | **PASS** |
| N3 | Tenant | Chamber B token vs 17 Chamber A mat_001 routes | all 403/404 | leaks=none | **PASS** |
| N3b | Tenant | Chamber B deletes Chamber A matter | 403/404 | 404 | **PASS** |
| N3c | Tenant | Chamber B queue / matters list | no Chamber A ids | ['mat_004'] | **PASS** |
| N4 | Tenant | Chamber B deletes Chamber A document | 403/404 | 404 | **PASS** |
| N4b | Documents | guess static URLs for stored uploads/db/.env | none served (404/405) | {'/uploads/doc_pdf_01_agreement_of_sale_fictional.pdf': 404, '/static/uploads/x': 404, '/backend/uploads/x': 404, '/insaaf.db': 404, '/.env': 404} | **PASS** |
| N4c | Documents | download endpoint | no public download route exists | GET /documents/{id} -> 405 (the app has no document-download endpoint; only draft DOCX export) | **PASS** |
| N5 | RBAC | student deletes matter | 403 | 403 | **PASS** |
| N5b | RBAC | student tamper ledger | 403 | 403 | **PASS** |
| N5c | RBAC | junior retrain model | 403 | 403 | **PASS** |
| N5d | RBAC | junior demo reset | 403 | 403 | **PASS** |
| N6 | RBAC | junior senior-only approve | 403 | 403 | **PASS** |
| N6b | RBAC | junior override | 403 | 403 | **PASS** |
| N6c | RBAC | clerk edit fact | 403 | 403 | **PASS** |
| N6d | RBAC | student create matter | 403 | 403 | **PASS** |
| N6e | RBAC | in-session role switch | 403 | 403 | **PASS** |
| N7 | Citation gate | mat_001: 1 blocking citation(s) un-overridden -> export / approve | export 4xx and approve 4xx until overridden | export=409 approve=409 | **PASS** |
| N8 | Upload | malformed / hostile uploads | clean 4xx (never 500, never path escape) | {'corrupt pdf': 422, 'corrupt docx': 422, 'traversal name': 200, 'empty file': 400, 'exe binary': 415, 'invalid json audio': 422} | **PASS** |
| N8b | Upload | traversal wrote outside uploads/ | no file at backend/evil.txt or repo root | contained | **PASS** |
| N9 | Robustness | run pipeline on nonexistent matter | 404 | 404 | **PASS** |
| N9b | Robustness | invalid identity | 422 | 422 | **PASS** |
| N9c | Robustness | malformed cause date | 4xx not 500 | 422 | **PASS** |
| N9d | Robustness | empty precedent query | 4xx or empty result, not 500 | 200 | **PASS** |

## 4. Part 3 — Unfamiliar matter (not a preset)

A fictional civil-recovery matter ("D'Souza Boat Repairs v. Nair Fisheries", unpaid ₹2,75,000 marine-engine overhaul) was created and fed a generated PDF invoice, a DOCX intake note, then an acknowledgment letter. Fixtures live in [`demo/matters/live_upload_demo/`](../demo/matters/live_upload_demo/).

| ID | Area | Probe | Expected | Observed | Verdict |
|---|---|---|---|---|---|
| U0 | Fresh matter | create unfamiliar matter | 200 + id | 200 | **PASS** |
| U1 | Upload | fresh PDF invoice | 200, pages parsed | 200 {'id': 'doc_30e8bce4', 'name': 'dsouza_invoice_fictional.pdf', 'kind': 'pdf', 'size': 1250, 'added_at': '2026-11-13T17:03:45Z', 'document_id': 'doc_30e8bce4', 'pages': 1} | **PASS** |
| U1b | Upload | fresh DOCX intake note | 200 | 200 | **PASS** |
| U2 | Pipeline | 11-stage run on unfamiliar matter | all 11 stages done, no failure | 11 done in 30.2s, failed=[] | **PASS** |
| U3a | Facts | facts reflect the new documents (not a preset) | mentions engine/trawler/amount/dispute | 200; 5 cards; keyword hits ['turbocharger', 'engine', '2,75,000', 'trawler', 'nair', 'invoice', 'oral', 'dispute', 'overheat'] | **PASS** |
| U3b | Facts | uncertain claims not promoted to documented | dispute / unknown payment date marked disputed\|alleged\|unknown | statuses=['disputed', 'documented', 'unknown']; non-documented=['The specific date for the oral promise to pay for the services is unkn', 'Nair Fisheries disputes the quality of the turbocharger work and alleg'] | **PASS** |
| U3c | Facts | no leakage of seeded-matter content | none | none | **PASS** |
| U4a | Precedents | results returned for a new civil-recovery matter | >=1, within budget | 5 results ['Patil Automation Pvt. Ltd. v. Rakheja Engineers Pvt. Ltd.', 'Khark Petrochemical Company vs Hazel Mercantile Ltd', 'Rajendra Bhansali vs Anjana Explosive Limited', 'M/S. M.S.Metals & Steels Private Ltd vs M/S. G.K.Shelters Private Limited', 'M/S Mi | **PASS** |
| U4b | Precedents | not property-title canned results for a recovery dispute | no Suraj Lamp (title-deed case) for an invoice dispute | ['Patil Automation Pvt. Ltd. v. Rakheja Engineers Pvt. Ltd.', 'Khark Petrochemical Company vs Hazel Mercantile Ltd', 'Rajendra Bhansali vs Anjana Explosive Limited', 'M/S. M.S.Metals & Steels Private Ltd vs M/S. G.K.Shelters Private Limited', 'M/S Minocha Ente | **PASS** |
| U4c | Precedents | results topically relevant to unpaid-invoice recovery (title+snippet keyword check; crude) | >=3 of 5 plausible | 4/5 match; titles=['Patil Automation Pvt. Ltd. v. Rakheja Engineers Pvt. Ltd.', 'Khark Petrochemical Company vs Hazel Mercantile Ltd', 'Rajendra Bhansali vs Anjana Explosive Limited', 'M/S. M.S.Metals & Steels Private Ltd vs M/S. G.K.Shelters Private Limited', | **PASS** |
| U5a | Proof Ledger | distinguishes present vs missing evidence | invoice present; 'no written contract' note must NOT count as a contract | {'Written contract or purchase order': 'missing', 'Tax invoices and delivery challans': 'present', 'Statement of account / part-payment acknowledgment': 'missing', 'Pre-institution mediation compliance (s.12A)': 'missing'} | **PASS** |
| U5b | Proof Ledger | attach acknowledgment letter -> ledger and clock update | an item changes state; limitation extends from 12 Jun 2024 | upload=200; changed={'Statement of account / part-payment acknowledgment': ('missing', 'present')} | **PASS** |
| U5c | Statute Clock | clock reflects the new acknowledgment | expiry derived from document dates, not preset | expires=2027-06-12 source=document article=Limitation Act, 1963 — Schedule, Art. 19 / Art. 26 (3 yrs money recovery) days_left=211 | **PASS** |
| U6a | Draft | case names in unquarantined text all trace to a stored source | no invented case | cited=[] invented=[] | **PASS** |
| U6b | Draft | invented citation rejected on new matter | verified false | False | **PASS** |
| U7 | Honesty | draft carries watermark and quarantines unsupported claim | watermark 'AI-assisted…' and >=1 quarantine | watermark='AI-assisted draft — advocate review required' quarantined=1 | **PASS** |
| U8 | Advice | advice states confidence and reasons for new matter | recommendation + confidence | mediate conf=high | **PASS** |
| U9 | Score | score for new matter uses court override | court-aware block for Commercial Court, Panaji | Commercial Court, Panaji | **PASS** |
| U10 | Fixture dependence | features that rely on seeded fixtures | documented | Citation presets (ADM Jabalpur, Koushal, Suraj Lamp, Patil) use hard-wired doc ids; other citations go through live search + citator. Proof Ledger rules are per case_type (3 rule packs). LANDMARK_DOCS back-fill precedents offline. | n/a |

### Fixture dependence (honest list)

- **Citation health presets** (ADM Jabalpur, Koushal, Suraj Lamp, Patil Automation) resolve to hard-wired Indian Kanoon document ids. Any other citation goes through live search and a citator pass; it returns 404 if no judgment shares a party name.
- **Proof Ledger** is three YAML rule packs (property, civil recovery, criminal) with keyword detection. It is negation-aware now, but still keyword-based: an unusual phrasing of the same evidence can be missed. A new `case_type` is not possible.
- **Offline precedent fallback** uses `LANDMARK_DOCS` and the SQLite `kanoon_cache`; those are seeded fixtures.
- **Seeded matters** (`mat_001/002/004`) have hand-pinned limitation deadlines. Matters you create derive the deadline from dates found in their documents.
- **Not tested:** uploading an audio file (Konkani `.wav`) through the live Gemini transcription path. The seeded voice note is a pre-transcribed JSON.

## 5. Part 4 — Demo environment readiness

| ID | Area | Probe | Expected | Observed | Verdict |
|---|---|---|---|---|---|
| D1 | Accounts | 5 seeded role accounts log in | all True | {'senior_1': True, 'junior_1': True, 'clerk_1': True, 'student_1': True, 'senior_b': True} | **PASS** |
| D2 | Matters | 3 fictional Chamber A matters seeded | mat_001..003 | ['mat_002', 'mat_001', 'mat_003'] | **PASS** |
| D3 | Fixtures | demo document fixtures on disk | >=4 files | {'.gitkeep': 0, 'mat_002/shetty_traders_invoices_fictional.docx': 36994, 'mat_003/state_v_gaonkar_chargesheet_fictional.docx': 36960, 'mat_001/client_voice_note_kok.wav': 32044, 'mat_001/chamber_intake_notes_fictional.docx': 37089, 'mat_001/client_voice_note_k | **PASS** |
| D4 | Health | GET /health/deep | db/llm/kanoon ok | {'kanoon': 'ok', 'llm': 'degraded', 'bhashini': 'ok', 'db': 'ok', 'model_version': 'b-score-0.7', 'cache_hit_rate': 0.63} | **FAIL** |
| D5 | Integrations | live Gemini ping (direct) | 200 | skipped: GEMINI_API_KEY not exported to this shell; health/deep reports llm ok (shallow) | n/a |
| D6 | Integrations | indiankanoon.org reachable (direct HTML) | 200 | 200 | **PASS** |
| D7 | Integrations | Telegram dispatch | not exercised: would send a real message | configured in .env; NOT sent during acceptance run | n/a |

Also verified by `test_acceptance_failures.py`: with **all outbound network blocked** (Gemini, Kanoon, Bhashini), the pipeline still completes all 11 stages on deterministic fallbacks, facts are non-empty, the draft keeps its watermark and the Authority Lock still rejects an invented citation. `POST /v1/demo/reset` now also restores a baseline matter that was deleted (it did not before).

## 6. Defects found by this pass

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Draft export and approval were **not** blocked by an overruled citation although the UI says they are. | P1 | **Fixed.** Both return `409 citation_blocks_draft` until a senior records a reasoned override per citation (ledgered; a junior cannot lift it). |
| 2 | Corrupt PDF/DOCX/JSON, empty file and traversal filenames returned `500`; an `.exe` was accepted as text. | P1 | **Fixed.** Safe basename, type allow-list (`415`), 25 MB cap (`413`), empty `400`, unreadable `422`; no orphan files. |
| 3 | Malformed `cause_date` returned `500`. | P1 | **Fixed** (`422`). |
| 4 | Proof Ledger was negation-blind: "No written contract exists" marked **contract present**. | P1 (honesty) | **Fixed.** Negated mentions no longer count as evidence. |
| 5 | An acknowledgment letter ("we acknowledge the outstanding balance… undertake to pay") did not register as acknowledgment. | P2 | **Fixed** (rule keywords). |
| 6 | For a matter with no ISO date in its documents the clock silently used a hard-coded default and reported the limitation as **expired**. | P1 (honesty) | **Fixed.** Natural dates are parsed ("14 March 2024"); when none is found the API returns `cause_date_source: "default"` and the UI shows a "Cause date assumed — not verified" banner. |
| 7 | After the first pipeline run the clock was frozen to its own previous output and ignored later documents. | P1 | **Fixed** for non-seeded matters. |
| 8 | `POST /demo/reset` could not restore a deleted baseline matter (broke the runbook's recovery path). | P1 | **Fixed.** |
| 9 | Both Gemini API keys returned **429 RESOURCE_EXHAUSTED** after the acceptance and test runs. `/v1/health/deep` flipped to `llm: degraded`. | **P1 (demo risk)** | **Open — operational.** Seeded matters are pre-warmed and do not need Gemini; the live-upload scenario degrades to deterministic fallbacks (verified). Do not run the test suite or harness within hours of a demo. |

## 7. Remaining failures and risks

**P0:** none open.

**P1 (open):**
1. **Gemini free-tier quota** (finding 9). Mitigation is operational, not code: keep a spare key, run `DEMO_MODE=true`, avoid test runs before the demo.
2. **Uploads are stored in plaintext as well as encrypted.** `backend/uploads/` holds the raw file next to its `.enc` copy. Do not claim "encrypted at rest" (see runbook §7).

**P2 (open):** the backend test suite calls live Gemini (≈1–3 min, burns quota); precedent relevance beyond the top hit is keyword-level, not semantic; counterfactual invariance is not tested on reasoning text; Bhashini, Telegram delivery and Konkani audio upload were not exercised live; the JS bundle is 640 kB.

## 8. Automated results

- **Backend:** `pytest` in `backend/` — see §9 for the final count.
- **Frontend:** `npx tsc -b` — 0 errors. `npm run build` — success.
- **Harness:** 72 PASS / 1 FAIL / 4 n/a on a clean database.

## 9. Final test and build results

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd backend && python3 -m pytest -q` | **224 passed, 6 skipped** (6 are `--run-slow` live-stage tests), 3 min 26 s. Includes the P0 auth/tenant/RBAC suite, P1 reliability suite, and the new recovery/hardening tests. |
| Frontend types | `cd frontend && npx tsc -b` | **0 errors** |
| Production build | `cd frontend && npm run build` | **Success**, `index-*.js` 641 kB (gzip 194 kB); chunk-size warning only |
| Black-box harness | `python3 backend/scripts/judge_acceptance.py http://127.0.0.1:8100` (clean copy + fresh DB) | **72 PASS · 1 FAIL · 4 n/a** — the single FAIL is `D4` (`llm: degraded`, Gemini 429 quota exhausted by the run itself, §6 finding 9) |
| Live-UI spot check | Browser, `senior_1` | Queue, matter header, findings rail, documents, and the 409 approve-refusal message rendered from real backend responses |

## 10. Recommendation

**READY WITH LIMITATIONS.**

- **Ready for:** the three-minute seeded demo (all steps pass; seeded matters are pre-warmed and independent of Gemini), judge challenges on authentication, tenancy, RBAC, fabricated or misattributed citations and blocked drafts, and a fresh-matter test using the fixtures in `demo/matters/live_upload_demo/`.
- **Not claimed:** encryption at rest, fairness of a text model, validated outcome prediction, live Bhashini/Konkani speech recognition, or semantic precedent matching (full list in [`DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md) §7).
- **Conditions:** start with `backend/scripts/start_demo.sh` 30 minutes early; check `/v1/health/deep` and Gemini quota; do not run the test suite or harness before presenting; rehearse the override-then-approve sequence once in the UI.
- **Would flip to NOT READY if:** the live-upload challenge is promised on stage while Gemini is exhausted (it degrades to deterministic text, which is honest but visibly thinner), or if the encrypted-at-rest claim is made.

