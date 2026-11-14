# Live Demo Runbook (between slides 4 and 5, ~2.5 min)

The demo follows the same fictional matter as the deck: **`mat_001` Fernandes v. Naik**, a possession dispute over a plot in Mapusa (civil property). The full app runbook is [`../docs/DEMO_RUNBOOK.md`](../docs/DEMO_RUNBOOK.md); this file is the short version that matches the slides.

## Before you go on stage (30 min before)

```bash
backend/scripts/start_demo.sh
```

```bash
cd frontend && npm run build && npm run preview -- --port 4173
```

1. Run `curl -s localhost:8000/v1/health/deep`. `db`, `kanoon` and `llm` should all be `ok`.
2. Sign in as **Adv. Dhanshri** (`senior_1`). The password is in `backend/.demo_credentials`.
3. Open `http://localhost:4173/matters/mat_001` and skip the intro. **Don't reload during the demo.**
4. On the **Score & Bias Firewall** tab, the forum must read **Civil Judge Senior Division, Mapusa** and the band **Weak · 38%**. If it shows another court, click that forum button.
5. Keep a second tab open on `/precedents`.

## The 2.5 minutes

| Time | Do | Expect | Say |
|---|---|---|---|
| 0:00 | `/precedents` tab. Paste: *Agreement for sale and power of attorney but no registered sale deed; buyer claims possession of ancestral plot in Goa*. State: `Goa`. Press **Search Precedents**. | Results load in about 0.1 s: "20 matched / 1,463", outcomes 3 allowed / 13 dismissed, a Bombay HC card tagged "binding High Court for Goa". | "Plain-language facts in, binding Goa authority first, and the real outcome of every similar case." |
| 0:30 | On a result card, click **Read Paragraphs**. | A slide-over opens with the holding, the headnote and numbered paragraphs, plus an Indian Kanoon link. | "Every hit opens to the paragraph. Nothing is paraphrased away." |
| 0:50 | Switch to the `mat_001` tab and open **Score & Bias Firewall**. | Weak · 38%; blend 50 / 30 / 20; "12 similar judgments"; factor bars led by "Registered sale deed: missing −0.37". | "This is the PS 29 prediction, with the reasons behind it." |
| 1:15 | In the firewall grid, click **Religion: Muslim**, then **Caste: Dalit**. | Firewalled score Δ 0.00 for both; the unprotected comparison model shows −0.07. | "Identity can't move our score. If it moved more than 0.02, we'd withhold it." |
| 1:40 | Open **Draft**. In the Authority Lock box, type `Held in Imaginary Case (2099) 1 SCC 1` and click **Verify & Insert**. | "No verified authority found." | "A case that doesn't exist cannot enter the draft." |
| 1:55 | Type `Suraj Lamp & Industries v. State of Haryana` and click **Verify & Insert**. | "Verified against stored paragraph (… para 1)." | "The real one goes in, tied to its source." |
| 2:10 | Open **Advice**. | **Mediate**, with Lok Adalat and s.89 CPC eligible. | "Rules, not a chatbot, turn the evidence into a strategy." |
| 2:30 | Go back to the deck, slide 5. | | |

## If something breaks

| Problem | Fallback |
|---|---|
| Backend down or a red banner appears | Play `Insaaf_AI_3D_showreel.mp4`, then present slides 5 and 6. Every number on them is a real app response. |
| Indian Kanoon is slow | Search still runs on the local index of 1,463 judgments. Say "served from our index". |
| Gemini/LLM quota is exhausted | Seeded matters are pre-computed. Skip any new upload. |
| The score shows a different court | Click **Civil Judge Senior Division, Mapusa** under the forum buttons. |
| Network is dead | Everything above runs on localhost. The deck itself needs no network. |

> [!WARNING]
> **Avoid these:**
> - Re-running the pipeline on `mat_001` live (the band can change).
> - Reloading the page mid-demo (the intro replays).
> - Running `pytest` or `judge_acceptance.py` against the demo backend (it burns LLM quota).
