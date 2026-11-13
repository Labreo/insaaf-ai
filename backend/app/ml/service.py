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
    "christian",
    "dalit",
    "tribal",
    "obc",
    "female",
    "transgender",
    "non_english_speaking",
    "rural_migrant",
]

IDENTITY_LABELS = {
    "baseline": "Baseline (no identity marker)",
    "muslim": "Religion: Muslim",
    "christian": "Religion: Christian",
    "dalit": "Caste: Scheduled Caste (Dalit)",
    "tribal": "Scheduled Tribe (Adivasi)",
    "obc": "Caste: Other Backward Class",
    "female": "Gender: Woman",
    "transgender": "Gender: Transgender",
    "non_english_speaking": "Language: non-English speaker",
    "rural_migrant": "Region: rural migrant worker",
}

# Logit offsets injected into the synthetic training labels of the *unprotected* comparison model.
# They stand in for the disparities documented in Indian legal-AI bias studies; the model that
# learns them is shown next to the firewalled model so the demo has a real contrast.
SIMULATED_HISTORICAL_BIAS = {
    "baseline": 0.0, "muslim": -0.85, "christian": -0.35, "dalit": -1.05, "tribal": -0.95, "obc": -0.4,
    "female": -0.55, "transgender": -0.9, "non_english_speaking": -0.6, "rural_migrant": -0.7,
}

IDENTITY_MASK_PATTERNS = [
    r"\b(Mr\.?|Mrs\.?|Ms\.?|Shri|Smt\.?|Kum\.?|Begum|Sardar)\s+[A-Z][a-z]+\b",
    # religion
    r"\b(muslims?|islamic|hindus?|christians?|catholic|sikhs?|jains?|buddhists?|parsis?|jewish|jews?)\b",
    # region / migration
    r"\b(rural[\s_-]?migrants?|migrants?|rural)\b",
    # caste / tribe
    r"\b(dalits?|sc/st|scheduled\s+(?:caste|tribe)s?|obc|other\s+backward\s+class(?:es)?|tribals?|adivasis?|bahujan|brahmins?|harijans?)\b",
    # gender
    r"\b(female|male|woman|women|man|men|widow|transgender|gender)\b",
    # language / literacy (incl. underscore and hyphen spellings used by the counterfactual profiles)
    r"\b(non[\s_-]?english[\s_-]?speaking|non[\s_-]?english|konkani|marathi|hindi|kannada|urdu|illiterate)\b",
]


def _identity_leaked(identity: str, masked_text: str) -> bool:
    """True if any spelling of a counterfactual identity survived masking."""
    lowered = masked_text.lower()
    forms = {identity, identity.replace("_", " "), identity.replace("_", "-")}
    return any(re.search(rf"\b{re.escape(f)}\b", lowered) for f in forms)


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
    # F10: artifacts trained before a court was added lack its prior; merge the
    # canonical hierarchy so every forum offered in the UI resolves to itself.
    hierarchy = meta.setdefault("court_hierarchy", {})
    for name, info in _canonical_court_hierarchy().items():
        hierarchy.setdefault(name, info)
    return bundle, meta


def _canonical_court_hierarchy() -> dict[str, Any]:
    import sys

    if str(ML_DIR / "training") not in sys.path:
        sys.path.insert(0, str(ML_DIR / "training"))
    from train_b_score import COURT_HIERARCHY

    return COURT_HIERARCHY


