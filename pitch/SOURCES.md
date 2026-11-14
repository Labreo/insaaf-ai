# Sources, Data Provenance and Credits

## External facts used on slides

| Claim (slide) | Source | Checked |
|---|---|---|
| 5,23,99,027 cases pending in district & subordinate courts (1) | National Judicial Data Grid, live dashboard, all-India view: <https://njdg.ecourts.gov.in/njdg_v3/> | 14 Nov 2026, screenshot not kept |
| Goa: 62,103 pending; 55.49% older than 1 year; 10,471 civil cases filed by senior citizens (1) | NJDG, Goa state view (`state_code=30~30`). Screenshot: [`sources/njdg_goa_2026-11-14.jpg`](sources/njdg_goa_2026-11-14.jpg) | 14 Nov 2026 |
| PS 29 wording, MVP "civil property", customers, revenue streams (3, 7) | Hackathon problem statement PDF, page 29 of 35 | 14 Nov 2026 |
| *Mata v. Avianca, Inc.*, S.D.N.Y. (22 June 2023): $5,000 sanction for fabricated citations (2) | Court order, widely reported | well-established |
| *Suraj Lamp & Industries v. State of Haryana* (SC, 11 Oct 2011): GPA/SA/Will "sales" don't transfer title (5, 6) | <https://indiankanoon.org/doc/1565619/>; stored paragraph returned by the app | 14 Nov 2026 |
| *Navtej Singh Johar v. UoI* (2018) overruled *Suresh Kumar Koushal v. Naz Foundation* (2013) (5) | Supreme Court of India | well-established |
| Lok Adalat award final, no appeal (6) | Legal Services Authorities Act 1987, s.21 (stored source returned by `/advice`) | 14 Nov 2026 |

> [!NOTE]
> An earlier brief quoted **63,494** pending in Goa as of 30 July 2026. I couldn't find a source for it, so the deck uses the live NJDG figure (**62,103**, 14 Nov 2026).

## Product numbers (from this repo / running app, 14 Nov 2026)

| Number | Where it comes from |
|---|---|
| 1,463 indexed judgments, 15 practice areas, 80 from Bombay HC at Goa | `ml/data/precedent_corpus.json` (judgment records) |
| "20 matched / 1,463, 109 ms", 3 allowed / 13 dismissed | `/precedents` search UI screenshot (`screenshots/03_search_results.png`) |
| Weak · 38%, blend 50/30/20, 3 of 12 similar granted, factor values | `GET /v1/matters/mat_001/score` with forum *Civil Judge Senior Division, Mapusa* |
| Proof Ledger: 2 missing · 1 weak · 2 present | `/proof-ledger` for `mat_001` (screenshot `10_mat001_proof.png`) |
| Authority Lock messages (3 cases) | `POST /v1/matters/mat_001/draft/verify-citation` |
| Bias Firewall: 0.38 for all 10 identities; unmasked 0.35–0.42 | `GET /v1/matters/mat_001/bias-firewall` |
| 38 / 50 held-out, Brier 0.152, calibration points | `ml/training/artifacts/model_meta.json` |
| Pricing ₹199 / ₹999 / ₹2,499 | `docs/WORK_PLAN.md` §12, labelled as hypotheses |

## Visual credits

| Asset | Credit / licence |
|---|---|
| 3D Scales-of-Justice monument, courtroom colonnade, paper storm, camera moves | Original scene by the team: procedural Three.js (`build/render3d/scene.js`), rendered headless. No stock, scanned or AI-generated imagery. |
| App screens on the 3D panels and slides | Real screenshots of the Insaaf AI app (`screenshots/`), fictional demo data |
| Mapusa street photo (slide 2) | "Mapusa, Goa, 2024" by Fredericknoronha, **CC BY-SA 4.0**, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Mapusa,_Goa,_2024.jpg) |
| Other Goa photos in `source_assets/photos/` (not used in the deck) | See `source_assets/photos/credits.json` |
| Brand mark | Redrawn from `frontend/public/icon.svg` |

The Gemini reference videos were used only as creative direction. None of their frames appear in the deck, because they carry watermarks.
