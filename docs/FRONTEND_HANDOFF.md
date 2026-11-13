# Frontend Handoff: Insaaf AI (PS 29: precedent search and outcome prediction)

Branch: `be/full-stack`. Checkpoint commit: `1a50c06`. The backend owner keeps editing `backend/**` and `rules/**`. The frontend owner edits `frontend/**` only.

## 1. Architecture

- **Stack:** Vite + React 19 + TypeScript, Tailwind v4 via `@tailwindcss/vite`. There is no tailwind config: all design tokens live in `@theme` in `frontend/src/index.css`.
- **Routing:** `frontend/src/App.tsx`.
  - Public routes: `/` (Landing) and `/signup` (Signup).
  - Routes inside `components/Shell.tsx`: `/docket` (Home), `/matters/:id` (Matter), `/alerts`, `/ledger`, `/new`, `/me`.
- **State:** `frontend/src/lib/store.ts` is a tiny external store (`useDB(selector)`, `patchStore`, `bumpRev`).
  - It holds the session token (`localStorage: insaaf_token`), `me`, `matters`, `health`, `authModal` and `introNonce`.
  - `can(permission)` mirrors the server's RBAC.
- **API client:** `frontend/src/lib/api.ts` talks only to the backend, with no mocks. Every call goes through `authFetch` (Bearer token; a 401 clears the session; a 5xx sets `store.error`).
- **Types:** `frontend/src/lib/types.ts` mirrors `backend/app/models/schemas.py`.
- **Reference data:** `frontend/src/lib/meta.ts` provides `useMeta()`, which reads `GET /v1/meta` once. Helpers: `areaLabel`, `areaTag`, `languageLabel`, `instrumentLabel`.
  - **Never hardcode practice areas, languages or instruments.**
- **Feedback:** `lib/feedback.ts` and `components/Feedback.tsx` (toasts). Use these, not `alert()`.
- **Intro:** `frontend/src/intro/Intro.tsx` and `intro/Rays.tsx`.
  - It plays once per browser session.
  - `App.tsx` also replays it whenever `store.introNonce` changes; `playIntro()` is called after login, sign-up and account switch.
- **Sign-in:** `components/AuthModal.tsx` has an opaque backdrop and never pre-fills a password. `screens/Signup.tsx` creates a new chamber with the user as senior.
- **Matter workspace:** `screens/Matter.tsx`.
  - Tabs live in `screens/matter/*`: Pipeline, Facts, Proof, Clock, Precedents, Citations, ScoreTab, AdviceTab, DraftTab, Radar, LedgerTab.
  - Plus `ContextRail.tsx` and `components/ReviewDrawer.tsx` (edit / override / submit / approve).
- **Shared UI:** `components/primitives.tsx` (Card, Badge, Ring, Label, SourceChip, Skeleton, ErrorBanner, useAsync). Vendor components are in `components/ui/*` and `components/magicui/*`.

## 2. API contracts (all under `/v1`; Bearer token unless marked public)

Source of truth: `backend/app/api/routes.py` plus `backend/app/models/schemas.py`. The shapes listed here are the ones that changed.

