"""P0 regression tests: authentication, sessions, tenant isolation, role permissions, ledger attribution.

Every test here is a negative or boundary check. If one fails, the corresponding control is broken.
"""
from __future__ import annotations

import asyncio
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import PERMISSIONS, get_actor
from app.db import db_session
from app.main import app
from app.security import sign_token
from conftest import DEMO_PASSWORD, DEMO_PASSWORDS, login

PUBLIC_ROUTES = {
    ("GET", "/v1/auth/accounts"),
    ("POST", "/v1/auth/login"),
    ("POST", "/v1/auth/signup"),
    ("GET", "/v1/meta"),
    ("GET", "/v1/health/deep"),
    ("GET", "/health/deep"),
}


@pytest.fixture
def client():
    # No lifespan: the conftest fixture already built a fresh DB, and skipping the Kanoon
    # cache warm-up keeps these tests offline and fast. Auth checks run before any analysis.
    return TestClient(app)


def _code(res) -> str:
    return res.json()["detail"]["error"]["code"]


# ------------------------------------------------------------------ A. authentication


@pytest.mark.parametrize(
    "body",
    [
        {"user_id": "senior_1"},  # omitted password
        {"user_id": "senior_1", "password": None},  # null password
        {"user_id": "senior_1", "password": ""},  # empty password
        {"email": "dhanshri.kamat@kamat-associates.insaaf.in"},  # omitted, by email
        {"email": "dhanshri.kamat@kamat-associates.insaaf.in", "password": ""},  # empty, by email
        {"user_id": "senior_1", "password": "insaaf2025"},  # incorrect
        {"email": "dhanshri.kamat@kamat-associates.insaaf.in", "password": "test-senior-1001"},  # wrong case
        {"user_id": "nobody", "password": DEMO_PASSWORD},  # unknown account
        {"password": DEMO_PASSWORD},  # no account at all
        {},
    ],
)
def test_login_rejects_missing_empty_and_wrong_passwords(client, body):
    res = client.post("/v1/auth/login", json=body)
    assert res.status_code == 401
    assert _code(res) == "invalid_credentials"
    assert "token" not in res.text
    assert DEMO_PASSWORD not in res.text  # error never leaks the demo password


def test_login_accepts_correct_password_by_id_and_email(client):
    by_id = client.post("/v1/auth/login", json={"user_id": "senior_1", "password": DEMO_PASSWORD})
    by_email = client.post("/v1/auth/login", json={"email": "DHANSHRI.KAMAT@kamat-associates.insaaf.in", "password": DEMO_PASSWORD})
    for res in (by_id, by_email):
        assert res.status_code == 200
        body = res.json()
        assert body["me"]["user_id"] == "senior_1"
        assert body["expires_at"] > time.time()
        assert body["token"].startswith("v1.")
        assert "token" not in body["me"]  # /me payload never carries the raw token
        assert len(body["me"]["session_fingerprint"]) == 12


def test_unknown_account_and_wrong_password_look_identical(client):
    a = client.post("/v1/auth/login", json={"user_id": "nobody", "password": "x"})
    b = client.post("/v1/auth/login", json={"user_id": "senior_1", "password": "x"})
    assert (a.status_code, a.json()) == (b.status_code, b.json())


def test_failed_logins_are_throttled(client):
    for _ in range(5):
        assert client.post("/v1/auth/login", json={"user_id": "junior_1", "password": "bad"}).status_code == 401
    res = client.post("/v1/auth/login", json={"user_id": "junior_1", "password": DEMO_PASSWORDS["junior_1"]})
    assert res.status_code == 429


def test_legacy_password_hash_is_upgraded_on_login(client):
    import hashlib

    legacy = hashlib.sha256(("insaaf_salt|" + DEMO_PASSWORDS["clerk_1"]).encode()).hexdigest()
    with db_session() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE user_id = 'clerk_1'", (legacy,))
    login(client, "clerk_1")
    with db_session() as conn:
        stored = conn.execute("SELECT password_hash FROM users WHERE user_id = 'clerk_1'").fetchone()[0]
    assert stored.startswith("pbkdf2_sha256$")


