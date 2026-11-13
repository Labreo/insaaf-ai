"""Comprehensive backend & rule engine tests for Insaaf AI."""
from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.db import db_session
from app.ledger.chain import append_ledger_entry, verify_ledger_chain
from app.main import app
from app.rules_engine.engine import calculate_limitation_with_covid, evaluate_law_changes
from app.services.llm.client import llm_client
from conftest import DEMO_PASSWORD, DEMO_PASSWORDS, login


def test_covid_limitation_exclusion_window():
    # Cause date 2013-01-07 + 12 years = 2025-01-07; overlaps entire SC COVID window (716 days) -> 2026-12-24
    expires, days_left, excluded = calculate_limitation_with_covid(
        cause_date=date(2013, 1, 7),
        limitation_years=12,
        reference_today=date(2026, 11, 13),
    )
    assert expires == date(2026, 12, 24)
    assert days_left == 41
    assert len(excluded) == 1
    assert excluded[0]["from"] == "2020-03-15"
    assert excluded[0]["to"] == "2022-02-28"

    # Cause date after COVID window should have no exclusion
    exp_post, _, exc_post = calculate_limitation_with_covid(
        cause_date=date(2023, 2, 1),
        limitation_years=3,
        reference_today=date(2026, 1, 1),
    )
    assert exp_post == date(2026, 2, 1)
    assert exc_post == []


@pytest.mark.asyncio
async def test_law_change_radar_cutoff():
    post = await evaluate_law_changes("Complaint cites IPC 302 and IPC 420", offence_date="2025-01-10")
    assert any(x["found"] == "IPC 302" and x["replaced_by"] == "BNS 103" and x["applies"] is True for x in post)

    pre = await evaluate_law_changes("Complaint cites IPC 302", offence_date="2024-06-30")
    assert any(x["found"] == "IPC 302" and x["applies"] is False for x in pre)


def test_ledger_hash_chain_and_tamper_detection():
    v1 = verify_ledger_chain()
    assert v1["valid"] is True
    assert v1["entries"] >= 2

    entry = append_ledger_entry(
        actor="senior_1",
        role="senior",
        matter_id="mat_001",
        action="override",
        target="proof",
        target_id="stamp_duty",
        reason_code="wrong_law",
        note="Verified e-stamp receipt offline",
        org_id="org_chamber_a",
    )
    assert entry["id"].startswith("led_")
    assert verify_ledger_chain()["valid"] is True

    # Tamper directly with row led_002 in SQLite -> chain must break at led_002
    with db_session() as conn:
        conn.execute("UPDATE ledger_entries SET note = 'TAMPERED' WHERE id = 'led_002'")
    v_tampered = verify_ledger_chain()
    assert v_tampered["valid"] is False
    assert v_tampered["broken_at"] == "led_002"


def test_authority_lock_rejects_fabricated_citations():
    corpus = [
        {
            "source_id": "src_kanoon_1565619",
            "kind": "judgment",
            "title": "Suraj Lamp & Industries v. State of Haryana",
            "court": "Supreme Court of India",
            "date": "2011-10-11",
            "paragraph": "16",
            "snippet": "A transfer of immovable property by way of sale can only be by a deed of conveyance.",
            "url": "https://indiankanoon.org/doc/1565619/",
        }
    ]
    fake = llm_client.verify_citation_against_corpus("Sharma v. Union of India (2019) 4 SCC 112", corpus)
    assert fake["verified"] is False
    assert fake["source"] is None
    assert fake["message"] == "No verified authority found."

    real = llm_client.verify_citation_against_corpus("Suraj Lamp & Industries v. State of Haryana", corpus)
    assert real["verified"] is True
    assert real["source"]["source_id"] == "src_kanoon_1565619"


