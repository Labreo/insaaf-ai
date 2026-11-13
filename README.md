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

## Ground rules

- Work in branches and open PRs into `main`. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **No secrets in git.** API keys go in `.env` (gitignored). The app never holds API keys; it only talks to our backend.
- **Never commit real client data.** Demo matters are fictional and labelled as such.
- Check the hackathon's pre-built-code rule before writing application code ahead of the event.