### Auth and tenant

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/accounts` | Public. Demo account picker. No passwords. |
| POST | `/auth/login` | `{user_id \| email, password}` → `{token, expires_at, me}`. Each account has its own password, listed in `backend/.demo_credentials`. |
| POST | `/auth/signup` | Public. `{name, email, password(≥10), chamber_name, city?}` → `{token, expires_at, me}`. Returns 409 `email_taken` or 422 `weak_password`. |
| GET | `/org/members` | List members. |
| POST | `/org/members` | Senior only. `{name, email, role: junior\|clerk\|student}` → `{..., temporary_password}`. |
| GET | `/me` | Includes `permissions[]` and `org.members[]` (each with `user_id`, `email`). |
| GET | `/meta` | Public. `{areas: PracticeArea[], languages: [{code,label}], instruments: [{id,label,kind}]}`. 15 areas, 12 languages, 19 instruments. |
| GET | `/health/deep` | Public. `{precedent_index, web_sweep, llm, translation, db, model_version, index_size, llm_provider}`. The old `kanoon` / `bhashini` / `cache_hit_rate` fields are gone. |

### Matters

| Method | Path | Notes |
|---|---|---|
| GET | `/matters` | Each `Matter` has new fields: `state, district, court_seat, cause_date, client_name, opposite_party, summary, moot`. |
| GET | `/matters/{id}` | Voice documents carry `transcript: {language, original_text, english_translation, status: transcribed\|pending\|no_speech, has_audio}`. |
| POST | `/matters` | Accepts all the new fields. `case_type` and `client_language` are validated against `/meta` (422 otherwise). `cause_date` must not be in the future. |
| PATCH | `/matters/{id}` | Partial update. Senior/junior can edit everything. Clerks can edit only `forum_hint, client_language, state, district, court_seat, client_name, opposite_party` (`matter.edit_meta`). Editing area, forum, locality or `cause_date` invalidates the analysis. |
| POST | `/matters/{id}/language` | `{language}`. Re-translates every client statement and returns the `Matter`. |
| POST | `/translate` | `{text, source, target}` → `{text, engine, confidence}`. |
| POST | `/matters/{id}/documents` | Multipart. Accepts `.pdf .docx .txt .json .wav .mp3 .m4a .ogg .webm`. Audio is transcribed with Whisper and translated. |
| GET | `/matters/{id}/documents/{doc}/audio` | Audio bytes. Use `api.audioUrl()` to get an object URL. |
| POST | `/matters/{id}/documents/{doc}/transcribe` | Retries transcription. |

### Analysis

| Method | Path | Notes |
|---|---|---|
| GET | `/matters/{id}/statute-clock` | `StatuteClock`. `limitation_expires` and `days_left` can be **null**. `applicable=false` means the area has no fixed clock; show `note`. Also returns `total_days`, `limitation_years`, `today`, `cause_date_source: user\|document\|missing`, and `excluded_periods[].days` (the actual overlap). |
| POST | `/matters/{id}/statute-clock/recalculate` | `{cause_date, preview}`. `preview=true` changes nothing in the database. Returns 422 for a future, empty or more-than-60-years-old date. |
| GET | `/matters/{id}/precedents` | Each `results[]` item has `outcome` (allowed\|dismissed\|partly_allowed\|unknown), `locality` (why it ranks, e.g. "Bombay High Court at Goa: same bench as your forum") and `origin` (index\|web_sweep). The response also has `index_size, web_swept, query`. |
| POST | `/matters/{id}/precedents/search` | `{query}`. |
| GET | `/matters/{id}/score` | `Score` adds `probability`, `model_band`, `override {band, model_band, by, note, at}`. `court_aware.court` is now the matter's real forum name. |
| GET | `/matters/{id}/bias-firewall` | `rows[]` (10 identities): `{identity, label, score, delta, masked, unprotected_score, unprotected_delta, blocked}`. The response adds `max_unprotected_gap`, `comparison_model` (the label to display) and `masked_tokens_example`. `score/delta` is the firewalled model (Δ about 0). `unprotected_*` is the simulated biased model that shows what the firewall prevents. |
| GET | `/matters/{id}/advice` | Adds `model_recommendation`, `override {recommendation, model_recommendation, by, note, at}` and `based_on_band`. |

### Reviews and drafting

| Method | Path | Notes |
|---|---|---|
| POST | `/matters/{id}/reviews` | `action` is `approve\|edit\|override\|submit\|delete`. See the rules below this table. |
| GET | `/matters/{id}/draft` | `Draft` adds `generated_at, inputs_hash, stale, instructions` and **`rendered`** (a `RenderedDraft`). `rendered` holds court, title, subtitle, parties, opening, numbered `paragraphs[]` with sources, prayer, verification, place_date, signature, withheld[] and watermark. **Render the preview from `rendered`**; it is exactly what the DOCX and PDF contain. |
| POST | `/matters/{id}/draft/type` | `{draft_type, instructions?}`. `draft_type` is any instrument id from `/meta`. |
| POST | `/matters/{id}/draft/regenerate` | `{draft_type: "", instructions?}`. Rebuilds the current instrument from the latest analysis. |
| PATCH | `/matters/{id}/draft` | `{paragraph_id, text}` edits a paragraph; `text: null` deletes it. Needs `review.edit`. |
| GET | `/matters/{id}/draft/export?format=docx\|pdf` | Sends a `Content-Disposition` filename (`api.exportDraft` returns `{blob, filename}`). Returns 409 `citation_blocks_draft` if an overruled citation has no senior override. |

Rules for `POST /matters/{id}/reviews`:
- **Fact add:** `edit` with `target_id: "new"` requires a non-empty `note` (the statement).
- **Fact delete:** `{action:"delete", target:"fact", target_id}` (`review.edit`).
- **Score override:** requires `note` (the reason) and `diff.band` (strong\|moderate\|uncertain\|weak), or `diff.clear: true` to undo it. A score override re-derives the advice.
- **Advice override:** requires `note` and `diff.recommendation` (fight\|mediate\|settle\|plea_bargain), or `diff.clear: true`.

### Ledger, queue and radar

| Method | Path | Notes |
|---|---|---|
| POST | `/law-changes/scan` | `{text, offence_date?}`. Parses "IPC 420", "s.420 IPC", "u/s 406, 420 of the IPC", "Section 438 Cr.P.C.", "s.65B Evidence Act". Unknown sections come back as `replaced_by: "Not in crosswalk"`. |
| GET | `/ledger` | Unchanged. |
| GET | `/ledger/verify` | Unchanged. |
| POST | `/ledger/tamper` | Unchanged for now. A drill-detail response is coming (see "Coming next"). |
| GET | `/queue` | Unchanged. |
| GET | `/alerts` | Unchanged. |

**RBAC (`backend/app/auth.py`):**
- New permissions: `matter.edit` (senior, junior), `matter.edit_meta` (senior, junior, clerk), `org.manage` (senior).
- The frontend must gate every write button with `can()` and show a tooltip naming the role it needs.

### Coming next (being added by the backend owner now; build against these shapes)

| Method | Path | Notes |
|---|---|---|
| POST | `/precedents/search` | No matter needed; for the top-level Precedent Search screen. `{query, area?, state?, district?, court?, outcome?, limit?}` → `{results: PrecedentHit[], index_size, web_swept, outcome_stats: {allowed, dismissed, partly_allowed, unknown}, elapsed_ms}`. `PrecedentHit` = `{doc_id, title, court, seat, date, outcome, statutes[], headnote, locality, score, url, practice_areas[]}`. |
| GET | `/precedents/{doc_id}` | Full record plus key paragraphs `paras[{n,text}]`. |
| (extension) | `GET /matters/{id}/precedents` | Will add `outcome_stats` (the outcome split among the top similar judgments: the "how have courts ruled" signal for prediction). |
| (extension) | `POST /ledger/tamper` | Will return drill detail: `{tampered, broken_at, entry_id, stored_hash, recomputed_hash, merkle_root_before, merkle_root_after}`. |

## 3. Frontend tasks that can be delegated (no backend files touched)

1. **Palette:** remap the `@theme` tokens in `src/index.css` to the intro's night palette.
   - Canvas `#0a0b0e`, surface `#111318`, sunken `#0d0f13`, hover `#1a1d24`, lines `#23262e` / `#2e323b`.
   - Ink `#efede7` / `#a5a9b2` / `#6f7480`.
   - `navy-*` accents become gold `#c9a868` (600 `#b8955a`, 800 `#9c7f45`, 50/100 low-alpha gold).
   - Tune ok / warn / bad / info for contrast on dark.
   - Sweep hardcoded light hex values and `bg-white`.
   - Use `.gold-text` for display headings.