def test_spoofed_identity_headers_are_ignored(client):
    # The old API trusted X-Actor / X-Role. They must grant nothing now.
    res = client.get("/v1/me", headers={"X-Actor": "senior_1", "X-Role": "senior"})
    assert res.status_code == 401
    h_student = login(client, "student_1")
    me = client.get("/v1/me", headers={**h_student, "X-Actor": "senior_1", "X-Role": "senior"}).json()
    assert (me["user_id"], me["role"]) == ("student_1", "student")


def test_role_cannot_be_switched_in_session(client):
    h_junior = login(client, "junior_1")
    res = client.post("/v1/me/role", headers=h_junior, json={"role": "senior"})
    assert res.status_code == 403
    assert client.get("/v1/me", headers=h_junior).json()["role"] == "junior"


# ------------------------------------------------------------------ tokens and sessions


def _session_for(user_id: str) -> tuple[str, int]:
    with db_session() as conn:
        row = conn.execute(
            "SELECT sid, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", (user_id,)
        ).fetchone()
    return row["sid"], row["expires_at"]


@pytest.mark.parametrize(
    "auth_header",
    [
        None,
        "",
        "Bearer",
        "Bearer ",
        "Basic c2VuaW9yXzE6aW5zYWFmMjAyNg==",
        "Bearer not-a-token",
        "Bearer v1.e30.AAAA",
        "Bearer v2.e30.AAAA",
    ],
)
def test_missing_and_malformed_tokens_are_rejected(client, auth_header):
    headers = {} if auth_header is None else {"Authorization": auth_header}
    res = client.get("/v1/matters", headers=headers)
    assert res.status_code == 401
    assert res.headers.get("www-authenticate", "").lower().startswith("bearer")


def test_tampered_token_signature_and_payload_are_rejected(client):
    token = login(client, "junior_1")["Authorization"].split(" ", 1)[1]
    version, payload, sig = token.split(".")
    flipped_sig = sig[:-2] + ("AA" if sig[-2:] != "AA" else "BB")
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {version}.{payload}.{flipped_sig}"}).status_code == 401
    # Re-sign a payload claiming senior_1 without the server key: signature will not match.
    import base64
    import json

    forged_payload = base64.urlsafe_b64encode(
        json.dumps({"sid": "x", "sub": "senior_1", "iat": 0, "exp": 9999999999}).encode()
    ).decode().rstrip("=")
    assert client.get("/v1/me", headers={"Authorization": f"Bearer v1.{forged_payload}.{sig}"}).status_code == 401


def test_expired_token_is_rejected(client):
    login(client, "junior_1")
    sid, _ = _session_for("junior_1")
    now = int(time.time())
    expired = sign_token(sid, "junior_1", now - 7200, now - 60)  # validly signed but past exp
    res = client.get("/v1/me", headers={"Authorization": f"Bearer {expired}"})
    assert res.status_code == 401
    assert _code(res) == "session_expired"


def test_session_expired_server_side_is_rejected(client):
    h = login(client, "junior_1")
    sid, _ = _session_for("junior_1")
    with db_session() as conn:
        conn.execute("UPDATE sessions SET expires_at = ? WHERE sid = ?", (int(time.time()) - 1, sid))
    res = client.get("/v1/me", headers=h)
    assert res.status_code == 401
    assert _code(res) == "session_expired"


def test_token_for_unknown_session_is_rejected(client):
    now = int(time.time())
    token = sign_token("no-such-session", "senior_1", now, now + 3600)
    res = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert _code(res) == "invalid_session"


def test_token_subject_must_match_session_owner(client):
    login(client, "student_1")
    sid, exp = _session_for("student_1")
    # Correctly signed token reusing the student's session id but claiming senior_1.
    token = sign_token(sid, "senior_1", int(time.time()), exp)
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_logout_revokes_the_session(client):
    h = login(client, "junior_1")
    assert client.get("/v1/me", headers=h).status_code == 200
    assert client.post("/v1/auth/logout", headers=h).json() == {"logged_out": True}
    res = client.get("/v1/me", headers=h)
    assert res.status_code == 401
    assert _code(res) == "session_revoked"