def test_full_api_contract_endpoints():
    with TestClient(app) as raw:
        h_junior = login(raw, "junior_1")
        h_senior = login(raw, "senior_1")

        class _Authed:
            """Thin wrapper: every call carries the junior's bearer token unless headers are given."""

            def get(self, url, headers=None, **kw):
                return raw.get(url, headers=headers or h_junior, **kw)

            def post(self, url, headers=None, **kw):
                return raw.post(url, headers=headers or h_junior, **kw)

        client = _Authed()
        assert client.get("/v1/me").json()["role"] == "junior"

        matters = client.get("/v1/matters").json()
        assert len(matters) >= 3
        assert "mat_001" in {m["id"] for m in matters}

        queue = client.get("/v1/queue").json()
        assert "mat_001" in {q["matter_id"] for q in queue}
        assert all(queue[i]["priority"] >= queue[i + 1]["priority"] for i in range(len(queue) - 1))

        facts = client.get("/v1/matters/mat_001/facts").json()
        assert len(facts) >= 1

        proof = client.get("/v1/matters/mat_001/proof-ledger").json()
        assert proof["case_type"] == "property"
        assert any(i["state"] == "missing" and i["severity"] == "critical" for i in proof["items"])

        clock = client.get("/v1/matters/mat_001/statute-clock").json()
        assert clock["limitation_expires"] == "2026-12-24"
        assert len(clock["excluded_periods"]) == 1

        precs = client.get("/v1/matters/mat_001/precedents").json()
        assert precs["budget_ms"] == 8000
        assert len(precs["results"]) >= 1

        cit = client.get("/v1/matters/mat_001/citations/health").json()
        assert any(c["badge"] == "red" and c["treatment"] == "overruled" for c in cit)

        sc = client.get("/v1/matters/mat_001/score").json()
        assert sc["band"] == "weak"
        assert sc["bias_firewall_passed"] is True
        assert sc["eval"]["heldout_total"] > 0
        assert sc["eval"]["calibration"] is not None
        assert sc["court_aware"]["pooled_rate"] is not None

        sc_hc = client.post("/v1/matters/mat_001/court", json={"court": "Bombay High Court (Goa bench)"}).json()
        assert sc_hc["court_aware"]["court"] == "Bombay High Court (Goa bench)"
        assert sc_hc["court_aware"]["pooled_rate"] != sc["court_aware"]["pooled_rate"]

        cit_adm = client.post("/v1/matters/mat_001/citations/check", json={"citation": "ADM Jabalpur v. Shivkant Shukla"}).json()
        assert any(c["badge"] == "red" and "ADM Jabalpur" in c["cited"]["title"] for c in cit_adm)

        plaint = client.post("/v1/matters/mat_001/draft/type", json={"draft_type": "plaint"}).json()
        assert plaint["type"] == "plaint"
        assert "ORDER VII RULE 1" in plaint["rendered"]["title"]

        q_flagged = client.post("/v1/matters/mat_002/flags", json={"flag": "senior_citizen"}).json()
        mat2_q = next(q for q in q_flagged if q["matter_id"] == "mat_002")
        assert "senior_citizen" in mat2_q["flags"]

        fw = client.get("/v1/matters/mat_001/bias-firewall").json()
        assert fw["passed"] is True
        assert len(fw["rows"]) == 10
        assert fw["max_unprotected_gap"] > fw["epsilon"]  # the comparison model is visibly biased

        flip = client.post("/v1/matters/mat_001/bias-firewall/flip", json={"identity": "dalit"}).json()
        assert flip["identity"] == "dalit"
        assert flip["delta"] <= fw["epsilon"]

        adv = client.get("/v1/matters/mat_001/advice").json()
        assert adv["recommendation"] == "mediate"

        adv_crim = client.get("/v1/matters/mat_003/advice").json()
        assert adv_crim["recommendation"] == "plea_bargain"

        draft = client.get("/v1/matters/mat_001/draft").json()
        assert len(draft["paragraphs"]) >= 2

        bad_cit = client.post("/v1/matters/mat_001/draft/verify-citation", json={"text": "Fake Case v. Nobody (2025)"}).json()
        assert bad_cit["verified"] is False
        assert bad_cit["message"] == "No verified authority found."

        good_cit = client.post("/v1/matters/mat_001/draft/verify-citation", json={"text": "Suraj Lamp"}).json()
        assert good_cit["verified"] is True

        # Overruled authority (Koushal) blocks export until a senior records a reasoned override.
        blocked = client.get("/v1/matters/mat_001/draft/export?format=docx")
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["error"]["code"] == "citation_blocks_draft"
        for item in client.get("/v1/matters/mat_001/citations/health").json():
            if item["blocks_draft"]:
                ok = client.post(
                    "/v1/matters/mat_001/reviews",
                    headers=h_senior,
                    json={"action": "override", "target": "citation", "target_id": item["cited"]["source_id"], "reason_code": "wrong_citation_treatment", "note": "Reviewed: not relied on in this draft"},
                )
                assert ok.status_code == 200, ok.text
        docx_res = client.get("/v1/matters/mat_001/draft/export?format=docx")
        assert docx_res.status_code == 200
        assert docx_res.content[:2] == b"PK"

        law_changes = client.get("/v1/matters/mat_001/law-changes").json()
        assert any(lc["found"] == "IPC 302" and lc["replaced_by"] == "BNS 103" for lc in law_changes)

        rev = client.post(
            "/v1/matters/mat_001/reviews",
            headers=h_senior,
            json={
                "action": "override",
                "target": "score",
                "target_id": "score",
                "reason_code": "score_disagree",
                "note": "Possession corroboration checked",
                "diff": {"band": "strong"},
            },
        ).json()
        assert rev["id"].startswith("led_")

        led = client.get("/v1/ledger?matter_id=all").json()
        assert led["verify"]["valid"] is True
        assert len(led["entries"]) >= 3

        health = client.get("/v1/health/deep").json()
        assert health["db"] == "ok"
        assert "model_version" in health

        assert len(client.get("/v1/alerts").json()) >= 1
        assert client.get("/v1/ml/model").json()["version"] == health["model_version"]
        scan = client.post("/v1/law-changes/scan", json={"text": "IPC 302", "offence_date": "2025-01-01"}).json()
        assert scan[0]["replaced_by"] == "BNS 103"
        # Role switching in-session is privilege escalation; it must be refused.
        assert client.post("/v1/me/role", json={"role": "senior"}).status_code == 403
        assert client.get("/v1/me").json()["role"] == "junior"


