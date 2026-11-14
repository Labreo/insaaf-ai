"""Regressions found by the integrated Playwright walkthrough."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from conftest import login


def test_fact_delete_is_permitted_and_keeps_ledger_readable():
    with TestClient(app) as client:
        h = login(client, "senior_1")
        me = client.get("/v1/me", headers=h).json()
        # The UI gates the drawer on review.<action>; delete must be granted explicitly.
        assert "review.delete" in me["permissions"]

        add = client.post(
            "/v1/matters/mat_005/reviews",
            headers=h,
            json={"action": "edit", "target": "fact", "target_id": "new", "reason_code": "wrong_fact",
                  "note": "Reply to the demand notice received on 10 September 2026."},
        )
        assert add.status_code == 200, add.text
        facts = client.get("/v1/matters/mat_005/facts", headers=h).json()
        added = [f for f in facts if (f.get("source") or {}).get("document_id") == "advocate_entry"]
        assert added, facts

        rm = client.post(
            "/v1/matters/mat_005/reviews",
            headers=h,
            json={"action": "delete", "target": "fact", "target_id": added[-1]["id"], "reason_code": "wrong_fact",
                  "note": "Entered on the wrong matter."},
        )
        assert rm.status_code == 200, rm.text
        assert rm.json()["action"] == "delete"
        assert all(f["id"] != added[-1]["id"] for f in client.get("/v1/matters/mat_005/facts", headers=h).json())

        # A delete entry on the chain must not break ledger reads (previously a 500).
        for url in ("/v1/ledger", "/v1/ledger?matter_id=mat_005"):
            res = client.get(url, headers=h)
            assert res.status_code == 200, res.text
        assert any(e["action"] == "delete" for e in client.get("/v1/ledger", headers=h).json()["entries"])


def test_clerk_and_student_cannot_delete_facts():
    with TestClient(app) as client:
        for user in ("clerk_1", "student_1"):
            h = login(client, user)
            assert "review.delete" not in client.get("/v1/me", headers=h).json()["permissions"]