def test_logout_only_revokes_its_own_session(client):
    h1 = login(client, "junior_1")
    h2 = login(client, "junior_1")
    client.post("/v1/auth/logout", headers=h1)
    assert client.get("/v1/me", headers=h1).status_code == 401
    assert client.get("/v1/me", headers=h2).status_code == 200


def test_role_change_in_db_takes_effect_without_new_token(client):
    h = login(client, "junior_1")
    with db_session() as conn:
        conn.execute("UPDATE users SET role = 'student' WHERE user_id = 'junior_1'")
    assert client.get("/v1/me", headers=h).json()["role"] == "student"
    assert client.post("/v1/matters", headers=h, json={"title": "x", "case_type": "property"}).status_code == 403


# ------------------------------------------------------------------ unauthenticated access


def _protected_routes():
    out = []
    for r in app.routes:
        if not hasattr(r, "dependant"):
            continue
        for method in r.methods - {"HEAD", "OPTIONS"}:
            if (method, r.path) not in PUBLIC_ROUTES:
                out.append((method, r.path))
    return sorted(out)


def test_every_non_public_route_declares_the_auth_dependency():
    def deps(d):
        found = []
        for x in d.dependencies:
            found.append(x.call)
            found += deps(x)
        return found

    unprotected = [
        (m, r.path)
        for r in app.routes
        if hasattr(r, "dependant")
        for m in r.methods - {"HEAD", "OPTIONS"}
        if (m, r.path) not in PUBLIC_ROUTES and get_actor not in deps(r.dependant)
    ]
    assert unprotected == []


@pytest.mark.parametrize("method,path", _protected_routes())
def test_unauthenticated_requests_get_401(client, method, path):
    url = path.replace("{matter_id}", "mat_001").replace("{doc_id}", "doc_pdf_01")
    res = client.request(method, url, json={})
    assert res.status_code == 401, f"{method} {url} -> {res.status_code}"


# ------------------------------------------------------------------ C. tenant isolation

A_MATTER = "mat_001"
B_MATTER = "mat_004"

READ_ENDPOINTS = [
    ("GET", "/v1/matters/{m}", None),
    ("GET", "/v1/matters/{m}/facts", None),
    ("GET", "/v1/matters/{m}/proof-ledger", None),
    ("GET", "/v1/matters/{m}/statute-clock", None),
    ("GET", "/v1/matters/{m}/precedents", None),
    ("GET", "/v1/matters/{m}/citations/health", None),
    ("GET", "/v1/matters/{m}/score", None),
    ("GET", "/v1/matters/{m}/bias-firewall", None),
    ("POST", "/v1/matters/{m}/bias-firewall/flip", {"identity": "dalit"}),
    ("GET", "/v1/matters/{m}/advice", None),
    ("GET", "/v1/matters/{m}/draft", None),
    ("GET", "/v1/matters/{m}/draft/export?format=docx", None),
    ("GET", "/v1/matters/{m}/law-changes", None),
    ("GET", "/v1/ledger?matter_id={m}", None),
]
MUTATION_ENDPOINTS = [
    ("POST", "/v1/matters/{m}/run", None),
    ("GET", "/v1/matters/{m}/events", None),
    ("POST", "/v1/matters/{m}/statute-clock/recalculate", {"cause_date": "2020-01-01"}),
    ("POST", "/v1/matters/{m}/precedents/search", {"query": "possession"}),
    ("POST", "/v1/matters/{m}/citations/check", {"citation": "Suraj Lamp"}),
    ("POST", "/v1/matters/{m}/court", {"court": "Bombay High Court (Goa bench)"}),
    ("POST", "/v1/matters/{m}/flags", {"flag": "senior_citizen"}),
    ("POST", "/v1/matters/{m}/draft/type", {"draft_type": "plaint"}),
    ("POST", "/v1/matters/{m}/draft/verify-citation", {"text": "Suraj Lamp"}),
    ("POST", "/v1/matters/{m}/reviews", {"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other"}),
    ("DELETE", "/v1/matters/{m}/documents/doc_pdf_01", None),
    ("DELETE", "/v1/matters/{m}", None),
    ("POST", "/v1/alerts/test?matter_id={m}", None),
]


