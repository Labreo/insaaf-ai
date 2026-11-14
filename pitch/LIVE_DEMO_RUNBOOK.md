# Live Demo Runbook (~3 min, from the final slide)

The demo starts from the **sign-in page** so the judges see the full flow and our intro. Step-by-step actions, lines to say, expected results and a real screenshot of every step are in [`DEMO_FLOWS.md`](DEMO_FLOWS.md) and [`Insaaf_AI_Demo_Flows.pdf`](Insaaf_AI_Demo_Flows.pdf). Every step there was run end to end on 14 Nov 2026 (all flows passed).

## Before you go on stage (30 min before)

```bash
backend/scripts/start_demo.sh
```

```bash
cd frontend && npm run build && npm run preview -- --port 4173
```

1. `curl -s localhost:8000/v1/health/deep` → `db`, `llm`, `precedent_index` all `ok`.
2. Open http://localhost:4173/ and stay **signed out** (sign out if needed). Keep the window 1440–1600 px wide.
3. Keep `backend/.demo_credentials` open somewhere off-screen for the `senior_1` password.
4. If you rehearsed: reset the demo (re-run `start_demo.sh`, or `POST /v1/demo/reset`). Rehearsals leave mat_001 approved.
5. Optional live intake: have `pitch/demo_kit/` open in Finder.

## The 3 minutes

| Time | Flow | Do | Expect |
|---|---|---|---|
| 0:00 | A | Click **▶ Live demo · sign in** on slide 7 → **Sign in** → `senior_1` + password → **Sign in**. Stay quiet for the intro. | Intro (Lady Justice → Insaaf AI) → Chamber Docket / Nyaya Queue |
| 0:20 | A | Point at the queue. | |
| 0:30 | B | **Precedent Discovery** → paste the Socorro facts query, state `Goa` → **Search** → **Read Paragraphs**. | Results in well under a second; power of attorney ≠ title; paragraph reader |
| 1:00 | C | Open **Plot 7 purchaser v. Legal heir (Socorro)** → **Facts** → **Load Audio Player** (play the Konkani note) → **Proof Ledger**. | Voice plays; deed present, possession + payment missing |
| 1:40 | C | **Score & Bias Firewall** → click **Religion: Muslim**, **Caste: Dalit**. | Uncertain 61%; Δ 0.00 each |
| 2:10 | C | **Draft** → Authority Lock: fake case → twisted holding → real Suraj Lamp. | Refused, refused, verified |
| 2:40 | C | **Advice** → Settle. Close: "She has a registered deed, but a power of attorney can't pass a title the vendors never had. Insaaf tells her advocate that in minutes, with the law behind it." | Settle; Lok Adalat / s.89 CPC |
| 3:00 | — | "Thank you." | |

Extras if judges ask: **Flow D** live intake with `demo_kit/` (~1 min pipeline), **Flow E** roles and Chamber B isolation, **Flow F** ledger tamper drill, **Flow G** approval gate on the fictional Mapusa matter.

Right before going on stage, run `python3 pitch/build/scripts/run_flows.py H` (~2 min): it opens every matter, tab and voice note and fails on any error.

## If something breaks

| Problem | Fallback |
|---|---|
| Backend down / red banner | Play [`flows/demo_walkthrough.webm`](flows/demo_walkthrough.webm) (real recording of every flow) or [`Insaaf_AI_3D_showreel.mp4`](Insaaf_AI_3D_showreel.mp4); slides 5–7 show real app responses. |
| Intro doesn't play | You were already signed in: sign out, reload `/`, sign in again. |
| Score shows another court | Click **Civil Judge Senior Division, Mapusa** under the forum buttons. |
| LLM quota exhausted | Seeded matters are pre-computed; skip Flow D. |
| Network dead | Everything runs on localhost; the deck needs no network. |

> [!WARNING]
> Avoid during the demo: re-running the pipeline on mat_001, reloading mid-flow, and running `pytest` / `judge_acceptance.py` against the demo backend (burns LLM quota).
