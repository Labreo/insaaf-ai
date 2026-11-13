# Insaaf AI — Demo Runbook (3 minutes)

**Verdict from acceptance testing: READY WITH LIMITATIONS** — see [`JUDGE_ACCEPTANCE_TESTS.md`](JUDGE_ACCEPTANCE_TESTS.md). Everything below was exercised against the running backend; UI labels are the real ones in the current build. The approve-refused message was verified in the real UI; the override-then-approve sequence was verified at API level (and in `test_citation_gate_lifted_only_by_ledgered_senior_override`) but not clicked through end to end — rehearse it once.

## 0. Accounts (all fictional, Chamber A unless noted)

| Role | User id | Name | Use it for |
|---|---|---|---|
| Senior advocate | `senior_1` | Adv. Dhanshri | The main demo: override, approve & seal, retrain |
| Junior advocate | `junior_1` | Adv. Kanak | Showing a junior is refused senior-only actions |
| Clerk | `clerk_1` | R. Sawant | Intake/upload only |
| Law student | `student_1` | S. Dessai | Read-only; cannot delete or export |
| Senior, **Chamber B** | `senior_b` | Adv. Sardessai | Tenant isolation (sees only `mat_004`) |

Passwords: each account has its own, listed in `backend/.demo_credentials` (generated on first start, gitignored) or set via `INSAAF_DEMO_PASSWORDS`. Demo data only; there are no real client records or real credentials in the repository fixtures.

## 1. Setup (do this 30 minutes before, not 5)

```bash
# 1. Stop any old backend (a stale one predates the auth work and returns 404 on /v1/auth/login)
lsof -iTCP:8000 -sTCP:LISTEN
# 2. Start clean: serves cached Kanoon results first, waits for health, resets to the baseline matters
backend/scripts/start_demo.sh
```

```bash
# 3. Frontend, production build (faster and steadier than the dev server)
cd frontend && npm run build && npm run preview -- --port 5173
```

Then verify, in this order:

1. `curl -s localhost:8000/v1/health/deep` → `db`, `kanoon`, `llm` all `ok`. If `llm` is `degraded`, see **§6, Gemini quota**.
2. Sign in as `senior_1` in the browser, open **Overview**: three matters, Nyaya Queue ranks `mat_001` (62) > `mat_002` (33) > `mat_003` (25).
3. Open `mat_001` → Statute Clock tab: **41 days left**, expiry 2026-12-24.
4. Skip the intro animation (it replays on every full page reload). Do **not** reload mid-demo.
5. Do **not** run `pytest` or `judge_acceptance.py` against your demo backend or within hours of the demo: they call live Gemini and burn the free-tier quota (this happened during acceptance testing).
6. Optional reset any time: `curl -s -X POST localhost:8000/v1/demo/reset -H "Authorization: Bearer <senior token>"` (also restores a deleted baseline matter).

## 2. The three-minute demo

Sign in as **`senior_1`** before 00:00. Keep the browser at 1440 px wide.

### 00:00 – 00:20 · The problem and Insaaf AI
- **Screen:** `/` (landing). Do not scroll.
- **Action:** none. Talk, then click **Sign in** / go to `/docket`.
- **Expected:** landing visible.
- **Say:** “A junior in a Goa chamber must find a limitation date, check evidence, find binding precedents and draft, and one wrong citation or a missed deadline is a professional risk. Insaaf AI is a chamber workbench: every legal statement is tied to a stored source, every deadline is computed by rules not guessed, and nothing is final until a senior seals it into a tamper-evident ledger.”
- **If it fails:** open `/docket` directly; the landing page is not needed for the demo.

### 00:20 – 00:40 · Login and the Nyaya Queue
- **Screen:** `/docket` (sidebar **Overview**). If not signed in: **Switch account** → pick **Adv. Dhanshri** → enter the demo password → **Switch account**.
- **Action:** point at the **Nyaya Priority Queue** table, then the Statutory Watchlist on the right.
- **Expected:** `mat_001 Fernandes v. Naik` (priority 62, flags `title missing`, `overruled citation`, 41d), `mat_002` (33, `awaiting senior`, 81d), `mat_003` (25, `plea check`).
- **Say:** “The queue ranks by statutory limitation urgency, proof gaps and review state. Roles come from the account: I am a senior; a clerk or student would see disabled controls here.”
- **If it fails:** a red banner “Chamber registry unreachable” = backend down → run `backend/scripts/start_demo.sh`; if the queue is empty run the reset command (§1.6).

