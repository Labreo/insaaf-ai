# Insaaf AI

> A mobile-first SaaS that automates the junior-lawyer workflow: client documents in, verified legal draft out. It searches precedents, scores the case with a model that has to pass a bias test, and records every reviewer decision in an audit trail.

**Hackathon**: PS 29 — legal case outcome prediction + semantic precedent search.
**Customers**: small law firms & chambers (monthly SaaS), law schools.

The full plan is in [`docs/WORK_PLAN.md`](docs/WORK_PLAN.md): features, timeline, real-world examples for the PPT, and a demo script. Read it first.

---

## Who owns what

| Area | Folder | Owners |
|---|---|---|
| Mobile app (Expo / React Native) | [`frontend/`](frontend/) | @Shua-03, @sanidhyaLajurkar |
| API, pipeline, Kanoon, ledger | [`backend/`](backend/) | @Labreo |
| Model training + eval | [`ml/`](ml/) | @Labreo |
| Legal rule packs (YAML) | [`rules/`](rules/) | Dhanshri (legal), reviewed by @Labreo |
| Demo matters + fixtures | [`demo/`](demo/) | everyone |
| Plan, API contract, decisions | [`docs/`](docs/) | everyone |

Frontend and backend meet at **one** file: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).
- Frontend builds against the JSON in [`frontend/mocks/`](frontend/mocks/), so it never waits for the backend.
- Backend's job is to return exactly those shapes.
- Changing the contract needs a PR approved by one person from each side.

## Repository layout

```text
insaaf-ai/
├── docs/                 # WORK_PLAN.md, API_CONTRACT.md
├── frontend/             # Expo app (FE team) + mocks/ that match the API contract
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routes
│   │   ├── pipeline/     # orchestrator + stages/ (intake, proof, clock, search, rag, citations, score, advice, draft)
│   │   ├── services/     # kanoon/, llm/, bhashini/, notify/ — the 4 external APIs
│   │   ├── rules_engine/ # evaluates rules/*.yaml (Proof Ledger, Statute Clock, Settle-or-Fight, Law Change)
│   │   ├── ml/           # model serving, Bias Firewall, Court-Aware pooling
│   │   ├── ledger/       # hash-chained Reviewer Ledger (+ optional Solana anchor)
│   │   └── models/       # pydantic schemas = API contract in code
│   └── tests/
├── ml/                   # data pull, labelling, training, eval (golden suite)
├── rules/                # legal rule packs in YAML, authored by the legal lead
└── demo/                 # fictional demo matters (PDF/DOCX/voice) + cached API responses
```

## Features (from the team notebook)

🔴 = build · 🔵 = build if time

| ID | Feature | Main owner |
|---|---|---|
| F1 🔴 | Whole pipeline (Matter → Verified Draft) + Statute Clock stage | BE + FE |
| F2 🔴 | Bias Firewall (6-identity flip test) | BE/ML |
| F3 🔴 | Time-Boxed Kanoon Search (50M → 20) | BE |
| F4 🔴 | Matter Intake + Bilingual Fact Card | BE + FE |
| F5 🔴 | Proof Ledger | Legal + BE |
| F6 🔴 | Settle-or-Fight Advisor | Legal + BE |
| F7 🔴 | Citation Health Check | BE |
| F8 🔴 | RAG pipeline + Authority Lock + confidence/snippet | BE |
| F9 🔴 | Insaaf AI-B Score (trained model) | ML |
| F10 🔴 | Court-Aware tuning | ML |
| F11 🔴 | Chamber Workspace (roles, encryption, hash-chained ledger) | BE + FE |
| F12 🔴 | Nyaya Queue (priority) | BE + FE |
| F13 🔴 | Disagreement → Retraining loop | ML + FE |
| F14 🔵 | Law Change Radar (IPC → BNS etc.) | Legal + BE |

## Evaluation & Calibration Benchmarks

### Golden Eval Suite (`ml/eval/golden_results.json`)

| Evaluation Axis | Result |
|---|---|
| Overall Golden Suite | **30 / 30 passed** |
| Authority Lock (rejection & exact-span match) | `10 / 10` |
| Citation Health & BNS/BNSS/BSA Transition Radar | `6 / 6` |
| Statute Clock & COVID-19 Suo Motu Exclusion | `4 / 4` |
| Bias Firewall (6-identity counterfactual flip) | `6 / 6` (`max_delta = 0.00`, threshold `ε = 0.02`) |
| Score & Settle-or-Fight Eligibility Alignment | `4 / 4` |

### Insaaf AI-B Score Held-Out Evaluation (`ml/training/artifacts/model_meta.json`)

- **Held-out Split**: `38 / 50` unseen cases correct (**76.0% accuracy**), **Brier score `0.152`** (train `190` / test `50`, LightGBM benchmark `0.1371` Brier).
- **Court-Aware Hierarchical Partial Pooling** ($\hat p_{\text{court}} = \frac{n \cdot \bar p_{\text{court}} + k \cdot \hat p_{\text{parent}}}{n + k}$, $k = 30$):
  - `District Court, North Goa` ($n = 12$, local `0.41`) → pools with `Bombay High Court (Goa bench)` (`0.49`) → **`0.467`**
  - `Commercial Court, Panaji` ($n = 19$, local `0.62`) → pools with `Bombay High Court (Goa bench)` (`0.54`) → **`0.571`**
  - `Bombay High Court (Goa bench)` ($n = 84$, local `0.49`) → pools with `Supreme Court of India` (`0.50`) → **`0.493`**
- **Empirical Calibration Bins (`prob_pred` → `prob_true`)**: `0.107 → 0.273`, `0.318 → 0.700`, `0.420 → 1.000`, `0.686 → 1.000`, `0.977 → 0.960`.
- **Model Card Limitation**: *Reported judgments over-represent contested and appealed cases; calibrated on 190 train / 50 held-out cases.*

## Ground rules

- Work in branches and open PRs into `main`. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **No secrets in git.** API keys go in `.env` (gitignored). The app never holds API keys; it only talks to our backend.
- **Never commit real client data.** Demo matters are fictional and labelled as such.
- Check the hackathon's pre-built-code rule before writing application code ahead of the event.