2. **Em-dash cleanup:** remove the excess "—" from UI copy across `src/**` (use a period, colon or "·").
3. **PS-29 information architecture and copy:**
   - Nav becomes Evaluate Case (Home), Precedent Search (new `screens/PrecedentSearch.tsx` on `POST /precedents/search`), Matters, Law Radar, Ledger. Docket and alerts move to a side panel.
   - Landing: "50M+ pending cases", target users, a pricing strip (advocate / firm / per-brief / law-school).
   - Replace every "Indian Kanoon" / "Kanoon" / "Bhashini" string with "Insaaf Precedent Index", "Live web sweep" and "Insaaf Translate". The remaining files are Landing.tsx, Pipeline.tsx, Precedents.tsx, DraftTab.tsx, primitives.tsx (`Open on Indian Kanoon` → `Open judgment`), LedgerScreen.tsx and NewMatter.tsx.
4. **NewMatter.tsx:** use the practice areas from `useMeta()` (a searchable grid grouped by `group`), languages from meta, and the new fields (state, district, court seat, cause date, client, opposite party, summary). Replace `alert()` with a toast. Extract `Recorder` into a shared component.
5. **Matter header:** editable fields via `PATCH /matters/{id}` gated by `can('matter.edit' | 'matter.edit_meta')`. The language chip becomes a dropdown that calls `api.setLanguage`.
6. **Facts.tsx:**
   - An Original / English toggle per statement, full language names, and an audio player using `api.audioUrl` for voice documents.
   - "Transcript pending: retry" calls `api.retranscribe`.
   - Add a voice-note Recorder (upload a `.webm`).
   - Add a **delete** button on facts (`review` with action `delete`).
   - Adding a fact must require text (no empty save-and-exit), and the new fact must show immediately.