@pytest.mark.parametrize("method,path,body", READ_ENDPOINTS + MUTATION_ENDPOINTS)
def test_chamber_b_cannot_touch_chamber_a_matter(client, method, path, body):
    h_b = login(client, "senior_b")  # a senior: role is never the reason for denial
    res = client.request(method, path.format(m=A_MATTER), headers=h_b, json=body)
    assert res.status_code == 404, f"{method} {path} -> {res.status_code}"
    assert "Fernandes" not in res.text and "Naik" not in res.text


@pytest.mark.parametrize("method,path,body", READ_ENDPOINTS + MUTATION_ENDPOINTS)
def test_chamber_a_cannot_touch_chamber_b_matter(client, method, path, body):
    h_a = login(client, "senior_1")
    res = client.request(method, path.format(m=B_MATTER), headers=h_a, json=body)
    assert res.status_code == 404, f"{method} {path} -> {res.status_code}"
    assert "Salgaocar" not in res.text


def test_cross_chamber_probe_is_indistinguishable_from_missing_matter(client):
    h_b = login(client, "senior_b")
    real_other = client.get(f"/v1/matters/{A_MATTER}", headers=h_b)
    nonexistent = client.get("/v1/matters/mat_does_not_exist", headers=h_b)
    assert real_other.status_code == nonexistent.status_code == 404
    assert real_other.json()["detail"]["error"]["code"] == nonexistent.json()["detail"]["error"]["code"]


def test_cross_chamber_listings_are_filtered(client):
    h_a = login(client, "senior_1")
    h_b = login(client, "senior_b")
    for path in ("/v1/matters", "/v1/queue", "/v1/alerts"):
        a_ids = {x.get("matter_id") or x.get("id") for x in client.get(path, headers=h_a).json()}
        b_ids = {x.get("matter_id") or x.get("id") for x in client.get(path, headers=h_b).json()}
        assert B_MATTER not in a_ids, path
        assert b_ids and not (b_ids & a_ids) and A_MATTER not in b_ids, path
    b_logs = client.get("/v1/access-logs", headers=h_b).json()
    b_all = {m["id"] for m in client.get("/v1/matters", headers=h_b).json()}
    assert all(entry["matter_id"] in b_all | {"chamber"} for entry in b_logs)


def test_flag_response_does_not_leak_other_chambers(client):
    h_b = login(client, "senior_b")
    queue = client.post(f"/v1/matters/{B_MATTER}/flags", headers=h_b, json={"flag": "senior_citizen"}).json()
    ids = {q["matter_id"] for q in queue}
    assert B_MATTER in ids and A_MATTER not in ids


@pytest.mark.slow  # computes live analysis stages (Kanoon / LLM); run with --run-slow
def test_cross_chamber_document_upload_delete_and_export(client):
    h_a = login(client, "senior_1")
    h_b = login(client, "senior_b")
    files = {"file": ("note.txt", b"chamber b secret", "text/plain")}
    assert client.post(f"/v1/matters/{A_MATTER}/documents", headers=h_b, files=files).status_code == 404
    up = client.post(f"/v1/matters/{B_MATTER}/documents", headers=h_b, files=files)
    assert up.status_code == 200
    doc_id = up.json()["id"]
    # Chamber A cannot delete B's document, through either matter id.
    assert client.delete(f"/v1/matters/{B_MATTER}/documents/{doc_id}", headers=h_a).status_code == 404
    assert client.delete(f"/v1/matters/{A_MATTER}/documents/{doc_id}", headers=h_a).status_code == 404
    with db_session() as conn:
        assert conn.execute("SELECT COUNT(*) FROM documents WHERE id = ?", (doc_id,)).fetchone()[0] == 1
    assert client.get(f"/v1/matters/{B_MATTER}/draft/export?format=docx", headers=h_a).status_code == 404
    assert client.get(f"/v1/matters/{B_MATTER}/draft/export?format=docx", headers=h_b).status_code == 200


