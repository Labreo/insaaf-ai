"""Judge acceptance: recovery paths. External outage must degrade, not crash; demo reset must restore the seed."""
from __future__ import annotations

import json

import httpx
from fastapi.testclient import TestClient

from app.main import app
from conftest import login


def _run_sse(client: TestClient, mid: str, h: dict) -> list[dict]:
    events: list[dict] = []
    with client.stream("GET", f"/v1/matters/{mid}/events", headers=h) as r:
        assert r.status_code == 200
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


def test_total_network_outage_pipeline_still_completes(monkeypatch):
    """Gemini, Indian Kanoon and Bhashini all unreachable: pipeline finishes on deterministic fallbacks and says so."""
    with TestClient(app) as client:
        h = login(client, "junior_1")
        mid = client.post("/v1/matters", json={"title": "Outage probe (FICTIONAL)", "case_type": "civil_recovery"}, headers=h).json()["id"]
        up = client.post(
            f"/v1/matters/{mid}/documents",
            files={"file": ("invoice.txt", b"Invoice dated 3 Feb 2025 for Rs. 90,000 for goods supplied to Ramnath Traders. Payment not received.", "text/plain")},
            headers=h,
        )
        assert up.status_code == 200

        async def no_network(self, request, *a, **kw):  # noqa: ANN001
            raise httpx.ConnectError("simulated outage", request=request)

        monkeypatch.setattr(httpx.AsyncClient, "send", no_network)
        events = _run_sse(client, mid, h)
        done = {e["stage"] for e in events if e["status"] == "done"}
        assert len(done) == 11, f"stages done: {sorted(done)}"
        assert not [e for e in events if e["status"] == "failed"]

        facts = client.get(f"/v1/matters/{mid}/facts", headers=h)
        assert facts.status_code == 200 and facts.json(), "facts must fall back to deterministic extraction"
        assert any("90,000" in f["statement"] or "invoice" in f["statement"].lower() for f in facts.json())
        draft = client.get(f"/v1/matters/{mid}/draft", headers=h).json()
        assert "AI" in draft["watermark"] and draft["paragraphs"]
        # Fabrication guard must hold offline too.
        fake = client.post(f"/v1/matters/{mid}/draft/verify-citation", json={"text": "Imaginary Case (2099) 1 SCC 1"}, headers=h).json()
        assert fake["verified"] is False


def test_demo_reset_restores_deleted_seed_matter():
    with TestClient(app) as client:
        s = login(client, "senior_1")
        assert client.delete("/v1/matters/mat_001", headers=s).status_code == 200
        assert "mat_001" not in [m["id"] for m in client.get("/v1/matters", headers=s).json()]
        assert client.post("/v1/demo/reset", headers=s).status_code == 200
        ids = [m["id"] for m in client.get("/v1/matters", headers=s).json()]
        assert {"mat_001", "mat_002", "mat_003"} <= set(ids), ids
        assert client.get("/v1/matters/mat_001/facts", headers=s).status_code == 200


def test_rejected_login_and_unauthenticated_matter_fail_closed():
    with TestClient(app) as client:
        assert client.post("/v1/auth/login", json={"user_id": "senior_1", "password": ""}).status_code in (401, 422)
        assert client.get("/v1/matters/mat_001").status_code == 401
        assert client.get("/v1/matters/mat_001", headers={"Authorization": "Bearer nope"}).status_code == 401