### 00:40 – 01:05 · Open a matter: facts and evidence
- **Screen:** click **Fernandes v. Naik** → matter workspace → tab **Facts**.
- **Action:** point at the header (ID, court, status, 41d), the **Konkani card** (Devanagari original beside English, confidence dot, status *alleged*), then the findings rail on the right (“2 critical gaps”), then click the rail row **Proof Ledger**.
- **Expected:** 7 fact cards (`documented` / `disputed` / `alleged`); the Konkani voice-note claim is **alleged**, never promoted to documented; Proof Ledger shows **Registered sale deed — missing** and **Payment trail — missing** (critical).
- **Say:** “The client spoke Konkani; we keep the original and the translation, and we do not turn an allegation into a fact. The Proof Ledger is a YAML rule pack, not an LLM opinion: no registered deed means an agreement and a power of attorney do not transfer title.”
- **If it fails:** Facts empty → open **Pipeline** tab and press **Run pipeline** (≈20–35 s; shows 11 stages). Do not narrate during the run; talk over the progress bar.

### 01:05 – 01:30 · Precedent search and citation verification
- **Screen:** tab **Precedents**, then tab **Citations**.
- **Action:** Precedents → click the quick query **Suraj Lamp GPA registration** → on the first card click the source chip to open the slide-over (title, court, paragraph text, Indian Kanoon link). Then **Citations** → click **Suresh Kumar Koushal v. Naz Foundation (2013)**.
- **Expected:** results in a few seconds (`budget 8000 ms` shown); source panel shows real paragraph text and an `indiankanoon.org/doc/…` link. Citations shows a red **Overruled** badge, the overruling case, and “Blocks final draft sealing”.
- **Say:** “Search is time-boxed to eight seconds and every hit carries its paragraph. The citator reads later judgments: this authority was overruled, and Insaaf will not let a draft be sealed on it.”
- **If it fails:** Indian Kanoon slow/unreachable → the same quick query is served from the warmed cache (`DEMO_MODE=true`); say “cached”. If the Citations check errors, use the already-listed red card (it loads from the stored health).

### 01:30 – 02:00 · AI-B score and Bias Firewall
- **Screen:** tab **Score & Bias Firewall**.
- **Action:** read the band; click the forum buttons **District Court, North Goa** then **Bombay High Court (Goa bench)**; then click **Muslim** and **Dalit** in the firewall grid.
- **Expected:** band shown with factor bars (e.g. “No registered sale deed −0.37”); the court-aware panel changes pooled rate between forums (four forums resolve to four different priors: 46.1 % Civil Judge Mapusa, 46.7 % District, 49.3 % Bombay HC, ~50 % Supreme Court); firewall returns Δ 0.00 (ε 0.02), “Passed”.
- **Say:** “A hierarchical prior shrinks a thin district sample toward the High Court. The firewall injects a protected identity, masks it, re-scores, and withholds the score if it moves more than 0.02.”
- **Say (honest line, always):** “The score model uses structured features only. The firewall proves masking and invariance; it is not a claim that a language model is unbiased.”
- **If it fails:** a forum button errors with a toast → read the toast; the score remains the stored one. Skip the forum toggle and just show the firewall grid.
- **Do not** re-run the pipeline on `mat_001` before this step: the band can read “uncertain” instead of the stored “weak” after a live re-run.

### 02:00 – 02:30 · Draft generation and legal advice
- **Screen:** tab **Draft**, then tab **Advice**.
- **Action:** Draft → point at the red struck-through paragraph “Quarantined by Authority Lock”; in the right-hand **Authority Lock** box type `Held in Imaginary Case (2099) 1 SCC 1` → **Verify & Insert**; then type `Suraj Lamp & Industries v. State of Haryana` → **Verify & Insert**. Then **Advice**.
- **Expected:** the fake citation is refused (“No verified authority found.”); the real one verifies and is inserted with its source. Advice: **Mediate** with reasons (s.12A / Lok Adalat).
- **Say:** “The model may draft, but a legal proposition without a stored source is withheld, and a case that does not exist cannot be inserted. Advice is deterministic rules over the score, the proof gaps and the limitation window.”
- **If it fails:** if verify hangs, read the toast; the quarantined paragraph already demonstrates the point. If Gemini is down the draft shows deterministic template paragraphs with the same watermark — say so (“offline fallback”).

