# ML — Insaaf AI-B Score

**Owner**: @Labreo

| Folder | Holds |
|---|---|
| `data/` | `pull_judgments.py` — live Indian Kanoon judgment pull + structured 240-case dataset (`190 train / 50 test`). Raw data stays out of git (see `.gitignore`). |
| `training/` | `train_b_score.py` — isotonic-calibrated Logistic Regression + LightGBM benchmark, court-aware hierarchical pooling, and feature factor weights (`artifacts/model_meta.json`). |
| `eval/` | `run_golden_eval.py` — 30-case golden evaluation suite covering Authority Lock, Citation Health, Law Change Radar, Statute Clock COVID exclusion, and 6-identity Bias Firewall (`eval/golden_results.json`). |
| `notebooks/` | exploration only; anything that ships moves to `training/` |

## Evaluation Results (Observed)

- **B-Score (`b-score-0.1`, isotonic-calibrated Logistic Regression)**:
  - Held-out accuracy: **correct on 38 of 50 unseen cases** (`0.760`)
  - Brier score: **`0.1527`**
  - LightGBM benchmark: `0.780` accuracy, `0.1333` Brier
- **30-Case Golden Suite (`ml/eval/golden_results.json`)**: **30 / 30 passed**
  - Authority Lock rejection & match: `10/10`
  - Citation Health & Law Change Radar: `6/6`
  - Statute Clock (incl. Supreme Court COVID exclusion `2020-03-15`–`2022-02-28`): `4/4`
  - Bias Firewall (6-identity counterfactual flip test): `6/6` (`max Δ = 0.00 ≤ ε = 0.02`)
  - Score band & Settle-or-Fight alignment: `4/4`

> **Honest limit**: Reported public judgments over-represent contested and appealed cases. All numbers carry exact denominators (`38/50`, `30/30`).