def test_auth_rls_and_overrides():
    with TestClient(app) as client:
        accounts = client.get("/v1/auth/accounts").json()
        uids = {a["user_id"] for a in accounts}
        assert {"senior_1", "junior_1", "clerk_1", "student_1", "senior_b"}.issubset(uids)

        bad_login = client.post("/v1/auth/login", json={"email": "pradeep.sardessai@sardessai-chambers.insaaf.in", "password": "wrong"})
        assert bad_login.status_code == 401

        login_b = client.post("/v1/auth/login", json={"email": "pradeep.sardessai@sardessai-chambers.insaaf.in", "password": DEMO_PASSWORDS["senior_b"]})
        assert login_b.status_code == 200
        tok_b = login_b.json()["token"]
        h_b = {"Authorization": f"Bearer {tok_b}"}

        matters_b = client.get("/v1/matters", headers=h_b).json()
        b_ids = {m["id"] for m in matters_b}
        assert "mat_004" in b_ids and "mat_001" not in b_ids
        assert client.get("/v1/matters/mat_001", headers=h_b).status_code == 404
        assert {q["matter_id"] for q in client.get("/v1/queue", headers=h_b).json()} <= b_ids
        assert {a["matter_id"] for a in client.get("/v1/alerts", headers=h_b).json()} <= b_ids

        h_clerk = login(client, "clerk_1")
        clerk_ids = {m["id"] for m in client.get("/v1/matters", headers=h_clerk).json()}
        assert "mat_001" in clerk_ids and "mat_003" not in clerk_ids
        assert client.post(
            "/v1/matters/mat_001/reviews",
            headers=h_clerk,
            json={"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other"},
        ).status_code == 403

        h_student = login(client, "student_1")
        student_ids = {m["id"] for m in client.get("/v1/matters", headers=h_student).json()}
        assert "mat_001" in student_ids and "mat_002" not in student_ids and "mat_003" not in student_ids
        assert client.post(
            "/v1/matters/mat_001/reviews",
            headers=h_student,
            json={"action": "override", "target": "score", "target_id": "score", "reason_code": "score_disagree"},
        ).status_code == 403

        h_senior = login(client, "senior_1")
        sc_before = client.get("/v1/matters/mat_001/score", headers=h_senior).json()["band"]
        client.post(
            "/v1/matters/mat_001/reviews",
            headers=h_senior,
            json={"action": "override", "target": "score", "target_id": "score", "reason_code": "score_disagree", "note": "Strong adverse possession corroboration",
                  "diff": {"band": "strong" if sc_before != "strong" else "weak"}},
        )
        sc_after = client.get("/v1/matters/mat_001/score", headers=h_senior).json()["band"]
        assert sc_after != sc_before

        client.post(
            "/v1/matters/mat_001/reviews",
            headers=h_senior,
            json={"action": "override", "target": "advice", "target_id": "advice", "reason_code": "other", "diff": {"recommendation": "fight"}},
        )
        assert client.get("/v1/matters/mat_001/advice", headers=h_senior).json()["recommendation"] == "fight"

        blocked = client.post(
            "/v1/matters/mat_001/reviews",
            headers=h_senior,
            json={"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other", "note": "Approved for filing"},
        )
        assert blocked.status_code == 409, "approval must be blocked while an overruled citation is un-overridden"
        for item in client.get("/v1/matters/mat_001/citations/health", headers=h_senior).json():
            if item["blocks_draft"]:
                client.post(
                    "/v1/matters/mat_001/reviews",
                    headers=h_senior,
                    json={"action": "override", "target": "citation", "target_id": item["cited"]["source_id"], "reason_code": "wrong_citation_treatment", "note": "Reviewed"},
                )
        client.post(
            "/v1/matters/mat_001/reviews",
            headers=h_senior,
            json={"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other", "note": "Approved for filing"},
        )
        draft_after = client.get("/v1/matters/mat_001/draft", headers=h_senior).json()
        assert "APPROVED BY senior_1 (SENIOR)" in draft_after["watermark"]
        assert client.get("/v1/matters/mat_001", headers=h_senior).json()["status"] == "approved"

        assert client.post("/v1/demo/reset", headers=h_senior).json()["reset"] is True
        assert client.get("/v1/me", headers=h_senior).json()["user_id"] == "senior_1"
