"""P1 functional reliability regressions (F10, F4/F1, F7, F8, F2, F3)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from conftest import login

UI_FORUMS = [
    "Civil Judge Senior Division, Mapusa",
    "District Court, North Goa",
    "Bombay High Court (Goa bench)",
    "Supreme Court of India",
]


# --- F10: every forum offered by ScoreTab resolves to its own prior -----------------------


def test_f10_every_ui_forum_resolves_to_itself():
    with TestClient(app) as client:
        h = login(client, "junior_1")
        seen_rates = {}
        for court in UI_FORUMS:
            res = client.post("/v1/matters/mat_001/court", json={"court": court}, headers=h)
            assert res.status_code == 200, res.text
            ca = res.json()["court_aware"]
            assert ca["court"] == court
            seen_rates[court] = ca["pooled_rate"]
        # Distinct priors -> distinct pooled rates; no silent collapse onto the district court.
        assert len(set(seen_rates.values())) == len(UI_FORUMS)


def test_f10_civil_judge_pools_toward_district_parent():
    from app.ml.service import _ensure_model_loaded

    _, meta = _ensure_model_loaded()
    cj = meta["court_hierarchy"]["Civil Judge Senior Division, Mapusa"]
    assert cj["pooled_from"] == "District Court, North Goa"
    assert cj["n_judgments"] < cj["shrinkage_k"]  # sparse -> parent dominates


# --- F4/F1: fact cards never 500, and evidence changes invalidate derived stages -----------


@pytest.mark.parametrize(
    "raw,expected",
    [(1.0, "high"), (0.62, "medium"), (0.1, "low"), ("0.9", "high"), (92, "high"), ("LOW", "low"), (None, "medium"), ("??", "medium")],
)
def test_f4_confidence_coercion(raw, expected):
    from app.services.llm.client import _coerce_confidence

    assert _coerce_confidence(raw) == expected


def test_f4_get_facts_heals_malformed_cached_cards():
    from app.db import save_stage_result

    bad = [
        {
            "id": "fact_01",
            "statement": "Voice note says payment was made in cash.",
            "status": "claimed",  # not a valid status
            "source": {"document_id": "doc_x", "location": 3},
            "original": {"language": "kok", "text": "पयशे रोख दिले", "translation_confidence": 1.0},
        },
        {"id": "fact_02", "statement": "", "status": "documented"},  # empty -> dropped
    ]
    with TestClient(app) as client:
        h = login(client, "junior_1")
        save_stage_result("mat_001", "facts", bad)
        res = client.get("/v1/matters/mat_001/facts", headers=h)
        assert res.status_code == 200, res.text
        facts = res.json()
        assert len(facts) == 1
        assert facts[0]["status"] == "alleged"
        assert facts[0]["source"]["location"] == "3"
        assert facts[0]["original"]["translation_confidence"] == "high"


def test_f4_document_upload_and_delete_invalidate_stage_results():
    from app.db import get_stage_result

    with TestClient(app) as client:
        h = login(client, "junior_1")
        assert get_stage_result("mat_001", "facts") is not None  # seeded at startup
        up = client.post(
            "/v1/matters/mat_001/documents",
            files={"file": ("note.txt", b"Sale deed registered on 12 March 2019 at Mapusa.", "text/plain")},
            headers=h,
        )
        assert up.status_code == 200, up.text
        assert get_stage_result("mat_001", "facts") is None
        assert get_stage_result("mat_001", "score") is None

        from app.db import save_stage_result

        save_stage_result("mat_001", "facts", [{"id": "fact_01", "statement": "x", "status": "documented"}])
        dele = client.delete(f"/v1/matters/mat_001/documents/{up.json()['id']}", headers=h)
        assert dele.status_code == 200, dele.text
        assert get_stage_result("mat_001", "facts") is None


def test_f1_draft_type_switch_uses_llm_prose_and_drops_approval(monkeypatch):
    import json as _json

    from app.db import get_stage_result, save_stage_result
    from app.services.llm.client import llm_client

    prompts = []

    async def fake_generate(prompt, **kw):
        prompts.append(prompt)
        return _json.dumps(
            {"paragraphs": [
                {"id": "p1", "text": "The Plaintiff has been in settled possession of the suit property.", "confidence": "high", "source_ids": []},
                {"id": "p2", "text": "The Defendant has refused to execute a registered conveyance.", "confidence": "medium", "source_ids": []},
            ]}
        )

    with TestClient(app) as client:
        h = login(client, "junior_1")
        draft = get_stage_result("mat_001", "draft")
        draft["watermark"] = "APPROVED BY senior_1 (SENIOR) — FOR ADVOCATE USE"
        save_stage_result("mat_001", "draft", draft)
        monkeypatch.setattr(llm_client, "generate_text", fake_generate)
        res = client.post("/v1/matters/mat_001/draft/type", json={"draft_type": "plaint"}, headers=h)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["type"] == "plaint"
        assert body["rendered"]["title"].startswith("SUIT UNDER ORDER VII RULE 1")
        assert body["paragraphs"][0]["text"].startswith("The Plaintiff has been in settled possession")
        assert "APPROVED" not in body["watermark"]
        assert "Order VII Rule 1 CPC" in prompts[-1]


def test_f1_draft_type_switch_falls_back_to_template_offline(monkeypatch):
    from app.services.llm.client import llm_client

    async def boom(prompt, **kw):
        raise RuntimeError("offline")

    with TestClient(app) as client:
        h = login(client, "junior_1")
        monkeypatch.setattr(llm_client, "generate_text", boom)
        res = client.post("/v1/matters/mat_001/draft/type", json={"draft_type": "plaint"}, headers=h)
        assert res.status_code == 200, res.text
        body = res.json()
        assert "ORDER VII RULE 1" in body["rendered"]["title"] and len(body["paragraphs"]) >= 2


# --- F7: arbitrary citations are title-matched and run through a citator pass -------------


def _fake_kanoon(monkeypatch, search_map):
    from app.services.precedents.service import precedent_client

    async def fake_search(query, **kw):
        return {"docs": search_map.get(query, [])}

    async def fake_doc(doc_id, query_hint=None, fallback_meta=None):
        meta = fallback_meta or {}
        return {
            "source_id": f"src_kanoon_{doc_id}", "kind": "judgment", "title": meta.get("title", doc_id),
            "court": meta.get("court", ""), "date": meta.get("date", ""), "paragraph": "—",
            "snippet": meta.get("snippet", "x"), "url": f"https://indiankanoon.org/doc/{doc_id}/",
        }

    monkeypatch.setattr(precedent_client, "search", fake_search)
    monkeypatch.setattr(precedent_client, "get_doc_source", fake_doc)


def test_f7_unrelated_search_hit_is_not_attributed(monkeypatch):
    q = "State of Goa v. Test Party 2020"
    _fake_kanoon(monkeypatch, {q: [{"doc_id": "1", "title": "Arvind Kejriwal vs Directorate Of Enforcement", "snippet": "bail"}]})
    with TestClient(app) as client:
        h = login(client, "junior_1")
        res = client.post("/v1/matters/mat_001/citations/check", json={"citation": q}, headers=h)
        assert res.status_code == 404
        assert res.json()["detail"]["error"]["code"] == "citation_not_found"


def test_f7_citator_pass_flags_overruling_judgment(monkeypatch):
    q = "Ramesh Naik v. Comunidade of Serula"
    cited = {"doc_id": "111", "title": "Ramesh Naik vs Comunidade Of Serula", "snippet": "mundkar rights"}
    later = {"doc_id": "222", "title": "Vasant Gaonkar vs State", "snippet": "The view in Ramesh Naik is overruled and no longer good law."}
    _fake_kanoon(monkeypatch, {q: [cited], "citedby:111": [later]})
    with TestClient(app) as client:
        h = login(client, "junior_1")
        res = client.post("/v1/matters/mat_001/citations/check", json={"citation": q}, headers=h)
        assert res.status_code == 200, res.text
        top = res.json()[0]
        assert top["cited"]["source_id"] == "src_kanoon_111"
        assert top["treatment"] == "overruled" and top["blocks_draft"] is True
        assert top["by"]["source_id"] == "src_kanoon_222"  # the overruling case, not the cited case itself


# --- F8: Authority Lock checks the proposition, not just the case name --------------------

_SURAJ = [{
    "source_id": "src_kanoon_1565619", "kind": "judgment", "title": "Suraj Lamp & Industries v. State of Haryana",
    "court": "Supreme Court of India", "date": "2011-10-11", "paragraph": "16",
    "snippet": "A transfer of immovable property by way of sale can only be by a deed of conveyance. "
               "SA/GPA/Will transactions are not transfers or sales and do not convey title.",
    "url": "https://indiankanoon.org/doc/1565619/",
}]


@pytest.mark.parametrize(
    "claim,ok",
    [
        ("Suraj Lamp & Industries v. State of Haryana", True),
        ("Suraj Lamp", True),
        ("Suraj Lamp held that a transfer of immovable property by sale can only be by a deed of conveyance", True),
        ("Suraj Lamp held that GPA transactions are not transfers and do not convey title", True),
        ("Suraj Lamp held that a transfer of immovable property by sale need not be by a deed of conveyance", False),
        ("Suraj Lamp held that GPA transactions convey title to the property by way of sale", False),
        ("Suraj Lamp held that mundkar tenancy rights survive comunidade auctions absolutely", False),
    ],
)
def test_f8_authority_lock_rejects_misattributed_holdings(claim, ok):
    from app.services.llm.client import llm_client

    res = llm_client.verify_citation_against_corpus(claim, _SURAJ)
    assert res["verified"] is ok, res["message"]


# --- F2: Bias Firewall checks that masking actually removes every counterfactual marker -----


@pytest.mark.parametrize("ident", ["muslim", "dalit", "tribal", "female", "non_english_speaking"])
def test_f2_masker_strips_every_counterfactual_identity(ident):
    from app.ml.service import _identity_leaked, mask_identity_markers

    masked = mask_identity_markers(f"[Claimant profile: {ident}] Smt. Fatima, a Konkani-speaking widow, holds Form I & XIV.")
    assert not _identity_leaked(ident, masked), masked
    assert "Fatima" not in masked and "widow" not in masked.lower() and "konkani" not in masked.lower()


def test_f2_firewall_fails_closed_when_marker_leaks(monkeypatch):
    import app.ml.service as svc
    from app.db import get_stage_result

    with TestClient(app):
        args = dict(
            matter={"case_type": "property", "forum_hint": "District Court, North Goa"},
            facts=get_stage_result("mat_001", "facts"),
            proof_ledger=get_stage_result("mat_001", "proof_ledger"),
            statute_clock=get_stage_result("mat_001", "statute_clock"),
            precedents=get_stage_result("mat_001", "search"),
        )
        firewall, _ = svc.compute_bias_firewall_and_score(**args)
        assert firewall["passed"] is True and all(r["masked"] for r in firewall["rows"])

        monkeypatch.setattr(svc, "IDENTITY_MASK_PATTERNS", [])  # simulate a broken masker
        firewall, _ = svc.compute_bias_firewall_and_score(**args)
        assert firewall["passed"] is False
        assert [r["identity"] for r in firewall["rows"] if not r["masked"]] == svc.IDENTITIES[1:]


# --- F3: precedent search is matter-specific, not one canned query per case type ---------


def test_f3_matter_specific_query_uses_title_and_evidenced_facts():
    from app.pipeline.orchestrator import _matter_specific_query

    matter = {"title": "Fernandes v. Comunidade of Serula (FICTIONAL)", "case_type": "property"}
    facts = [
        {"statement": "Mundkar occupied the Serula plot since 1987 per Form I & XIV.", "status": "documented"},
        {"statement": "Neighbour alleges encroachment on the eastern boundary.", "status": "alleged"},
    ]
    q = _matter_specific_query(matter, facts)
    assert "serula" in q and "comunidade" in q and "mundkar" in q
    assert "fictional" not in q and "encroachment" not in q  # alleged-only facts don't steer research
    assert len(q.split()) <= 5




def test_f3_pipeline_merges_matter_specific_hits_ahead_of_anchor(monkeypatch):
    import asyncio

    from app.db import get_stage_result
    from app.pipeline.orchestrator import _build_search_query, run_pipeline_stream
    from app.services.llm.client import llm_client

    async def offline(*a, **kw):
        raise RuntimeError("offline")

    monkeypatch.setattr(llm_client, "generate_text", offline)
    with TestClient(app):
        from app.db import db_session

        with db_session() as conn:
            matter = dict(conn.execute("SELECT * FROM matters WHERE id = 'mat_001'").fetchone())
        anchor_q = _build_search_query(matter, [])
        specific = {"doc_id": "999001", "title": "Specific Goa Land Ruling", "court": "Bombay High Court", "date": "2019-01-01", "snippet": "possession"}
        anchor = {"doc_id": "1565619", "title": "Suraj Lamp & Industries v. State of Haryana", "court": "Supreme Court of India", "date": "2011-10-11", "snippet": "deed"}
        queries = []

        async def fake_search(query, **kw):
            queries.append(query)
            return {"docs": [anchor] if query == anchor_q else [specific], "searched": 1, "total_matches": 1, "budget_ms": 8000, "elapsed_ms": 5}

        _fake_kanoon(monkeypatch, {})
        from app.services.precedents.service import precedent_client

        monkeypatch.setattr(precedent_client, "search", fake_search)

        async def drain():
            async for _ in run_pipeline_stream("mat_001", force_live=True):
                pass

        asyncio.run(drain())
        ids = [r["sources"][0]["source_id"] for r in get_stage_result("mat_001", "search")["results"]]
        assert anchor_q in queries and len(queries) >= 2
        assert any("999001" in str(i) for i in ids)
        assert any("1565619" in str(i) for i in ids)


# --- Judge acceptance hardening: uploads, dates, proof-ledger negation, clock honesty -------


@pytest.mark.parametrize(
    "name,data,code",
    [
        ("a.pdf", b"not a real pdf", 422),
        ("a.docx", b"PK-garbage", 422),
        ("../../evil.txt", b"hello", 200),  # path stripped to a safe basename
        ("empty.pdf", b"", 400),
        ("virus.exe", b"MZ\x90\x00", 415),
        ("note.json", b"{not json", 422),
    ],
)
def test_malformed_uploads_fail_cleanly(name, data, code):
    from app.config import BACKEND_DIR

    with TestClient(app) as client:
        h = login(client, "junior_1")
        res = client.post("/v1/matters/mat_001/documents", files={"file": (name, data, "application/octet-stream")}, headers=h)
        assert res.status_code == code, res.text
        if code == 200:
            assert ".." not in res.json()["name"] and "/" not in res.json()["name"]
            assert not (BACKEND_DIR / "evil.txt").exists()


def test_recalculate_rejects_malformed_dates():
    with TestClient(app) as client:
        h = login(client, "senior_1")
        for bad in ("not-a-date", "2024-13-45", "", "1800-01-01"):
            res = client.post("/v1/matters/mat_001/statute-clock/recalculate", json={"cause_date": bad}, headers=h)
            assert res.status_code == 422, (bad, res.status_code)


def test_proof_ledger_is_negation_aware():
    import asyncio

    from app.rules_engine.engine import evaluate_proof_ledger

    def state(text):
        res = asyncio.run(evaluate_proof_ledger("civil_recovery", [{"statement": text}], ""))
        return next(i["state"] for i in res["items"] if i["requirement"].startswith("Written contract"))

    assert state("No written contract or work order exists; the job was agreed orally.") != "present"
    assert state("The written contract is missing.") != "present"
    assert state("A signed agreement dated 2 May 2024 is on file.") == "present"


def test_statute_clock_flags_assumed_and_derived_cause_dates():
    import asyncio

    from app.rules_engine.engine import evaluate_statute_clock

    m = {"case_type": "civil_recovery", "next_deadline": None, "forum_hint": None}
    none = asyncio.run(evaluate_statute_clock("civil_recovery", m, "No dates anywhere in this note."))
    assert none["cause_date_source"] == "missing" and none["days_left"] is None
    derived = asyncio.run(evaluate_statute_clock("civil_recovery", m, "Invoice dated 14 March 2024. Acknowledged by letter dated 12 June 2024."))
    assert derived["cause_date_source"] == "document" and derived["cause_date"] == "2024-06-12"
    assert derived["limitation_expires"] == "2027-06-12"


def test_citation_gate_lifted_only_by_ledgered_senior_override():
    with TestClient(app) as client:
        s, j = login(client, "senior_1"), login(client, "junior_1")
        approve = {"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other"}
        assert client.post("/v1/matters/mat_001/reviews", json=approve, headers=s).status_code == 409
        assert client.get("/v1/matters/mat_001/draft/export?format=docx", headers=s).status_code == 409
        blocking = [c for c in client.get("/v1/matters/mat_001/citations/health", headers=s).json() if c["blocks_draft"]]
        assert blocking
        # A junior cannot lift the gate.
        ov = {"action": "override", "target": "citation", "target_id": blocking[0]["cited"]["source_id"], "reason_code": "wrong_citation_treatment", "note": "x"}
        assert client.post("/v1/matters/mat_001/reviews", json=ov, headers=j).status_code == 403
        assert client.post("/v1/matters/mat_001/reviews", json=ov, headers=s).status_code == 200
        assert client.post("/v1/matters/mat_001/reviews", json=approve, headers=s).status_code == 200


def test_clock_rederives_from_new_documents_on_non_pinned_matters():
    import asyncio

    from app.db import db_session
    from app.pipeline.orchestrator import run_pipeline_stream

    async def run_all(mid):
        async for _ in run_pipeline_stream(mid):
            pass

    with TestClient(app) as client:
        h = login(client, "junior_1")
        mid = client.post("/v1/matters", json={"title": "Clock re-derive (FICTIONAL)", "case_type": "civil_recovery"}, headers=h).json()["id"]
        up = lambda name, txt: client.post(f"/v1/matters/{mid}/documents", files={"file": (name, txt.encode(), "text/plain")}, headers=h)  # noqa: E731
        up("a.txt", "Invoice dated 14 March 2024 for Rs. 2,75,000.")
        asyncio.run(run_all(mid))
        assert client.get(f"/v1/matters/{mid}/statute-clock", headers=h).json()["limitation_expires"] == "2027-03-14"
        up("b.txt", "Letter dated 12 June 2024: we acknowledge the outstanding balance and undertake to pay.")
        asyncio.run(run_all(mid))
        clk = client.get(f"/v1/matters/{mid}/statute-clock", headers=h).json()
        assert clk["limitation_expires"] == "2027-06-12" and clk["cause_date_source"] == "document"
