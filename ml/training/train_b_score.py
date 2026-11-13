"""Train calibrated Insaaf AI-B Score model + LightGBM benchmark and save artifacts."""
from __future__ import annotations

import json
from pathlib import Path
import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, accuracy_score
from lightgbm import LGBMClassifier

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT.parent / "data" / "judgments_dataset.json"
ARTIFACTS_DIR = ROOT / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "b_score_model.joblib"
META_PATH = ARTIFACTS_DIR / "model_meta.json"

FEATURES = [
    "registered_deed_present",
    "stamp_duty_paid",
    "possession_evidence",
    "revenue_record_form_1_14",
    "payment_trail",
    "within_limitation",
    "precedent_support_ratio",
    "court_prior_rate",
]

FEATURE_LABELS = {
    "registered_deed_present": "Registered sale deed",
    "stamp_duty_paid": "Stamp duty paid",
    "possession_evidence": "Possession evidence",
    "revenue_record_form_1_14": "Form I & XIV record",
    "payment_trail": "Payment trail",
    "within_limitation": "Within limitation",
    "precedent_support_ratio": "Precedent alignment",
    "court_prior_rate": "Court-level baseline",
}

COURT_HIERARCHY = {
    "District Court, North Goa": {
        "n_judgments": 12,
        "local_rate": 0.41,
        "pooled_from": "Bombay High Court (Goa bench)",
        "parent_rate": 0.49,
        "shrinkage_k": 30,
    },
    "Commercial Court, Panaji": {
        "n_judgments": 19,
        "local_rate": 0.62,
        "pooled_from": "Bombay High Court (Goa bench)",
        "parent_rate": 0.54,
        "shrinkage_k": 30,
    },
    "Bombay High Court (Goa bench)": {
        "n_judgments": 84,
        "local_rate": 0.49,
        "pooled_from": "Supreme Court of India",
        "parent_rate": 0.50,
        "shrinkage_k": 30,
    },
    "Judicial Magistrate First Class, Mapusa": {
        "n_judgments": 24,
        "local_rate": 0.55,
        "pooled_from": "Bombay High Court (Goa bench)",
        "parent_rate": 0.52,
        "shrinkage_k": 30,
    },
}


def train_and_save(extra_rows: list[dict] | None = None, version: str = "b-score-0.1") -> dict:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    rows = json.loads(DATA_PATH.read_text())
    if extra_rows:
        rows.extend(extra_rows)

    train_rows = [r for r in rows if r.get("split", "train") == "train"]
    test_rows = [r for r in rows if r.get("split") == "test"]

    X_train = np.array([[r[f] for f in FEATURES] for r in train_rows], dtype=float)
    y_train = np.array([r["outcome"] for r in train_rows], dtype=int)
    X_test = np.array([[r[f] for f in FEATURES] for r in test_rows], dtype=float)
    y_test = np.array([r["outcome"] for r in test_rows], dtype=int)

    base_lr = LogisticRegression(C=1.5, max_iter=1000, random_state=42)
    base_lr.fit(X_train, y_train)

    calibrated = CalibratedClassifierCV(LogisticRegression(C=1.5, max_iter=1000, random_state=42), method="isotonic", cv=5)
    calibrated.fit(X_train, y_train)

    lgbm = LGBMClassifier(n_estimators=60, max_depth=3, learning_rate=0.08, random_state=42, verbose=-1)
    lgbm.fit(X_train, y_train)

    probs_lr = calibrated.predict_proba(X_test)[:, 1]
    preds_lr = (probs_lr >= 0.5).astype(int)
    acc_lr = float(accuracy_score(y_test, preds_lr))
    brier_lr = float(brier_score_loss(y_test, probs_lr))
    heldout_correct = int((preds_lr == y_test).sum())
    heldout_total = int(len(y_test))

    probs_lgbm = lgbm.predict_proba(X_test)[:, 1]
    brier_lgbm = float(brier_score_loss(y_test, probs_lgbm))
    acc_lgbm = float(accuracy_score(y_test, (probs_lgbm >= 0.5).astype(int)))

    prob_true, prob_pred = calibration_curve(y_test, probs_lr, n_bins=5, strategy="uniform")

    bundle = {
        "model": calibrated,
        "base_lr": base_lr,
        "features": FEATURES,
        "version": version,
    }
    joblib.dump(bundle, MODEL_PATH)

    meta = {
        "version": version,
        "features": FEATURES,
        "feature_labels": FEATURE_LABELS,
        "coefficients": {f: round(float(c), 4) for f, c in zip(FEATURES, base_lr.coef_[0])},
        "intercept": round(float(base_lr.intercept_[0]), 4),
        "heldout_correct": heldout_correct,
        "heldout_total": heldout_total,
        "accuracy": round(acc_lr, 4),
        "brier": round(brier_lr, 4),
        "lgbm_benchmark": {"accuracy": round(acc_lgbm, 4), "brier": round(brier_lgbm, 4)},
        "calibration": {
            "prob_true": [round(float(x), 4) for x in prob_true],
            "prob_pred": [round(float(x), 4) for x in prob_pred],
        },
        "court_hierarchy": COURT_HIERARCHY,
        "limit_note": "Reported judgments over-represent contested and appealed cases; calibrated on 190 train / 50 held-out cases.",
    }
    META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"Trained {version}: held-out {heldout_correct}/{heldout_total} ({acc_lr:.3f}), Brier={brier_lr:.4f} | LGBM acc={acc_lgbm:.3f}, Brier={brier_lgbm:.4f}")
    return meta


if __name__ == "__main__":
    train_and_save()

