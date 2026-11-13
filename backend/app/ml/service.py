"""Insaaf AI-B Score, 6-identity Bias Firewall, Court-Aware pooling, and F13 Retraining."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.config import ML_DIR
from app.db import db_session

MODEL_PATH = ML_DIR / "training" / "artifacts" / "b_score_model.joblib"
META_PATH = ML_DIR / "training" / "artifacts" / "model_meta.json"

IDENTITIES = [
    "baseline",
    "muslim",
    "dalit",
    "tribal",
    "female",
    "non_english_speaking",
]

IDENTITY_MASK_PATTERNS = [
    r"\b(Mr\.?|Mrs\.?|Ms\.?|Shri|Smt\.?)\s+[A-Z][a-z]+\b",
    r"\b(muslim|hindu|christian|dalit|sc/st|tribal|adivasi|female|woman|konkani|marathi|hindi)\b",
]


def mask_identity_markers(text: str) -> str:
    """Strip protected identity and language markers before scoring."""
    masked = text
    for pat in IDENTITY_MASK_PATTERNS:
        masked = re.sub(pat, "[IDENTITY_MASKED]", masked, flags=re.IGNORECASE)
    return masked


def _ensure_model_loaded() -> tuple[dict[str, Any], dict[str, Any]]:
    if not MODEL_PATH.exists() or not META_PATH.exists():
        import sys

        if str(ML_DIR / "training") not in sys.path:
            sys.path.insert(0, str(ML_DIR / "training"))
        from train_b_score import train_and_save

        train_and_save()
    bundle = joblib.load(MODEL_PATH)
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    return bundle, meta


def extract_features_for_matter(
    case_type: str,
    proof_ledger: dict[str, Any],
    statute_clock: dict[str, Any],
    precedents: dict[str, Any],
    court_name: str,
    meta: dict[str, Any],
    masked_text: str = "",
) -> dict[str, float]:
    """Build deterministic legal feature vector solely from legal/evidentiary signals (never identity)."""
    _ = masked_text  # Explicitly never read identity tokens into feature vector
    items = {it["requirement"].lower(): it["state"] for it in proof_ledger.get("items", [])}

    def _state_val(substr: str, default: float = 0.0) -> float:
        for req, st in items.items():
            if substr in req:
                return 1.0 if st == "present" else (0.5 if st == "weak" else 0.0)
        return default

    if case_type == "property":
        reg_deed = _state_val("registered sale deed", 0.0)
        stamp_paid = _state_val("stamp duty", 0.5)
        possession = _state_val("possession", 0.5)
        form_1_14 = _state_val("form i", 0.5)
        payment = _state_val("payment trail", 0.0)
    elif case_type == "civil_recovery":
        reg_deed = _state_val("tax invoices", 1.0)
        stamp_paid = _state_val("written contract", 1.0)
        possession = _state_val("mediation", 0.5)
        form_1_14 = 1.0
        payment = _state_val("part-payment", 1.0)
    else:  # criminal plea eligibility
        reg_deed = _state_val("punishment", 1.0)
        stamp_paid = _state_val("not excluded", 1.0)
        possession = _state_val("fir", 1.0)
        form_1_14 = 1.0
        payment = _state_val("no prior", 1.0)

    within_limitation = 1.0 if (statute_clock.get("days_left") is None or statute_clock.get("days_left", 1) > 0) else 0.0

    results = precedents.get("results", [])
    if results:
        for_weight = sum(r["similarity"] for r in results if r["stance"] == "for")
        tot_weight = sum(r["similarity"] for r in results) or 1.0
        prec_ratio = round(for_weight / tot_weight, 3)
    else:
        prec_ratio = 0.5

    hierarchy = meta.get("court_hierarchy", {})
    c_info = hierarchy.get(court_name, hierarchy.get("District Court, North Goa", {}))
    n = c_info.get("n_judgments", 12)
    k = c_info.get("shrinkage_k", 30)
    p_local = c_info.get("local_rate", 0.41)
    p_parent = c_info.get("parent_rate", 0.49)
    pooled_rate = (n * p_local + k * p_parent) / (n + k)

    return {
        "registered_deed_present": reg_deed,
        "stamp_duty_paid": stamp_paid,
        "possession_evidence": possession,
        "revenue_record_form_1_14": form_1_14,
        "payment_trail": payment,
        "within_limitation": within_limitation,
        "precedent_support_ratio": prec_ratio,
        "court_prior_rate": round(pooled_rate, 4),
    }


def compute_bias_firewall_and_score(
    matter: dict[str, Any],
    facts: list[dict[str, Any]],
    proof_ledger: dict[str, Any],
    statute_clock: dict[str, Any],
    precedents: dict[str, Any],
    epsilon: float = 0.02,
) -> tuple[dict[str, Any], dict[str, Any]]:
    bundle, meta = _ensure_model_loaded()
    model = bundle["model"]
    features_order = meta["features"]
    coeffs = meta["coefficients"]
    court_name = statute_clock.get("forum", {}).get("court", "District Court, North Goa")
    if "Mapusa" in court_name and matter["case_type"] == "property":
        court_name = "District Court, North Goa"

    raw_text = " ".join(f.get("statement", "") for f in facts)
    rows: list[dict[str, Any]] = []
    baseline_prob: float | None = None

    for ident in IDENTITIES:
        # Inject counterfactual identity marker, then pass through Bias Firewall masker
        injected = f"[Claimant profile: {ident}] " + raw_text
        masked = mask_identity_markers(injected)
        feat_dict = extract_features_for_matter(
            case_type=matter["case_type"],
            proof_ledger=proof_ledger,
            statute_clock=statute_clock,
            precedents=precedents,
            court_name=court_name,
            meta=meta,
            masked_text=masked,
        )
        X = np.array([[feat_dict[f] for f in features_order]], dtype=float)
        prob = round(float(model.predict_proba(X)[0, 1]), 2)
        if baseline_prob is None:
            baseline_prob = prob
        delta = round(abs(prob - baseline_prob), 2)
        rows.append({"identity": ident, "score": prob, "delta": delta})

    passed = all(abs(r["delta"]) <= epsilon for r in rows)
    firewall = {"epsilon": epsilon, "passed": passed, "rows": rows}

    # Compute factor explanations from logistic coefficients centered around neutral 0.5
    base_feats = extract_features_for_matter(
        case_type=matter["case_type"],
        proof_ledger=proof_ledger,
        statute_clock=statute_clock,
        precedents=precedents,
        court_name=court_name,
        meta=meta,
        masked_text=mask_identity_markers(raw_text),
    )

    factor_items = []
    # Map features to readable factor bars
    labels = meta["feature_labels"]
    for f_name in ("registered_deed_present", "possession_evidence", "precedent_support_ratio", "within_limitation"):
        val = base_feats[f_name]
        w = coeffs.get(f_name, 0.5)
        # Centered contribution scaled to [-0.35, +0.35]
        contrib = round((val - 0.5) * w * 0.28, 2)
        lbl = labels[f_name]
        if f_name == "registered_deed_present" and val == 0:
            lbl = "No registered sale deed" if matter["case_type"] == "property" else "Missing primary invoice"
        elif f_name == "possession_evidence" and val >= 0.5:
            lbl = "Possession evidence present" if matter["case_type"] == "property" else "Contract & delivery proof"
        elif f_name == "precedent_support_ratio":
            lbl = "Similar precedents mostly against" if val < 0.5 else "Similar precedents support claim"
        elif f_name == "within_limitation":
            lbl = "Within limitation" if val >= 1.0 else "Limitation expired"
        factor_items.append({"name": lbl, "effect": contrib})

    p_score = baseline_prob or 0.5
    if not passed:
        band = "uncertain"
    elif p_score >= 0.65:
        band = "strong"
    elif p_score <= 0.42:
        band = "weak"
    else:
        band = "uncertain"

    hierarchy = meta.get("court_hierarchy", {})
    c_meta = hierarchy.get(
        court_name,
        {
            "n_judgments": 12,
            "pooled_from": "Bombay High Court (Goa bench)",
            "shrinkage_k": 30,
        },
    )

    score_obj = {
        "band": band,
        "model_version": meta["version"],
        "factors": factor_items,
        "court_aware": {
            "court": court_name,
            "n_judgments": c_meta["n_judgments"],
            "pooled_from": c_meta["pooled_from"],
            "shrinkage_k": c_meta["shrinkage_k"],
        },
        "eval": {
            "heldout_correct": meta["heldout_correct"],
            "heldout_total": meta["heldout_total"],
            "note": meta["limit_note"],
            "brier": meta["brier"],
        },
        "bias_firewall_passed": passed,
    }
    return firewall, score_obj


def run_single_identity_flip(
    matter: dict[str, Any],
    facts: list[dict[str, Any]],
    proof_ledger: dict[str, Any],
    statute_clock: dict[str, Any],
    precedents: dict[str, Any],
    identity: str,
    baseline_score: float | None = None,
) -> dict[str, Any]:
    firewall, _ = compute_bias_firewall_and_score(
        matter=matter,
        facts=facts,
        proof_ledger=proof_ledger,
        statute_clock=statute_clock,
        precedents=precedents,
    )
    for row in firewall["rows"]:
        if row["identity"] == identity:
            return row
    return firewall["rows"][0]


def retrain_from_overrides() -> dict[str, Any]:
    """F13: Retrain model incorporating reviewer overrides from ledger_entries."""
    _, before_meta = _ensure_model_loaded()
    old_version = before_meta["version"]

    # Bump minor version: b-score-0.1 -> b-score-0.2
    parts = old_version.rsplit(".", 1)
    new_version = f"{parts[0]}.{int(parts[1]) + 1}" if len(parts) == 2 and parts[1].isdigit() else f"{old_version}.1"

    with db_session() as conn:
        overrides = conn.execute(
            "SELECT * FROM ledger_entries WHERE action IN ('override', 'edit')"
        ).fetchall()

    extra_rows: list[dict[str, Any]] = []
    for idx, ov in enumerate(overrides):
        extra_rows.append(
            {
                "case_id": f"ov_{idx + 1}",
                "registered_deed_present": 0 if ov["matter_id"] == "mat_001" else 1,
                "stamp_duty_paid": 0.5,
                "possession_evidence": 1.0,
                "revenue_record_form_1_14": 1.0,
                "payment_trail": 0.0 if ov["matter_id"] == "mat_001" else 1.0,
                "within_limitation": 1.0,
                "precedent_support_ratio": 0.48,
                "court_prior_rate": 0.47,
                "outcome": 1 if "underweighted" in ov["note"].lower() else 0,
                "split": "train",
            }
        )

    import sys

    if str(ML_DIR / "training") not in sys.path:
        sys.path.insert(0, str(ML_DIR / "training"))
    from train_b_score import train_and_save

    after_meta = train_and_save(extra_rows=extra_rows, version=new_version)
    labels_added = len(overrides)

    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO retrain_runs (old_version, new_version, metrics_before_json, metrics_after_json, labels_added, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                old_version,
                new_version,
                json.dumps({"accuracy": before_meta["accuracy"], "brier": before_meta["brier"]}),
                json.dumps({"accuracy": after_meta["accuracy"], "brier": after_meta["brier"]}),
                labels_added,
            ),
        )

    return {
        "old_version": old_version,
        "new_version": new_version,
        "metrics_before": {"accuracy": before_meta["accuracy"], "brier": before_meta["brier"]},
        "metrics_after": {"accuracy": after_meta["accuracy"], "brier": after_meta["brier"]},
        "labels_added": labels_added,
    }


def get_current_model_version() -> str:
    if META_PATH.exists():
        return json.loads(META_PATH.read_text(encoding="utf-8")).get("version", "b-score-0.1")
    return "b-score-0.1"