def extract_features_for_matter(
    case_type: str,
    proof_ledger: dict[str, Any],
    statute_clock: dict[str, Any],
    precedents: dict[str, Any],
    court_name: str,
    meta: dict[str, Any],
    masked_text: str = "",
) -> dict[str, float]:
    """Build deterministic legal feature vector solely from legal/evidentiary signals (never identity).

    The five evidentiary slots are filled from the proof-ledger requirements named for the
    practice area in rules/practice_areas.yaml (ml_slots); unknown requirements count as 0.5.
    """
    _ = masked_text  # Explicitly never read identity tokens into feature vector
    from app import registry

    items = {it["requirement"].lower(): it["state"] for it in proof_ledger.get("items", [])}

    def _state_val(substr: str, default: float = 0.5) -> float:
        for req, st in items.items():
            if substr in req:
                return 1.0 if st == "present" else (0.5 if st == "weak" else 0.0)
        return default

    slots = list(registry.area(case_type).get("ml_slots", []))[:5]
    slots += [""] * (5 - len(slots))
    reg_deed, stamp_paid, possession, form_1_14, payment = (_state_val(sl) if sl else 0.5 for sl in slots)

    dl = statute_clock.get("days_left")
    within_limitation = 1.0 if (dl is None or dl > 0) else 0.0

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
    court_override: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    bundle, meta = _ensure_model_loaded()
    model = bundle["model"]
    features_order = meta["features"]
    coeffs = meta["coefficients"]
    display_court = court_override or statute_clock.get("forum", {}).get("court") or matter.get("forum_hint") or "District Court"
    court_name = display_court
    hierarchy = meta.get("court_hierarchy", {})
    if court_name not in hierarchy:
        if "Supreme" in court_name:
            court_name = "Supreme Court of India"
        elif "Civil Judge" in court_name:
            court_name = "Civil Judge Senior Division, Mapusa"
        elif "Commercial" in court_name or "Panaji" in court_name:
            court_name = "Commercial Court, Panaji"
        elif "High Court" in court_name or "Bombay" in court_name:
            court_name = "Bombay High Court (Goa bench)"
        elif "Magistrate" in court_name or "JMFC" in court_name:
            court_name = "Judicial Magistrate First Class, Mapusa"
        else:
            court_name = "District Court, North Goa"

    c_meta = corpus_court_prior(display_court, matter.get("case_type", ""), matter.get("state") or "")
    if c_meta is None:  # empty corpus: fall back to the trained artifact's hand-set hierarchy
        c_meta = hierarchy.get(court_name, {"n_judgments": 12, "local_rate": 0.41, "pooled_from": "Bombay High Court (Goa bench)", "parent_rate": 0.49, "shrinkage_k": 30})
    n_j = c_meta.get("n_judgments", 12)
    k_sh = c_meta.get("shrinkage_k", 30)
    p_local = c_meta.get("local_rate", 0.41)
    p_parent = c_meta.get("parent_rate", 0.49)
    pooled_rate = round((n_j * p_local + k_sh * p_parent) / (n_j + k_sh), 3)

    raw_text = " ".join(f.get("statement", "") for f in facts)
    empirical, emp_n, emp_allowed = _empirical_rate(precedents)
    rows: list[dict[str, Any]] = []
    baseline_prob: float | None = None

    baseline_feats: dict[str, Any] | None = None
    invariant = True
    for ident in IDENTITIES:
        # Inject counterfactual identity marker, then pass through Bias Firewall masker
        injected = f"[Claimant profile: {ident}] " + raw_text
        masked = mask_identity_markers(injected)
        # F2: the flip is only meaningful if the marker never reaches the model. Fail closed on a leak.
        leaked = ident != "baseline" and _identity_leaked(ident, masked)
        feat_dict = extract_features_for_matter(
            case_type=matter["case_type"],
            proof_ledger=proof_ledger,
            statute_clock=statute_clock,
            precedents=precedents,
            court_name=court_name,
            meta=meta,
            masked_text=masked,
        )
        if baseline_feats is None:
            baseline_feats = feat_dict
        elif feat_dict != baseline_feats:
            invariant = False  # any feature drift across identities is a firewall breach
        X = np.array([[feat_dict[f] for f in features_order]], dtype=float)
        prob = _blend(float(model.predict_proba(X)[0, 1]), empirical, pooled_rate)
        if baseline_prob is None:
            baseline_prob = prob
        delta = round(abs(prob - baseline_prob), 2)
        un = _unprotected_score(feat_dict, features_order, ident, pooled_rate, empirical)
        rows.append({
            "identity": ident, "label": IDENTITY_LABELS.get(ident, ident), "score": prob, "delta": delta, "masked": not leaked,
            "unprotected_score": un,
        })
    un_base = rows[0]["unprotected_score"]
    for r in rows:
        r["unprotected_delta"] = round(r["unprotected_score"] - un_base, 2)
        r["blocked"] = abs(r["unprotected_delta"]) > epsilon  # what the firewall prevented

    passed = invariant and all(abs(r["delta"]) <= epsilon and r["masked"] for r in rows)
    firewall = {
        "epsilon": epsilon,
        "passed": passed,
        "rows": rows,
        "max_unprotected_gap": round(max(abs(r["unprotected_delta"]) for r in rows), 2),
        "comparison_model": "Simulated historical-bias model (demo): same features plus identity markers, trained on synthetic data with injected disparities.",
        "masked_tokens_example": mask_identity_markers("[Claimant profile: Dalit woman, Konkani speaking] " + raw_text[:160]),
    }

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
    from app import registry

    slot_names = list(registry.area(matter["case_type"]).get("ml_slots", []))[:5]
    reqs = [it["requirement"] for it in proof_ledger.get("items", [])]

    def _req_for(substr: str) -> str:
        return next((r for r in reqs if substr and substr in r.lower()), substr.title() if substr else "Evidence")

    slot_feats = ["registered_deed_present", "stamp_duty_paid", "possession_evidence", "revenue_record_form_1_14", "payment_trail"]
    for f_name, slot in list(zip(slot_feats, slot_names))[:3]:
        val = base_feats[f_name]
        w = coeffs.get(f_name, 0.5)
        req = _req_for(slot)
        lbl = f"{req}: on record" if val >= 1.0 else (f"{req}: weak" if val >= 0.5 else f"{req}: missing")
        factor_items.append({"name": lbl, "effect": round((val - 0.5) * w * 0.28, 2)})
    for f_name in ("precedent_support_ratio", "within_limitation"):
        val = base_feats[f_name]
        w = coeffs.get(f_name, 0.5)
        if f_name == "precedent_support_ratio":
            lbl = "Similar precedents mostly against" if val < 0.5 else "Similar precedents support the claim"
        else:
            lbl = "Within limitation" if val >= 1.0 else "Limitation expired"
        factor_items.append({"name": lbl, "effect": round((val - 0.5) * w * 0.28, 2)})

    if emp_n:
        factor_items.append({
            "name": f"Similar judgments: {emp_allowed:g} of {emp_n} granted relief",
            "effect": round((empirical - 0.5) * 0.7, 2),
        })
    factor_items.append({
        "name": f"Court baseline ({display_court})",
        "effect": round((pooled_rate - 0.5) * 0.4, 2),
    })

    p_score = baseline_prob or 0.5
    if not passed:
        band = "uncertain"
    elif p_score >= 0.65:
        band = "strong"
    elif p_score <= 0.42:
        band = "weak"
    else:
        band = "uncertain"

    score_obj = {
        "band": band,
        "model_version": meta["version"],
        "factors": factor_items,
        "probability": round(p_score, 2),
        "prediction_basis": {
            "evidence_model_weight": 0.50, "similar_judgments_weight": 0.30, "court_prior_weight": 0.20,
            "similar_judgments_used": emp_n, "similar_judgments_allowed": emp_allowed, "similar_judgments_rate": round(empirical, 2),
        },
        "court_aware": {
            "court": display_court,
            "prior_bucket": court_name,
            "tier": c_meta.get("tier"),
            "n_judgments": n_j,
            "pooled_from": c_meta["pooled_from"],
            "shrinkage_k": k_sh,
            "local_rate": p_local,
            "parent_rate": p_parent,
            "pooled_rate": pooled_rate,
        },
        "eval": {
            "heldout_correct": meta["heldout_correct"],
            "heldout_total": meta["heldout_total"],
            "note": meta["limit_note"],
            "brier": meta["brier"],
            "calibration": meta.get("calibration"),
        },
        "bias_firewall_passed": passed,
    }
    return firewall, score_obj