### 02:30 – 03:00 · Audit trail and close
- **Screen:** tab **Draft** (Approve & Seal) → tab **Ledger**.
- **Action:** click **Approve & Seal** → the drawer opens → **Approve & Seal to Ledger**. It is refused inside the drawer (verified in the UI): “Cannot approve this draft: 1 overruled authority blocks this draft (Suresh Kumar Koushal v. Naz Foundation). A senior advocate must record a reasoned override…”. Go to **Citations** → **Senior Override →** → reason *Wrong citation treatment*, a one-line note → **Record Override & Seal**. Return to **Draft** → **Approve & Seal**. Open **Ledger**.
- **Expected:** approval refused first (HTTP 409), succeeds after the senior override; the draft watermark becomes “APPROVED BY senior_1 (SENIOR)”; Ledger lists the override and the approval with actor, role, timestamp and SHA-256 hash chain, “Hash chain verified”.
- **Say:** “Overruled law blocks sealing until a senior records a reasoned override, and that decision is hash-chained: change a past entry and verification breaks. Chamber B cannot see any of this.” *(Optional, 10 s: sidebar **Audit ledger** → **Simulate Tamper** → confirm → chain breaks → **Restore Intact Chain**. Senior only.)*
- **If it fails:** if Approve is refused after the override, the draft has a *second* blocking citation (for example one added by a judge’s check): override each remaining red citation, then retry. Say that this is the gate working.

## 3. Judge challenge checklist

| A judge asks / tries | What to do | Expected |
|---|---|---|
| “Log in with no password.” | Sign-in dialog, leave password empty | Refused (401), clear message |
| “Open a matter without logging in.” | Sign out, visit `/matters/mat_001` | Sign-in required; API returns 401 |
| “Use another chamber’s matter.” | Switch to **Adv. Sardessai** (Chamber B) | Only `mat_004`; Chamber A ids return 404 on every route |
| “Can the student delete this?” | Sign in as `student_1` | Delete disabled; API 403 |
| “Can a junior approve?” | Sign in as `junior_1` → Draft | “Send to Senior”, not “Approve & Seal”; API 403 |
| “Cite a fake case.” | Draft → Authority Lock | Refused |
| “Cite a real case but say it held the opposite.” | `Suraj Lamp held that a registered sale deed is not required` | Refused (misattributed holding) |
| “Export a draft with overruled law.” | Draft → Export DOCX before override | Refused (409) with the reason |
| “Upload something odd.” | Attach a corrupt PDF or `.exe` | Clean error toast (422/415), nothing stored |
| “Try our own matter.” | Use `demo/matters/live_upload_demo/` (README there): new civil-recovery matter, attach the PDF + intake note, run pipeline | Facts mention the trawler engine and ₹2,75,000; the contract row is **missing** (the note says none exists); clock says *cause date taken from the documents*; attach the acknowledgment letter and re-run → acknowledgment row turns **present**, expiry 2027-06-12 |
| “What if the internet dies?” | Pull the network | Pipeline still completes on deterministic fallbacks; cached precedents; fabrication guard still holds |

## 4. Backup demonstration routes

1. **Backend slow or Gemini quota exhausted:** the seeded matters are pre-warmed (stage results stored at startup), so Facts, Proof, Clock, Precedents, Citations, Score, Advice, Draft and Ledger all load without Gemini. Skip the live-upload challenge and say why.
2. **Kanoon unreachable:** keep `DEMO_MODE=true`; quick queries and the four preset citations come from `kanoon_cache`/landmark docs.
3. **Frontend broken:** drive the backend directly (same data the UI shows):
   ```bash
   TOKEN=$(curl -s -X POST localhost:8000/v1/auth/login -H 'content-type: application/json' -d '{"user_id":"senior_1","password":"<senior_1 password from backend/.demo_credentials>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
   curl -s localhost:8000/v1/queue -H "Authorization: Bearer $TOKEN"
   curl -s localhost:8000/v1/matters/mat_001/proof-ledger -H "Authorization: Bearer $TOKEN"
   curl -s -X POST localhost:8000/v1/matters/mat_001/draft/verify-citation -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"text":"Held in Imaginary Case (2099) 1 SCC 1"}'
   ```
