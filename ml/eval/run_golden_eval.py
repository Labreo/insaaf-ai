"""30-case golden evaluation suite for Insaaf AI (Authority Lock, Citation Health, Bias Firewall, Statute Clock, B-Score)."""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.db import init_db
from app.ml.service import compute_bias_firewall_and_score
from app.pipeline.orchestrator import ensure_stage
from app.rules_engine.engine import calculate_limitation_with_covid, evaluate_law_changes
from app.services.llm.client import llm_client


async def run_suite() -> dict:
    init_db()
    meta = json.loads((ROOT / "ml" / "training" / "artifacts" / "model_meta.json").read_text())

    # 1. Authority Lock tests (10 cases: 5 fake citations must fail, 5 real stored citations must pass)
    rag = await ensure_stage("mat_001", "rag")
    corpus = rag.get("corpus_sources", [])
    fake_claims = [
        "Sharma v. Union of India (2019) 4 SCC 112 held unregistered GPA confers title.",
        "Mata v. Avianca Airlines (2023) 99 SCC 1",
        "Varghese v. State of Kerala (2024) 12 SCC 888",
        "Rao Builders v. Municipal Corp (2021) 7 SCC 404",
        "Deshmukh v. Deshmukh (2020) 3 BomCR 999",
    ]
    real_claims = [
        "Suraj Lamp & Industries v. State of Haryana (2011)",
        "Registration Act, 1908 — s.17",
        "Indian Stamp Act, 1899 — s.35",
        "Limitation Act, 1963 — Schedule",
        "1565619",
    ]
    auth_correct = 0
    for c in fake_claims:
        if not llm_client.verify_citation_against_corpus(c, corpus)["verified"]:
            auth_correct += 1
    for c in real_claims:
        if llm_client.verify_citation_against_corpus(c, corpus)["verified"]:
            auth_correct += 1

    # 2. Citation Health & Law Change Radar (6 cases)
    ch = await ensure_stage("mat_001", "citation_health")
    cit_correct = 0
    if any(x["badge"] == "red" and x["treatment"] == "overruled" and x["blocks_draft"] for x in ch):
        cit_correct += 1
    if any(x["badge"] == "green" and x["treatment"] == "followed" for x in ch):
        cit_correct += 1
    lc_post = await evaluate_law_changes("FIR cites IPC 302 and IPC 420 and CrPC 438 and IEA 65B", offence_date="2025-01-15")
    for expected in ("BNS 103", "BNS 318(4)", "BNSS 482", "BSA 63"):
        if any(x["replaced_by"] == expected and x["applies"] for x in lc_post):
            cit_correct += 1

    # 3. Statute Clock COVID exclusion checks (4 cases)
    clock_correct = 0
    exp1, _, exc1 = calculate_limitation_with_covid(date(2019, 1, 1), 3, reference_today=date(2026, 11, 13))
    if exc1 and exp1 > date(2022, 1, 1):
        clock_correct += 1
    exp2, _, exc2 = calculate_limitation_with_covid(date(2023, 1, 1), 3, reference_today=date(2026, 11, 13))
    if not exc2 and exp2 == date(2026, 1, 1):
        clock_correct += 1
    exp3, _, exc3 = calculate_limitation_with_covid(date(2013, 1, 7), 12, reference_today=date(2026, 11, 13))
    if exc3 and exp3 == date(2026, 12, 24):
        clock_correct += 1
    exp4, _, exc4 = calculate_limitation_with_covid(date(2010, 1, 1), 3, reference_today=date(2026, 11, 13))
    if not exc4 and exp4 == date(2013, 1, 1):
        clock_correct += 1

    # 4. Bias Firewall 6-identity flip check (6 identities) + 4 score sanity checks = 10 cases
    fw = await ensure_stage("mat_001", "bias_firewall")
    max_delta = max(abs(r["delta"]) for r in fw["rows"])
    fw_correct = sum(1 for r in fw["rows"] if abs(r["delta"]) <= fw["epsilon"])

    sc_m1 = await ensure_stage("mat_001", "score")
    sc_m2 = await ensure_stage("mat_002", "score")
    sc_m3 = await ensure_stage("mat_003", "score")
    adv_m1 = await ensure_stage("mat_001", "advice")
    adv_m3 = await ensure_stage("mat_003", "advice")

    sanity_correct = 0
    if sc_m1["band"] == "weak":
        sanity_correct += 1
    if sc_m2["band"] == "strong":
        sanity_correct += 1
    if adv_m1["recommendation"] == "mediate":
        sanity_correct += 1
    if adv_m3["recommendation"] == "plea_bargain":
        sanity_correct += 1

    total_golden = 30
    passed_golden = auth_correct + cit_correct + clock_correct + fw_correct + sanity_correct

    results = {
        "golden_suite_passed": passed_golden,
        "golden_suite_total": total_golden,
        "axes": {
            "authority_lock_rejection_and_match": f"{auth_correct}/10",
            "citation_health_and_law_change": f"{cit_correct}/6",
            "statute_clock_covid_exclusion": f"{clock_correct}/4",
            "bias_firewall_6_identities": f"{fw_correct}/6 (max_delta={max_delta:.2f})",
            "score_and_advice_alignment": f"{sanity_correct}/4",
        },
        "b_score_heldout_correct": meta["heldout_correct"],
        "b_score_heldout_total": meta["heldout_total"],
        "b_score_accuracy": meta["accuracy"],
        "b_score_brier": meta["brier"],
        "model_version": meta["version"],
    }
    out_path = Path(__file__).resolve().parent / "golden_results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    asyncio.run(run_suite())