def _court_family(court: str, state: str) -> tuple[str, str]:
    """(corpus court name, readable tier) for a forum name typed on a matter."""
    from app.services.precedents.index import STATE_HC

    c = (court or "").lower()
    if "supreme" in c:
        return "Supreme Court of India", "Supreme Court"
    hc = STATE_HC.get((state or "").lower(), ("Bombay High Court", ""))[0]
    if "high court" in c or "bombay" in c:
        return hc, "High Court"
    return "", "Trial / district forum"


def corpus_court_prior(display_court: str, area: str, state: str = "") -> dict[str, Any] | None:
    """Court-aware prior from real judgments in the index, partially pooled toward the area-wide rate.

    local  = grant rate of judgments from this court tier in this practice area
    parent = grant rate of all judgments in this practice area
    pooled = (n*local + k*parent) / (n + k), k = 12   (empirical-Bayes shrinkage)
    """
    from app.services.precedents import corpus

    def rate(rs: list[dict[str, Any]]) -> tuple[float, int]:
        known = [r for r in rs if r.get("outcome") in ("allowed", "dismissed", "partly_allowed")]
        if not known:
            return 0.5, 0
        won = sum(1.0 if r["outcome"] == "allowed" else 0.5 if r["outcome"] == "partly_allowed" else 0.0 for r in known)
        return (won + 1) / (len(known) + 2), len(known)

    recs = [r for r in corpus.load_records() if r.get("kind", "judgment") == "judgment"]
    if not recs:
        return None
    in_area = [r for r in recs if area in r.get("practice_areas", [])] or recs
    parent_rate, parent_n = rate(in_area)
    name, tier = _court_family(display_court, state)
    if name:
        local = [r for r in in_area if r.get("court") == name]
    else:  # trial courts: district courts / commissions in the index, same state first
        local = [r for r in in_area if r.get("court") and "High Court" not in r["court"] and "Supreme" not in r["court"]]
    local_rate, n = rate(local)
    return {
        "n_judgments": n, "local_rate": round(local_rate, 3), "parent_rate": round(parent_rate, 3), "shrinkage_k": 12,
        "pooled_from": f"All {area.replace('_', ' ')} judgments in the index ({parent_n})", "tier": tier,
    }