@pytest.mark.slow  # computes live analysis stages (Kanoon / LLM); run with --run-slow
def test_cross_chamber_ledger_filtering(client):
    h_a = login(client, "senior_1")
    h_b = login(client, "senior_b")
    client.post(
        f"/v1/matters/{B_MATTER}/reviews",
        headers=h_b,
        json={"action": "override", "target": "score", "target_id": "score", "reason_code": "score_disagree", "note": "B only"},
    )
    a_entries = client.get("/v1/ledger?matter_id=all", headers=h_a).json()["entries"]
    b_entries = client.get("/v1/ledger?matter_id=all", headers=h_b).json()["entries"]
    assert all(e["matter_id"] != B_MATTER for e in a_entries)
    assert b_entries and all(e["matter_id"] == B_MATTER for e in b_entries)


# ------------------------------------------------------------------ D. role permissions

STUDENT_MUTATIONS = [
    ("POST", "/v1/matters", {"title": "Moot", "case_type": "property"}),
    ("DELETE", f"/v1/matters/{A_MATTER}", None),
    ("DELETE", f"/v1/matters/{A_MATTER}/documents/doc_pdf_01", None),
    ("POST", f"/v1/matters/{A_MATTER}/run", None),
    ("GET", f"/v1/matters/{A_MATTER}/events", None),
    ("POST", f"/v1/matters/{A_MATTER}/statute-clock/recalculate", {"cause_date": "2020-01-01"}),
    ("POST", f"/v1/matters/{A_MATTER}/precedents/search", {"query": "possession"}),
    ("POST", f"/v1/matters/{A_MATTER}/citations/check", {"citation": "Suraj Lamp"}),
    ("POST", f"/v1/matters/{A_MATTER}/court", {"court": "Bombay High Court (Goa bench)"}),
    ("POST", f"/v1/matters/{A_MATTER}/flags", {"flag": "senior_citizen"}),
    ("POST", f"/v1/matters/{A_MATTER}/draft/type", {"draft_type": "plaint"}),
    ("POST", f"/v1/matters/{A_MATTER}/draft/verify-citation", {"text": "Suraj Lamp"}),
    ("GET", f"/v1/matters/{A_MATTER}/draft/export?format=docx", None),
    ("POST", f"/v1/matters/{A_MATTER}/reviews", {"action": "edit", "target": "fact", "target_id": "fact_01", "reason_code": "wrong_fact", "note": "x"}),
    ("POST", f"/v1/matters/{A_MATTER}/reviews", {"action": "submit", "target": "draft", "target_id": "draft", "reason_code": "other"}),
    ("POST", f"/v1/matters/{A_MATTER}/reviews", {"action": "override", "target": "score", "target_id": "score", "reason_code": "score_disagree"}),
    ("POST", f"/v1/matters/{A_MATTER}/reviews", {"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other"}),
    ("POST", "/v1/alerts/test", None),
    ("POST", "/v1/ledger/tamper", None),
    ("POST", "/v1/ml/retrain", None),
    ("POST", "/v1/demo/reset", None),
]


@pytest.mark.parametrize("method,path,body", STUDENT_MUTATIONS)
def test_student_is_read_only(client, method, path, body):
    h = login(client, "student_1")
    files = None
    res = client.request(method, path, headers=h, json=body, files=files)
    assert res.status_code == 403, f"{method} {path} -> {res.status_code}"


def test_student_cannot_upload_and_nothing_changed(client):
    h = login(client, "student_1")
    before = _db_fingerprint()
    res = client.post(f"/v1/matters/{A_MATTER}/documents", headers=h, files={"file": ("x.txt", b"x", "text/plain")})
    assert res.status_code == 403
    assert _db_fingerprint() == before