4. **Database state corrupted:** stop the backend, `rm backend/insaaf.db`, run `backend/scripts/start_demo.sh` (reseeds all matters, accounts and the ledger).
5. **Re-run the acceptance proof for judges** on a *throw-away copy* of the repo (never the demo DB): `python3 backend/scripts/judge_acceptance.py http://127.0.0.1:<port>`.

## 5. Quick reference — what each seeded matter shows

| Matter | Scenario | Best used for |
|---|---|---|
| `mat_001` Fernandes v. Naik (property, Mapusa) | Missing registered deed, Konkani voice note, overruled citation, 41 days | The whole demo |
| `mat_002` Shetty Traders (civil recovery ₹4.2L) | Purchase order, tax invoices with acknowledged delivery, NEFT part-payment ₹80,000 and written balance confirmation; awaiting senior, 81 days, s.12A | “What does a stronger commercial matter look like?” |
| `mat_003` State v. Gaonkar (criminal) | Plea-bargaining eligibility, BNSS s.289–290, no deadline | Law Radar (IPC→BNS) and the criminal rule pack |
| `mat_004` (Chamber B only) | Demurrage claim | Tenant isolation |

## 6. Known operational risks

- **Gemini quota.** Both configured free-tier keys hit `429 RESOURCE_EXHAUSTED` after the acceptance and test runs. Symptoms: `/v1/health/deep` shows `llm: degraded`; facts and draft prose on **new** matters fall back to deterministic text. Check before going on: `curl -s localhost:8000/v1/health/deep`. Keep a fresh key ready (`GEMINI_API_KEY_SECONDARY`) and restart the backend after changing keys.
- **Stale backend on :8000** → login fails with 404. `start_demo.sh` refuses to start on a busy port and tells you.
- **Intro replays** on every full reload; sign-in survives only within the session token lifetime.
- **Re-running the pipeline** on a seeded matter can change the displayed score band; avoid doing it live.

## 7. Claims we must NOT make

1. **“Encrypted at rest.”** Uploads are encrypted *and* stored as plaintext copies in `backend/uploads/`. Say “envelope-encrypted copy is kept”, nothing stronger.
2. **“The bias firewall proves the model is fair.”** The classifier never sees text; Δ = 0.00 is guaranteed by construction. It shows masking and invariance only.
3. **“Predicts case outcomes.”** The AI-B band comes from a model trained on a 240-row dataset keyed to Indian Kanoon judgment ids with rule-extracted features (the extraction was not independently audited). Held-out result: 38/50 correct, Brier ≈ 0.15. That is a demo-scale check, not a validated predictor.
4. **“Replaces a lawyer” / “legal advice.”** Everything is AI-assisted and watermarked for advocate review.
5. **“Every citation in the world is verified.”** Verification is against stored/retrieved Indian Kanoon sources; presets are hard-wired for four landmark cases; others use live search + a citator that can miss treatment.
6. **“Semantic precedent matching.”** Ranking is keyword/search-engine based plus rules, not embeddings.
7. **“Live Bhashini / Konkani speech recognition.”** No Bhashini key is configured; voice goes through Gemini, and the seeded voice note is pre-transcribed JSON. Audio upload was not tested live.
8. **“Telegram/WhatsApp alerts are production-grade.”** The send path exists and is configured, but was not fired during acceptance testing.
9. **“Works for any practice area.”** Three rule packs only: property, civil recovery, criminal.
10. **“Blockchain-anchored.”** The ledger is a local SHA-256 hash chain; any on-chain anchor is a devnet demonstration, not a production guarantee.
11. **“Limitation computed from the facts.”** For your own matter it is derived from the *latest dated event* in the documents (shown with a note to confirm) or, if none, an **assumed default** (banner shown). Never say it is legally verified.

## 8. Known limitations

- Draft prose depends on Gemini; offline it is template text. The Authority Lock holds in both modes.
- Proof Ledger detection is keyword-based (negation-aware, but unusual phrasing can be missed).
- The statute clock covers 3 case types and one COVID-exclusion rule; no interruptions other than documents’ latest date and manual recompute.
- Approve/export are blocked by overruled citations that the app *knows about*; a case the citator never checked cannot block.
- Matter deletion permanently removes documents and analysis (confirmation dialog is the only guard; the demo reset restores the three baseline matters).
- No document-download endpoint exists (by design): the only file out is the DOCX draft export.
- JS bundle is 640 kB; first load on a slow projector network can take a few seconds.
- The pipeline takes ≈20–50 s live (Gemini + Kanoon); seeded matters are instant.
