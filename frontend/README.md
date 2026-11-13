# Frontend — Insaaf mobile app

**Owners**: @Shua-03, @sanidhyaLajurkar
**Stack (suggested)**: Expo + React Native + TypeScript + Expo Router. Swap freely if you prefer.

## Start here
1. Read [`../docs/WORK_PLAN.md`](../docs/WORK_PLAN.md): §3 (features), §9 (design references; not a fixed layout, use your own creativity), §10 (demo script).
2. Read [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).
3. Build every screen against [`mocks/`](mocks/) first, so you never wait on the backend. Add a single `USE_MOCKS` flag that swaps mocks for the real API.

Suggested init (in this folder, once the hackathon rules allow writing code):
```bash
npx create-expo-app@latest . --template tabs
```

## Screens to own

The demo moments are marked ⭐; polish those first.

| Screen | Feature | Mock |
|---|---|---|
| Login + org/role | F11 | — |
| Matter list (Nyaya Queue view) | F12 | `queue.json`, `matters.json` |
| New matter + upload (PDF/DOCX/voice) | F4 | — |
| ⭐ Live pipeline (stages light up, 8-s search ring) | F1, F3 | `pipeline_events.json`, `precedents.json` |
| Fact Cards (bilingual quote + source) | F4 | `facts.json` |
| Proof Ledger checklist | F5 | `proof_ledger.json` |
| Statute Clock countdown | F1 | `statute_clock.json` |
| ⭐ Draft with citation chips → source sheet | F8 | `draft.json` |
| ⭐ "Paste a citation" → Authority Lock rejects it | F8 | `verify_citation.json` |
| ⭐ Citation Health badges (green/amber/red) | F7 | `citation_health.json` |
| Insaaf B Score band + factor bars | F9, F10 | `score.json` |
| ⭐ Bias Firewall: 6 identities, flat line | F2 | `bias_firewall.json` |
| Settle-or-Fight | F6 | `advice.json` |
| Review / override with reason → ledger | F11, F13 | `ledger.json` |
| Retrain result | F13 | `retrain.json` |
| Law Change Radar (if time) | F14 | `law_changes.json` |

## Rules
- The app never holds API keys. It only calls our backend.
- Every screen needs loading, empty, error and offline states.
- Every legal conclusion shows its source snippet. If `sources` is empty, show **"No verified authority found."**
- Devanagari fonts for Konkani/Marathi/Hindi text.
- Mock files are shared with the backend. Changing one needs a backend review (see CODEOWNERS).