@pytest.mark.slow  # computes live analysis stages (Kanoon / LLM); run with --run-slow
def test_student_can_read_moot_matter(client):
    h = login(client, "student_1")
    assert client.get(f"/v1/matters/{A_MATTER}/facts", headers=h).status_code == 200
    assert client.post(f"/v1/matters/{A_MATTER}/bias-firewall/flip", headers=h, json={"identity": "female"}).status_code == 200


def _db_fingerprint():
    with db_session() as conn:
        return tuple(
            conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in ("matters", "documents", "ledger_entries", "stage_results")
        )


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("DELETE", f"/v1/matters/{A_MATTER}", None),
        ("DELETE", f"/v1/matters/{A_MATTER}/documents/doc_pdf_01", None),
        ("POST", f"/v1/matters/{A_MATTER}/reviews", {"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other"}),
        ("POST", f"/v1/matters/{A_MATTER}/reviews", {"action": "override", "target": "citation", "target_id": "src_x", "reason_code": "other"}),
        ("POST", f"/v1/matters/{A_MATTER}/reviews", {"action": "submit", "target": "draft", "target_id": "draft", "reason_code": "other"}),
        ("POST", f"/v1/matters/{A_MATTER}/reviews", {"action": "edit", "target": "fact", "target_id": "fact_01", "reason_code": "wrong_fact", "note": "x"}),
        ("POST", f"/v1/matters/{A_MATTER}/run", None),
        ("POST", "/v1/ml/retrain", None),
        ("POST", "/v1/demo/reset", None),
        ("POST", "/v1/ledger/tamper", None),
    ],
)
def test_clerk_cannot_delete_approve_or_decide(client, method, path, body):
    h = login(client, "clerk_1")
    res = client.request(method, path, headers=h, json=body)
    assert res.status_code == 403, f"{method} {path} -> {res.status_code}"


def test_clerk_permitted_duties(client):
    h = login(client, "clerk_1")
    created = client.post("/v1/matters", headers=h, json={"title": "Intake", "case_type": "property"})
    assert created.status_code == 200
    mid = created.json()["id"]
    assert client.post(f"/v1/matters/{mid}/documents", headers=h, files={"file": ("n.txt", b"note", "text/plain")}).status_code == 200
    assert client.post(f"/v1/matters/{A_MATTER}/flags", headers=h, json={"flag": "interim_relief"}).status_code == 200
    # Criminal matters stay hidden from clerks.
    assert client.get("/v1/matters/mat_003", headers=h).status_code == 403


@pytest.mark.parametrize(
    "body",
    [
        {"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other"},
        {"action": "override", "target": "score", "target_id": "score", "reason_code": "score_disagree"},
        {"action": "override", "target": "citation", "target_id": "src_x", "reason_code": "wrong_citation_treatment"},
        {"action": "override", "target": "proof", "target_id": "Registered sale deed", "reason_code": "other"},
        {"action": "override", "target": "advice", "target_id": "advice", "reason_code": "other", "diff": {"recommendation": "fight"}},
    ],
)
def test_junior_cannot_approve_or_override(client, body):
    h = login(client, "junior_1")
    before = _db_fingerprint()
    res = client.post(f"/v1/matters/{A_MATTER}/reviews", headers=h, json=body)
    assert res.status_code == 403
    assert _db_fingerprint() == before  # no ledger row, no stage change


@pytest.mark.slow  # computes live analysis stages (Kanoon / LLM); run with --run-slow
def test_junior_can_edit_and_submit_for_review(client):
    h = login(client, "junior_1")
    edit = client.post(
        f"/v1/matters/{A_MATTER}/reviews",
        headers=h,
        json={"action": "edit", "target": "fact", "target_id": "fact_01", "reason_code": "wrong_fact", "note": "Client confirmed date"},
    )
    assert edit.status_code == 200
    sub = client.post(
        f"/v1/matters/{A_MATTER}/reviews",
        headers=h,
        json={"action": "submit", "target": "draft", "target_id": "draft", "reason_code": "other"},
    )
    assert sub.status_code == 200 and sub.json()["action"] == "submit"
    assert client.get(f"/v1/matters/{A_MATTER}", headers=h).json()["status"] == "in_review"
    assert "AWAITING SENIOR APPROVAL" in client.get(f"/v1/matters/{A_MATTER}/draft", headers=h).json()["watermark"]


