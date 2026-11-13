# ML — Insaaf AI-B Score

**Owner**: @Labreo

| Folder | Holds |
|---|---|
| `data/` | scripts to pull judgments via Kanoon. Raw data stays out of git (see `.gitignore`); share it via drive. |
| `training/` | labelling (regex + LLM, then 100 checked by hand), features, model (LogReg / LightGBM + SHAP), calibration |
| `eval/` | golden suite (30 cases): fact-source accuracy, Authority Lock, citation treatment, Bias Firewall Δ, score accuracy + Brier + calibration plot |
| `notebooks/` | exploration only; anything that ships moves to `training/` |

Report real numbers with denominators ("correct on X of Y unseen cases"). Never write a claim like "95% legal accuracy".