7. **ContextRail.tsx:** make the upload `accept` include `.webm,.ogg,.m4a,.mp3,.wav`.
8. **DraftTab.tsx:**
   - Render from `draft.rendered`.
   - Instrument picker from `meta.instruments` limited to `area.instruments`.
   - A **Regenerate** button with an optional instructions box, and a stale badge when `draft.stale`.
   - Inline paragraph edit and delete via `api.editDraftParagraph`.
   - Export DOCX **and PDF**, with catch + toast and a readable 409 message.
   - Delete the dead `src/lib/docx.ts`.
9. **ScoreTab.tsx:**
   - Grouped bars per identity (unprotected Δ vs firewalled Δ), the ε line, and BLOCKED/PASS chips.
   - Show the `comparison_model` label and `masked_tokens_example`.
   - Baseline is not clickable. Fix the sparkline scale and use the server's `passed`.
   - Show `probability`. If `override` exists, show "Advocate assessment: X (model said Y), by N" with a Clear button.
10. **AdviceTab.tsx and ReviewDrawer.tsx:**
    - Score override: the drawer requires a band picker plus a reason.
    - Advice override: the drawer requires a route picker (eligible options) plus a reason.
    - Show the model's recommendation next to the advocate's, with a Clear button.
11. **Radar.tsx:** clicking an example sets the textbox and offence date, then runs the scan, so the prompt and the results show together. Show "Not in crosswalk" rows in neutral style.
12. **LedgerScreen.tsx:** reframe "Simulate tamper" as **"Integrity drill: simulate an insider DB edit"**.
    - Add an explainer modal. Once the backend detail lands, show the edited row, stored vs recomputed hash, the red break, and the Merkle root before/after. Then offer Restore.
    - Wording: "SHA-256 hash chain anchored to a Solana devnet blockhash timestamp". Do not say "stored on blockchain".
13. **Me.tsx:** a Team section (senior only) using `api.members` / `api.addMember`, showing the one-time password once.
14. **Hardcoded IDs:** remove `mat_001` from the Landing CTAs (link to the user's first matter instead) and replace the "Chamber A" strings with `me.org.name`.
15. **RBAC gaps:** gate the Pipeline Run button, Authority Lock verify, Add fact / Override, and Approve & Seal with `can()`.

## 4. Files the backend owner is editing (do not touch)

`backend/**`, `rules/**`, `ml/**`, `demo/seed/**`, and `docs/FRONTEND_HANDOFF.md`.

Already changed by the backend owner on the frontend in this checkpoint: `App.tsx`, `lib/{api,types,store,meta}.ts`, `components/AuthModal.tsx`, `screens/Signup.tsx`, `screens/matter/Clock.tsx` (already rewritten for the new clock contract), `ContextRail.tsx` (clock row), and the health fields in `Me.tsx` / `Landing.tsx`.
- From now on the frontend owner owns `frontend/**`.
- If a new API helper is needed in `lib/api.ts` / `lib/types.ts`, the frontend owner adds it.

## Run locally

```bash
cd backend && DEMO_MODE=true uvicorn app.main:app --port 8000
```

```bash
cd frontend && VITE_API_BASE=http://localhost:8000/v1 npm run dev
```

Demo passwords are in `backend/.demo_credentials` (generated on first start). `backend/.env` holds the Groq, Gemini and Serper keys (gitignored).

## Update (backend, after 86c6ab1)

- `POST /v1/precedents/search` and `GET /v1/precedents/{doc_id}` are **live**, with the shapes from "Coming next".
- `GET /matters/{id}/precedents` now includes `outcome_stats`.
- `POST /v1/ledger/tamper` now returns the drill detail: `{tampered, broken_at, entry_id, field, before, after, stored_hash, recomputed_hash, merkle_root_before, merkle_root_after, chain_valid, explanation}`.
- `GET /matters/{id}/events?live=true` forces a fresh live pipeline run. Without it, in `DEMO_MODE`, an already-analysed matter replays its cached stages with realistic pacing. Add a "Re-analyse live" button that uses `?live=true`.