@pytest.mark.slow  # computes live analysis stages (Kanoon / LLM); run with --run-slow
def test_senior_can_approve(client):
    h = login(client, "senior_1")
    res = client.post(
        f"/v1/matters/{A_MATTER}/reviews",
        headers=h,
        json={"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other", "note": "Checked"},
    )
    assert res.status_code == 200
    assert client.get(f"/v1/matters/{A_MATTER}", headers=h).json()["status"] == "approved"
    assert "APPROVED BY senior_1 (SENIOR)" in client.get(f"/v1/matters/{A_MATTER}/draft", headers=h).json()["watermark"]


def test_permission_matrix_shape():
    assert PERMISSIONS["review.approve"] == {"senior"}
    assert PERMISSIONS["review.override"] == {"senior"}
    assert PERMISSIONS["matter.delete"] == {"senior"}
    student_writes = [p for p, roles in PERMISSIONS.items() if "student" in roles and p != "matter.read"]
    assert student_writes == []


# ------------------------------------------------------------------ ledger attribution


@pytest.mark.slow  # computes live analysis stages (Kanoon / LLM); run with --run-slow
def test_ledger_entries_carry_the_actors_real_organisation(client):
    h_a = login(client, "senior_1")
    h_b = login(client, "senior_b")
    ea = client.post(
        f"/v1/matters/{A_MATTER}/reviews",
        headers=h_a,
        json={"action": "override", "target": "score", "target_id": "score", "reason_code": "score_disagree"},
    ).json()
    eb = client.post(
        f"/v1/matters/{B_MATTER}/reviews",
        headers=h_b,
        json={"action": "override", "target": "score", "target_id": "score", "reason_code": "score_disagree"},
    ).json()
    assert (ea["org_id"], eb["org_id"]) == ("org_chamber_a", "org_chamber_b")
    with db_session() as conn:
        rows = dict(conn.execute("SELECT id, org_id FROM ledger_entries WHERE id IN (?, ?)", (ea["id"], eb["id"])).fetchall())
    assert rows == {ea["id"]: "org_chamber_a", eb["id"]: "org_chamber_b"}
    assert client.get("/v1/ledger/verify", headers=h_a).json()["valid"] is True


def test_append_ledger_entry_requires_org():
    from app.ledger.chain import append_ledger_entry

    with pytest.raises(TypeError):
        append_ledger_entry("a", "senior", "mat_001", "edit", "fact", "f", "other", "n")  # type: ignore[call-arg]


# ------------------------------------------------------------------ concurrency


def test_concurrent_requests_do_not_share_identity():
    c = TestClient(app)
    tokens = {uid: login(c, uid) for uid in ("senior_1", "junior_1", "clerk_1", "student_1", "senior_b")}

    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            async def who(uid):
                me = (await ac.get("/v1/me", headers=tokens[uid])).json()
                matters = (await ac.get("/v1/matters", headers=tokens[uid])).json()
                return uid, me["user_id"], me["org"]["id"], {m["id"] for m in matters}

            jobs = [who(uid) for _ in range(12) for uid in tokens]
            return await asyncio.gather(*jobs)

    results = asyncio.run(run())
    assert len(results) == 60
    for asked, got_uid, org, ids in results:
        assert asked == got_uid
        if asked == "senior_b":
            assert org == "org_chamber_b" and B_MATTER in ids and A_MATTER not in ids
        else:
            assert org == "org_chamber_a" and B_MATTER not in ids
        if asked == "student_1":
            assert A_MATTER in ids and "mat_002" not in ids and "mat_003" not in ids
        if asked == "clerk_1":
            assert "mat_003" not in ids