def _empirical_rate(precedents: dict[str, Any]) -> tuple[float, int, float]:
    """Beta(2,2)-smoothed share of retrieved similar judgments that granted relief (partly = half)."""
    st = precedents.get("outcome_stats") or {}
    if not st:
        st = {"allowed": 0, "dismissed": 0, "partly_allowed": 0}
        for r in precedents.get("results", []):
            o = r.get("outcome")
            if o in st:
                st[o] += 1
    a, d, pa = st.get("allowed", 0), st.get("dismissed", 0), st.get("partly_allowed", 0)
    n = a + d + pa
    allowed = a + 0.5 * pa
    return (allowed + 2.0) / (n + 4.0), n, allowed


def _blend(model_prob: float, empirical: float, court_rate: float) -> float:
    """Outcome probability: tempered evidence model + outcomes of similar real judgments + court prior."""
    p = min(max(model_prob, 1e-4), 1 - 1e-4)
    tempered = 1 / (1 + np.exp(-0.55 * np.log(p / (1 - p))))
    prob = 0.50 * tempered + 0.30 * empirical + 0.20 * court_rate
    return round(float(max(0.05, min(0.95, prob))), 2)


_UNPROTECTED: dict[str, Any] = {}


def _unprotected_model():
    """Logistic model trained on the synthetic judgment rows plus identity one-hots, with the
    SIMULATED_HISTORICAL_BIAS offsets baked into its labels. Demo-only contrast for the firewall."""
    if "model" in _UNPROTECTED:
        return _UNPROTECTED["model"]
    from sklearn.linear_model import LogisticRegression

    data_path = ML_DIR / "data" / "judgments_dataset.json"
    rows = json.loads(data_path.read_text(encoding="utf-8")) if data_path.exists() else []
    feats = ["registered_deed_present", "stamp_duty_paid", "possession_evidence", "revenue_record_form_1_14",
             "payment_trail", "within_limitation", "precedent_support_ratio", "court_prior_rate"]
    rng = np.random.default_rng(29)
    X, y = [], []
    for r in rows:
        base = np.array([float(r.get(f, 0.5)) for f in feats])
        logit = (base[:6].sum() - 3.0) * 0.9 + (base[6] - 0.5) * 2.0 + (base[7] - 0.48) * 2.0
        for ident in IDENTITIES:
            onehot = [1.0 if ident == k else 0.0 for k in IDENTITIES[1:]]
            pz = 1 / (1 + np.exp(-(logit + SIMULATED_HISTORICAL_BIAS[ident])))
            X.append(list(base) + onehot)
            y.append(int(rng.random() < pz))
    model = LogisticRegression(C=2.0, max_iter=500).fit(np.array(X), np.array(y)) if X else None
    _UNPROTECTED["model"] = model
    _UNPROTECTED["feats"] = feats
    return model


def _unprotected_score(feat_dict: dict[str, float], features_order: list[str], identity: str, pooled_rate: float, empirical: float = 0.5) -> float:
    model = _unprotected_model()
    if model is None:
        return 0.5
    base = [float(feat_dict.get(f, 0.5)) for f in _UNPROTECTED["feats"]]
    onehot = [1.0 if identity == k else 0.0 for k in IDENTITIES[1:]]
    # Same blend as the protected score, so the only difference between the two is identity.
    return _blend(float(model.predict_proba(np.array([base + onehot]))[0, 1]), empirical, pooled_rate)


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

