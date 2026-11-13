"""FastAPI routes implementing docs/API_CONTRACT.md."""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import fitz
from docx import Document
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse

from app.auth import (
    REVIEW_ACTION_PERMISSION,
    create_session,
    get_actor,
    login_throttle,
    permissions_for,
    require,
    resolve_token,
    revoke_session,
)
from app.config import UPLOADS_DIR, settings
from app.config import today as app_today
from app.demo_accounts import DEMO_USERS
from app import registry
from app.db import (
    clear_stage_results,
    db_session,
    encrypt_envelope_bytes,
    get_stage_result,
    init_db,
    log_access,
    save_stage_result,
)
from app.security import DUMMY_PASSWORD_HASH, hash_password, needs_rehash, verify_password
from app.ledger.chain import (
    append_ledger_entry,
    check_solana_devnet_health,
    get_ledger,
    verify_ledger_chain,
)
from app.ml.service import (
    compute_bias_firewall_and_score,
    get_current_model_version,
    retrain_from_overrides,
    run_single_identity_flip,
)
from app.models.schemas import (
    AccessLogEntry,
    AddMemberRequest,
    AddMemberResponse,
    OrgMember,
    SignupRequest,
    UpdateMatterRequest,
    Advice,
    AlertItem,
    AuthAccount,
    BiasFirewall,
    BiasFirewallRow,
    CitationCheckRequest,
    CitationHealth,
    ClockRecalculateRequest,
    CreateMatterRequest,
    DraftParagraphEdit,
    DeepHealthResponse,
    Draft,
    Fact,
    FlipRequest,
    LawChangeItem,
    LawScanRequest,
    LedgerEntry,
    LedgerResponse,
    LedgerVerify,
    LoginRequest,
    LoginResponse,
    Matter,
    MatterDocument,
    MeResponse,
    ModelInfoResponse,
    PipelineRunResponse,
    PrecedentSearchRequest,
    Precedents,
    ProofLedgerResponse,
    QueueItem,
    RetrainResponse,
    ReviewRequest,
    Score,
    SetCourtRequest,
    SetDraftTypeRequest,
    SetRoleRequest,
    StatuteClock,
    ToggleFlagRequest,
    VerifyCitationRequest,
    VerifyCitationResponse,
)
from app.pipeline.orchestrator import (
    build_draft_docx_bytes,
    build_draft_pdf_bytes,
    draft_with_render,
    CitationNotFoundError,
    check_matter_citation,
    compute_nyaya_queue,
    ensure_stage,
    recalculate_matter_clock,
    run_pipeline_stream,
    run_precedent_search,
    seed_fast_stage_results,
    set_matter_court,
    set_matter_draft_type,
    toggle_matter_flag,
)
from app.rules_engine.engine import evaluate_advice, evaluate_law_changes
from app.services.bhashini.client import bhashini_client, translation_client
from app.services.precedents.service import precedent_client
from app.services.llm.client import llm_client, normalize_fact_cards
from app.services.notify.client import notify_client

router = APIRouter()

ALLOWED_UPLOAD_SUFFIXES = {".pdf", ".docx", ".txt", ".json", ".m4a", ".wav", ".mp3", ".ogg", ".webm"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

Actor = dict[str, Any]

_RLS_POLICY_NOTE = {
    "senior": "Full chamber access · approve & seal pleadings · override findings",
    "junior": "Full chamber access · intake, pipeline, fact edits · submit for senior review; cannot approve or override",
    "clerk": "Civil & property matters only · criminal matters hidden · intake, upload, docket flags, export",
    "student": "Law-school mode · moot-tagged matters and own practice matters · read-only analysis",
}
_META_FIELDS = {"forum_hint", "client_language", "state", "district", "court_seat", "client_name", "opposite_party"}

# The account picker is a demo convenience. Set INSAAF_EXPOSE_DEMO_ACCOUNTS=false outside a demo.
_EXPOSE_DEMO_ACCOUNTS = os.getenv("INSAAF_EXPOSE_DEMO_ACCOUNTS", "true").lower() == "true"
_DEMO_USER_IDS = {u[0] for u in DEMO_USERS}


def _err(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


def _can_access_matter(matter: dict[str, Any], actor: Actor) -> bool:
    """Chamber isolation plus in-chamber role visibility."""
    if matter.get("org_id") != actor["org_id"]:
        return False
    role = actor["role"]
    if role == "clerk" and matter.get("case_type") == "criminal":
        return False
    if role == "student":
        return bool(matter.get("moot")) or matter.get("created_by") == actor["user_id"]
    return True


def _visible_matter_ids(actor: Actor) -> set[str]:
    with db_session() as conn:
        rows = conn.execute("SELECT id, org_id, case_type, created_by, moot FROM matters WHERE org_id = ?", (actor["org_id"],)).fetchall()
    return {r["id"] for r in rows if _can_access_matter(dict(r), actor)}


def _build_me_payload(actor: Actor) -> dict[str, Any]:
    org_id = actor["org_id"]
    with db_session() as conn:
        members_rows = conn.execute(
            "SELECT user_id, email, name, role, last_seen FROM users WHERE org_id = ? ORDER BY user_id ASC",
            (org_id,),
        ).fetchall()
    members = [
        {"user_id": r["user_id"], "email": r["email"], "name": r["name"], "role": r["role"], "last_seen": r["last_seen"]}
        for r in members_rows
    ]
    return {
        "user_id": actor["user_id"],
        "name": actor["name"],
        "role": actor["role"],
        "email": actor.get("email"),
        "key_fingerprint": actor.get("key_fingerprint"),
        "rls_policy": _RLS_POLICY_NOTE.get(actor["role"], ""),
        "permissions": permissions_for(actor["role"]),
        "session_fingerprint": actor.get("session_fingerprint"),
        "session_expires_at": actor.get("session_expires_at"),
        "org": {
            "id": org_id,
            "name": actor["org_name"],
            "plan": actor["org_plan"],
            "members": members,
        },
    }


def _format_matter_row(row: dict[str, Any], conn) -> dict[str, Any]:
    docs = conn.execute(
        "SELECT id, filename, kind, pages, storage_path, created_at FROM documents WHERE matter_id = ? ORDER BY created_at ASC",
        (row["id"],),
    ).fetchall()
    doc_list = []
    for d in docs:
        p = Path(d["storage_path"])
        size = p.stat().st_size if p.exists() else 0
        kind_mapped = "voice" if d["kind"] == "audio" else (d["kind"] if d["kind"] in ("pdf", "docx") else "other")
        transcript = None
        if d["kind"] == "audio":
            try:
                tr = json.loads(conn.execute("SELECT extracted_text FROM documents WHERE id = ?", (d["id"],)).fetchone()[0] or "{}")
                transcript = {
                    "language": tr.get("language"),
                    "original_text": tr.get("original_text", ""),
                    "english_translation": tr.get("english_translation", ""),
                    "status": tr.get("status") or ("transcribed" if tr.get("english_translation") else "pending"),
                    "has_audio": p.suffix.lower() != ".json" and p.exists(),
                }
            except Exception:
                transcript = {"status": "pending", "original_text": "", "english_translation": "", "has_audio": p.exists()}
        doc_list.append(
            {
                "transcript": transcript,
                "id": d["id"],
                "name": d["filename"],
                "kind": kind_mapped,
                "size": size,
                "added_at": d["created_at"],
                "document_id": d["id"],
                "pages": d["pages"],
            }
        )
    row["documents"] = doc_list
    row["moot"] = bool(row.get("moot"))
    return row


def _authorized_matter(matter_id: str, actor: Actor, permission: str = "matter.read") -> dict[str, Any]:
    """Load a matter the actor may act on, or raise.

    Missing matters and other chambers' matters return the same 404, so IDs cannot be probed.
    Same-chamber matters hidden from the role (clerk/criminal, student/non-moot) return 403.
    """
    require(actor, permission)
    with db_session() as conn:
        row = conn.execute("SELECT * FROM matters WHERE id = ?", (matter_id,)).fetchone()
        if not row or row["org_id"] != actor["org_id"]:
            raise _err(404, "not_found", f"Matter {matter_id} not found")
        formatted = _format_matter_row(dict(row), conn)
    if not _can_access_matter(formatted, actor):
        raise _err(
            403,
            "rls_forbidden",
            f"{actor['name']} ({actor['role']}) cannot access matter {matter_id} under chamber row-level security.",
        )
    return formatted


def _load_docs(matter_id: str) -> list[dict[str, Any]]:
    with db_session() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM documents WHERE matter_id = ?", (matter_id,)).fetchall()]


def _load_matter(matter_id: str) -> dict[str, Any]:
    """Internal loader with no access check. Call only after _authorized_matter for the same request."""
    with db_session() as conn:
        row = conn.execute("SELECT * FROM matters WHERE id = ?", (matter_id,)).fetchone()
        if not row:
            raise _err(404, "not_found", f"Matter {matter_id} not found")
        return _format_matter_row(dict(row), conn)


@router.get("/auth/accounts", response_model=list[AuthAccount])
async def list_auth_accounts() -> list[dict[str, Any]]:
    if not _EXPOSE_DEMO_ACCOUNTS:
        raise _err(404, "not_found", "Not found")
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY org_id ASC, user_id ASC").fetchall()
    return [
        {
            "user_id": r["user_id"],
            "email": r["email"],
            "name": r["name"],
            "role": r["role"],
            "org_id": r["org_id"],
            "org_name": r["org_name"],
            "org_plan": r["org_plan"],
            "visibility_note": _RLS_POLICY_NOTE.get(r["role"], ""),
        }
        for r in rows
        if r["user_id"] in _DEMO_USER_IDS
    ]


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:24] or "chamber"


@router.get("/meta")
async def get_meta() -> dict[str, Any]:
    """Public reference data: practice areas, languages, instruments (no tenant data)."""
    return registry.meta_payload()


@router.post("/auth/signup", response_model=LoginResponse)
async def auth_signup(body: SignupRequest) -> dict[str, Any]:
    """Self-serve sign-up: creates a new chamber (tenant) with the caller as its senior advocate."""
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise _err(422, "invalid_email", "Enter a valid email address.")
    if login_throttle.blocked("signup:" + email):
        raise _err(429, "too_many_attempts", "Too many sign-up attempts. Try again in a few minutes.")
    if body.password.lower() in (body.name.lower(), email) or len(set(body.password)) < 5:
        raise _err(422, "weak_password", "Choose a stronger password (10+ characters, not your name or email).")
    with db_session() as conn:
        if conn.execute("SELECT 1 FROM users WHERE lower(email) = ?", (email,)).fetchone():
            login_throttle.fail("signup:" + email)
            raise _err(409, "email_taken", "An account with this email already exists. Sign in instead.")
        org_id = f"org_{_slug(body.chamber_name)}_{uuid.uuid4().hex[:6]}"
        user_id = f"usr_{uuid.uuid4().hex[:10]}"
        org_name = body.chamber_name.strip() + (f" — {body.city.strip()}" if body.city and body.city.strip() else "")
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute(
            """
            INSERT INTO users (user_id, email, password_hash, name, role, org_id, org_name, org_plan, key_fingerprint, last_seen)
            VALUES (?, ?, ?, ?, 'senior', ?, ?, 'chamber', ?, ?)
            """,
            (user_id, email, hash_password(body.password), body.name.strip(), org_id, org_name, f"aes256-{uuid.uuid4().hex[:4]}", now_iso),
        )
        user = dict(conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone())
    session = create_session(user)
    actor = resolve_token(session["token"])
    log_access(actor["name"], actor["role"], "chamber", "POST /auth/signup", org_id=actor["org_id"])
    return {"token": session["token"], "expires_at": session["expires_at"], "me": _build_me_payload(actor)}


@router.get("/org/members", response_model=list[OrgMember])
async def list_org_members(actor: Actor = Depends(get_actor)) -> list[dict[str, Any]]:
    return _build_me_payload(actor)["org"]["members"]


@router.post("/org/members", response_model=AddMemberResponse)
async def add_org_member(body: AddMemberRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    """Senior adds a junior / clerk / student to their own chamber. Returns a one-time password to hand over."""
    require(actor, "org.manage")
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise _err(422, "invalid_email", "Enter a valid email address.")
    temp = f"{secrets.token_urlsafe(9)}"
    user_id = f"usr_{uuid.uuid4().hex[:10]}"
    with db_session() as conn:
        if conn.execute("SELECT 1 FROM users WHERE lower(email) = ?", (email,)).fetchone():
            raise _err(409, "email_taken", "An account with this email already exists.")
        plan = "student" if body.role == "student" else actor["org_plan"]
        conn.execute(
            """
            INSERT INTO users (user_id, email, password_hash, name, role, org_id, org_name, org_plan, key_fingerprint, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, email, hash_password(temp), body.name.strip(), body.role, actor["org_id"], actor["org_name"], plan, actor["key_fingerprint"], "never"),
        )
    append_ledger_entry(
        actor=actor["user_id"], role=actor["role"], matter_id="chamber", action="edit", target="member",
        target_id=user_id, reason_code="member_added", note=f"Added {body.name.strip()} as {body.role}", org_id=actor["org_id"],
    )
    return {"user_id": user_id, "email": email, "name": body.name.strip(), "role": body.role, "temporary_password": temp}


@router.post("/auth/login", response_model=LoginResponse)
async def auth_login(body: LoginRequest) -> dict[str, Any]:
    identifier = (body.email or body.user_id or "").strip()
    password = body.password or ""
    if not identifier or not password:
        raise _err(401, "invalid_credentials", "Account and password are required.")
    throttle_key = identifier.lower()
    if login_throttle.blocked(throttle_key):
        raise _err(429, "too_many_attempts", "Too many failed sign-in attempts. Try again in a few minutes.")
    with db_session() as conn:
        if body.email:
            row = conn.execute("SELECT * FROM users WHERE lower(email) = lower(?)", (identifier,)).fetchone()
        else:
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (identifier,)).fetchone()
    user = dict(row) if row else None
    # Always run the hash check so unknown accounts and wrong passwords take the same time.
    password_ok = verify_password(password, user["password_hash"] if user else DUMMY_PASSWORD_HASH)
    if not user or not password_ok:
        login_throttle.fail(throttle_key)
        raise _err(401, "invalid_credentials", "Incorrect account or password.")
    login_throttle.reset(throttle_key)
    if needs_rehash(user["password_hash"]):
        with db_session() as conn:
            conn.execute("UPDATE users SET password_hash = ? WHERE user_id = ?", (hash_password(password), user["user_id"]))
    session = create_session(user)
    actor = resolve_token(session["token"])
    log_access(actor["name"], actor["role"], "chamber", "POST /auth/login", org_id=actor["org_id"])
    return {"token": session["token"], "expires_at": session["expires_at"], "me": _build_me_payload(actor)}


@router.post("/auth/logout")
async def auth_logout(actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    revoke_session(actor["session_id"])
    log_access(actor["name"], actor["role"], "chamber", "POST /auth/logout", org_id=actor["org_id"])
    return {"logged_out": True}


@router.get("/me", response_model=MeResponse)
async def get_me(actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    return _build_me_payload(actor)


@router.post("/me/role")
async def set_me_role(body: SetRoleRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    # Role comes from the account. Changing it in-session would be privilege escalation.
    raise _err(403, "role_switch_disabled", "Roles are tied to accounts. Sign in as a different account to change role.")


@router.get("/matters", response_model=list[Matter])
async def list_matters(
    actor: Actor = Depends(get_actor),
) -> list[dict[str, Any]]:
    with db_session() as conn:
        rows = conn.execute(
            "SELECT * FROM matters WHERE org_id = ? ORDER BY priority DESC, updated_at DESC", (actor["org_id"],)
        ).fetchall()
        visible = [_format_matter_row(dict(r), conn) for r in rows if _can_access_matter(dict(r), actor)]
        return visible


@router.delete("/matters/{matter_id}")
async def delete_matter(
    matter_id: str,
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    _authorized_matter(matter_id, actor, "matter.delete")
    with db_session() as conn:
        conn.execute("DELETE FROM matters WHERE id = ? AND org_id = ?", (matter_id, actor["org_id"]))
    return {"deleted": matter_id}


@router.delete("/matters/{matter_id}/documents/{doc_id}")
async def delete_document(
    matter_id: str,
    doc_id: str,
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    _authorized_matter(matter_id, actor, "document.delete")
    with db_session() as conn:
        cur = conn.execute("DELETE FROM documents WHERE id = ? AND matter_id = ?", (doc_id, matter_id))
        if cur.rowcount == 0:
            raise _err(404, "not_found", f"Document {doc_id} not found")
    clear_stage_results(matter_id)  # F4: facts/scores derived from the removed document are stale
    return {"deleted": doc_id}


def _check_area(case_type: str | None) -> None:
    if case_type is not None and not registry.is_area(case_type):
        raise _err(422, "unknown_practice_area", f"'{case_type}' is not a supported practice area.")


def _check_language(code: str | None) -> None:
    if code is not None and code not in registry.languages():
        raise _err(422, "unknown_language", f"'{code}' is not a supported client language.")


def _check_cause_date(value: str | None) -> None:
    if not value:
        return
    try:
        d = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise _err(422, "invalid_date", "Cause of action date must be YYYY-MM-DD.")
    today = app_today()
    if d > today:
        raise _err(422, "future_cause_date", "Cause of action cannot be in the future.")
    if d.year < today.year - 60:
        raise _err(422, "cause_date_too_old", "Cause of action is more than 60 years old; check the date.")


@router.post("/matters", response_model=Matter)
async def create_matter(
    body: CreateMatterRequest,
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    require(actor, "matter.create")
    _check_area(body.case_type)
    _check_language(body.client_language)
    _check_cause_date(body.cause_date)
    matter_id = f"mat_{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    forum = body.forum_hint or registry.area(body.case_type).get("forum")
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO matters (id, org_id, title, case_type, status, priority, next_deadline, days_left, forum_hint, client_language,
                                 created_by, updated_at, state, district, court_seat, cause_date, client_name, opposite_party, summary, moot)
            VALUES (?, ?, ?, ?, 'draft', 0.50, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                matter_id, actor["org_id"], body.title, body.case_type, forum, body.client_language or "en",
                actor["user_id"], now_iso, body.state, body.district, body.court_seat, body.cause_date,
                body.client_name, body.opposite_party, body.summary, 1 if actor["role"] == "student" else 0,
            ),
        )
    return _authorized_matter(matter_id, actor)


@router.patch("/matters/{matter_id}", response_model=Matter)
async def update_matter(matter_id: str, body: UpdateMatterRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    """Edit the matter record. Advocates edit everything; clerks edit filing metadata only."""
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not changes:
        return _authorized_matter(matter_id, actor)
    needs_full = any(k not in _META_FIELDS for k in changes)
    matter = _authorized_matter(matter_id, actor, "matter.edit" if needs_full else "matter.edit_meta")
    _check_area(changes.get("case_type"))
    _check_language(changes.get("client_language"))
    _check_cause_date(changes.get("cause_date"))
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cols = ", ".join(f"{k} = ?" for k in changes)
    with db_session() as conn:
        conn.execute(f"UPDATE matters SET {cols}, updated_at = ? WHERE id = ?", (*changes.values(), now_iso, matter_id))
    # Analysis depends on area, forum, locality and dates: invalidate it so the next read recomputes.
    if any(k in changes for k in ("case_type", "forum_hint", "state", "district", "court_seat", "cause_date")):
        clear_stage_results(matter_id)
    diff = {k: {"from": matter.get(k), "to": v} for k, v in changes.items()}
    append_ledger_entry(
        actor=actor["user_id"], role=actor["role"], matter_id=matter_id, action="edit", target="matter",
        target_id=matter_id, reason_code="matter_edit", note="Edited " + ", ".join(changes), org_id=actor["org_id"], diff=diff,
    )
    return _authorized_matter(matter_id, actor)


@router.post("/translate")
async def translate_text(body: dict[str, Any], actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    text = str(body.get("text") or "")[:4000]
    src = str(body.get("source") or "auto")
    tgt = str(body.get("target") or "en")
    _check_language(tgt)
    return await translation_client.translate(text, src, tgt)


@router.post("/matters/{matter_id}/language", response_model=Matter)
async def set_client_language(matter_id: str, body: dict[str, Any], actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    """Change the client's statement language and re-translate every client statement on file."""
    lang = str(body.get("language") or "")
    _check_language(lang)
    _authorized_matter(matter_id, actor, "matter.edit_meta")
    with db_session() as conn:
        conn.execute("UPDATE matters SET client_language = ? WHERE id = ?", (lang, matter_id))
        docs = [dict(r) for r in conn.execute("SELECT id, kind, extracted_text FROM documents WHERE matter_id = ? AND kind = 'audio'", (matter_id,)).fetchall()]
    for d in docs:
        try:
            tr = json.loads(d["extracted_text"] or "{}")
        except json.JSONDecodeError:
            continue
        if tr.get("original_text"):
            res = await translation_client.translate(tr["original_text"], lang)
            if res["text"]:
                tr.update({"language": lang, "english_translation": res["text"], "translation_confidence": res["confidence"], "status": "transcribed"})
                with db_session() as conn:
                    conn.execute("UPDATE documents SET extracted_text = ? WHERE id = ?", (json.dumps(tr, ensure_ascii=False), d["id"]))
    clear_stage_results(matter_id)
    return _authorized_matter(matter_id, actor)


@router.get("/matters/{matter_id}/documents/{document_id}/audio")
async def get_document_audio(matter_id: str, document_id: str, actor: Actor = Depends(get_actor)) -> Response:
    _authorized_matter(matter_id, actor)
    with db_session() as conn:
        row = conn.execute("SELECT storage_path, filename FROM documents WHERE id = ? AND matter_id = ?", (document_id, matter_id)).fetchone()
    if not row or not Path(row["storage_path"]).exists() or Path(row["storage_path"]).suffix.lower() == ".json":
        raise _err(404, "not_found", "No audio recording stored for this document.")
    path = Path(row["storage_path"])
    from app.services.bhashini.client import AUDIO_MIME_TYPES

    return Response(content=path.read_bytes(), media_type=AUDIO_MIME_TYPES.get(path.suffix.lower(), "application/octet-stream"))


@router.post("/matters/{matter_id}/documents/{document_id}/transcribe")
async def retranscribe_document(matter_id: str, document_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    matter = _authorized_matter(matter_id, actor, "document.upload")
    with db_session() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ? AND matter_id = ?", (document_id, matter_id)).fetchone()
    if not row or row["kind"] != "audio":
        raise _err(404, "not_found", "Voice note not found.")
    tr = await translation_client.translate_or_transcribe(file_path=Path(row["storage_path"]), source_lang=matter.get("client_language") or "en")
    with db_session() as conn:
        conn.execute("UPDATE documents SET extracted_text = ? WHERE id = ?", (json.dumps(tr, ensure_ascii=False), document_id))
    clear_stage_results(matter_id)
    return tr


@router.get("/matters/{matter_id}", response_model=Matter)
async def get_matter(
    matter_id: str,
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    m = _authorized_matter(matter_id, actor)
    log_access(actor["name"], actor["role"], matter_id, f"GET /matters/{matter_id}", org_id=actor["org_id"])
    return m


@router.post("/matters/{matter_id}/documents", response_model=MatterDocument)
async def upload_document(
    matter_id: str,
    file: UploadFile = File(...),
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    matter = _authorized_matter(matter_id, actor, "document.upload")
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    doc_id = f"doc_{uuid.uuid4().hex[:8]}"
    # Never trust a client path: keep only a safe basename.
    fname = re.sub(r"[^A-Za-z0-9._ -]", "_", Path((file.filename or "upload.bin").replace("\\", "/")).name).strip(" .") or "upload.bin"
    suffix = Path(fname).suffix.lower()
    if suffix not in ALLOWED_UPLOAD_SUFFIXES:
        raise _err(415, "unsupported_file_type", f"'{suffix or fname}' is not supported. Upload PDF, DOCX, TXT, or a voice note (WAV/MP3/M4A/OGG/WEBM/JSON).")
    content = await file.read()
    if not content:
        raise _err(400, "empty_file", "The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise _err(413, "file_too_large", f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")
    save_path = UPLOADS_DIR / f"{doc_id}_{fname}"
    save_path.write_bytes(content)

    # Envelope encryption at rest per org_id
    enc_bytes, enc_meta = encrypt_envelope_bytes(matter.get("org_id", "org_chamber_a"), content)
    (UPLOADS_DIR / f"{doc_id}_{fname}.enc").write_bytes(enc_bytes)

    pages: int | None = None
    extracted = ""
    kind = "text"
    try:
        if suffix == ".pdf":
            kind = "pdf"
            pdf_doc = fitz.open(str(save_path))
            pages = len(pdf_doc)
            extracted = "\n\n".join(f"[Page {i+1}]\n{p.get_text('text')}" for i, p in enumerate(pdf_doc))
            # OCR fallback for scanned image-only PDFs
            plain_len = len(re.sub(r"\[Page \d+\]|\s+", "", extracted))
            if plain_len < 20 and pages > 0:
                ocr_chunks: list[str] = []
                for idx in range(min(pages, 2)):
                    pix = pdf_doc[idx].get_pixmap(dpi=150)
                    ocr_txt = await llm_client.extract_image_ocr(pix.tobytes("png"))
                    if ocr_txt:
                        ocr_chunks.append(f"[Page {idx+1} OCR]\n{ocr_txt}")
                if ocr_chunks:
                    extracted = "\n\n".join(ocr_chunks)
            pdf_doc.close()
        elif suffix == ".docx":
            kind = "docx"
            docx_doc = Document(str(save_path))
            extracted = "\n".join(p.text for p in docx_doc.paragraphs if p.text.strip())
            pages = 1
        elif suffix in (".m4a", ".wav", ".mp3", ".ogg", ".webm", ".json"):
            kind = "audio"
            tr = await bhashini_client.translate_or_transcribe(file_path=save_path, source_lang=matter.get("client_language") or "kok")
            extracted = json.dumps(tr, ensure_ascii=False)
        else:
            kind = "text"
            extracted = content.decode("utf-8", errors="ignore")

    except HTTPException:
        raise
    except Exception as exc:  # corrupt PDF/DOCX/JSON etc.: reject cleanly and leave no orphan file
        save_path.unlink(missing_ok=True)
        (UPLOADS_DIR / f"{doc_id}_{fname}.enc").unlink(missing_ok=True)
        raise _err(422, "unreadable_document", f"Could not read '{fname}' as a {suffix.lstrip('.').upper()} document ({type(exc).__name__}). Re-export the file and try again.")

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO documents (id, matter_id, filename, kind, pages, storage_path, extracted_text, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (doc_id, matter_id, fname, kind, pages, str(save_path), extracted, json.dumps(enc_meta), now_iso),
        )
    clear_stage_results(matter_id)  # F4: new evidence invalidates every derived stage
    doc_kind = "voice" if kind == "audio" else (kind if kind in ("pdf", "docx") else "other")
    return {
        "id": doc_id,
        "name": fname,
        "kind": doc_kind,
        "size": len(content),
        "added_at": now_iso,
        "document_id": doc_id,
        "pages": pages,
    }


@router.post("/matters/{matter_id}/run", response_model=PipelineRunResponse)
async def trigger_pipeline(matter_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor, "analysis.run")
    job_id = f"job_{matter_id}_{uuid.uuid4().hex[:6]}"
    return {"job_id": job_id}


@router.get("/matters/{matter_id}/events")
async def stream_pipeline_events(matter_id: str, live: bool = Query(default=False), actor: Actor = Depends(get_actor)) -> StreamingResponse:
    """SSE pipeline. In DEMO_MODE an already-analysed matter is replayed; ?live=true forces a fresh run."""
    _authorized_matter(matter_id, actor, "analysis.run")

    async def event_gen():
        async for ev in run_pipeline_stream(matter_id, force_live=live):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.get("/matters/{matter_id}/facts", response_model=list[Fact])
async def get_facts(matter_id: str, actor: Actor = Depends(get_actor)) -> list[dict[str, Any]]:
    _authorized_matter(matter_id, actor)
    # Heals fact cards cached before normalization existed (e.g. float translation_confidence).
    return normalize_fact_cards(await ensure_stage(matter_id, "facts"))


@router.get("/matters/{matter_id}/proof-ledger", response_model=ProofLedgerResponse)
async def get_proof_ledger(matter_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor)
    return await ensure_stage(matter_id, "proof_ledger")


@router.get("/matters/{matter_id}/statute-clock", response_model=StatuteClock)
async def get_statute_clock(matter_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor)
    return await ensure_stage(matter_id, "statute_clock")


@router.post("/matters/{matter_id}/statute-clock/recalculate", response_model=StatuteClock)
async def recalculate_statute_clock_endpoint(matter_id: str, body: ClockRecalculateRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    # Previewing a date is read-only analysis; saving it to the matter needs edit rights.
    _authorized_matter(matter_id, actor, "matter.read" if body.preview else "analysis.run")
    if not body.cause_date.strip():
        raise _err(422, "invalid_date", "Enter the cause-of-action date (YYYY-MM-DD).")
    _check_cause_date(body.cause_date.strip())
    return await recalculate_matter_clock(matter_id, body.cause_date.strip(), preview=body.preview)


@router.get("/matters/{matter_id}/precedents", response_model=Precedents)
async def get_precedents(matter_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor)
    return await ensure_stage(matter_id, "search")


@router.post("/matters/{matter_id}/precedents/search", response_model=Precedents)
async def search_precedents_endpoint(matter_id: str, body: PrecedentSearchRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor, "analysis.run")
    return await run_precedent_search(matter_id, body.query)


@router.get("/matters/{matter_id}/citations/health", response_model=list[CitationHealth])
async def get_citations_health(matter_id: str, actor: Actor = Depends(get_actor)) -> list[dict[str, Any]]:
    _authorized_matter(matter_id, actor)
    return await ensure_stage(matter_id, "citation_health")


@router.post("/matters/{matter_id}/citations/check", response_model=list[CitationHealth])
async def check_citations_endpoint(matter_id: str, body: CitationCheckRequest, actor: Actor = Depends(get_actor)) -> list[dict[str, Any]]:
    _authorized_matter(matter_id, actor, "analysis.run")
    try:
        return await check_matter_citation(matter_id, body.citation)
    except CitationNotFoundError:
        raise _err(404, "citation_not_found", "No Indian Kanoon judgment matches the parties in this citation")


@router.post("/matters/{matter_id}/court", response_model=Score)
async def set_court_endpoint(matter_id: str, body: SetCourtRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor, "analysis.run")
    return await set_matter_court(matter_id, body.court)


@router.post("/matters/{matter_id}/flags", response_model=list[QueueItem])
async def toggle_flag_endpoint(matter_id: str, body: ToggleFlagRequest, actor: Actor = Depends(get_actor)) -> list[dict[str, Any]]:
    _authorized_matter(matter_id, actor, "queue.flag")
    visible = _visible_matter_ids(actor)
    return [q for q in await toggle_matter_flag(matter_id, body.flag) if q.get("matter_id") in visible]


async def _refresh_score_and_firewall(matter_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    matter = _load_matter(matter_id)
    facts = await ensure_stage(matter_id, "facts")
    proof = await ensure_stage(matter_id, "proof_ledger")
    clock = await ensure_stage(matter_id, "statute_clock")
    precs = await ensure_stage(matter_id, "search")
    existing_score = get_stage_result(matter_id, "score")
    firewall, score_obj = compute_bias_firewall_and_score(
        matter=matter,
        facts=facts,
        proof_ledger=proof,
        statute_clock=clock,
        precedents=precs,
    )
    if existing_score and existing_score.get("override"):
        # The model is recomputed (facts may have changed) but the advocate's assessment stays in force.
        score_obj["model_band"] = score_obj["band"]
        score_obj["override"] = {**existing_score["override"], "model_band": score_obj["band"]}
        score_obj["band"] = existing_score["override"]["band"]
    save_stage_result(matter_id, "bias_firewall", firewall)
    save_stage_result(matter_id, "score", score_obj)
    return firewall, score_obj


@router.get("/matters/{matter_id}/score", response_model=Score)
async def get_score(matter_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor)
    _, score_obj = await _refresh_score_and_firewall(matter_id)
    return score_obj


@router.get("/matters/{matter_id}/bias-firewall", response_model=BiasFirewall)
async def get_bias_firewall(matter_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor)
    firewall, _ = await _refresh_score_and_firewall(matter_id)
    return firewall


@router.post("/matters/{matter_id}/bias-firewall/flip", response_model=BiasFirewallRow)
async def flip_bias_firewall(matter_id: str, body: FlipRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    # Read-only counterfactual: nothing is persisted, so any role that can read the matter may run it.
    matter = _authorized_matter(matter_id, actor)
    firewall = await ensure_stage(matter_id, "bias_firewall")
    facts = await ensure_stage(matter_id, "facts")
    proof = await ensure_stage(matter_id, "proof_ledger")
    clock = await ensure_stage(matter_id, "statute_clock")
    precs = await ensure_stage(matter_id, "search")
    base_score = firewall["rows"][0]["score"] if firewall.get("rows") else 0.5
    return run_single_identity_flip(
        matter=matter,
        facts=facts,
        proof_ledger=proof,
        statute_clock=clock,
        precedents=precs,
        identity=body.identity,
        baseline_score=base_score,
    )


@router.get("/matters/{matter_id}/advice", response_model=Advice)
async def get_advice(matter_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor)
    return await ensure_stage(matter_id, "advice")


@router.get("/matters/{matter_id}/draft", response_model=Draft)
async def get_draft(
    matter_id: str,
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    actor_obj = actor
    _authorized_matter(matter_id, actor_obj)
    log_access(
        actor_obj["user_id"],
        actor_obj["role"],
        matter_id,
        f"GET /matters/{matter_id}/draft",
        org_id=actor_obj["org_id"],
    )
    return draft_with_render(matter_id, await ensure_stage(matter_id, "draft"))


@router.post("/matters/{matter_id}/draft/type", response_model=Draft)
async def set_draft_type_endpoint(matter_id: str, body: SetDraftTypeRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor, "analysis.run")
    try:
        draft = await set_matter_draft_type(matter_id, body.draft_type, body.instructions or "")
    except ValueError as exc:
        raise _err(422, "unknown_instrument", str(exc))
    return draft_with_render(matter_id, draft)


@router.post("/matters/{matter_id}/draft/regenerate", response_model=Draft)
async def regenerate_draft(matter_id: str, body: SetDraftTypeRequest | None = None, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    """Rebuild the current instrument from the latest facts, precedents and score."""
    _authorized_matter(matter_id, actor, "analysis.run")
    current = await ensure_stage(matter_id, "draft")
    draft_type = (body.draft_type if body and body.draft_type else None) or current.get("type") or "legal_notice"
    try:
        draft = await set_matter_draft_type(matter_id, draft_type, (body.instructions if body else "") or "")
    except ValueError as exc:
        raise _err(422, "unknown_instrument", str(exc))
    append_ledger_entry(
        actor=actor["user_id"], role=actor["role"], matter_id=matter_id, action="edit", target="draft",
        target_id=draft_type, reason_code="draft_regenerated", note="Draft regenerated" + (f": {body.instructions[:80]}" if body and body.instructions else ""),
        org_id=actor["org_id"],
    )
    return draft_with_render(matter_id, draft)


@router.patch("/matters/{matter_id}/draft", response_model=Draft)
async def edit_draft_paragraph(matter_id: str, body: DraftParagraphEdit, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    """Advocate edits (or deletes) one draft paragraph. Edited text keeps its cited sources."""
    _authorized_matter(matter_id, actor, "review.edit")
    draft = dict(await ensure_stage(matter_id, "draft"))
    paras = list(draft.get("paragraphs", []))
    idx = next((i for i, p in enumerate(paras) if p.get("id") == body.paragraph_id), None)
    if idx is None:
        raise _err(404, "not_found", "Paragraph not found.")
    before = paras[idx].get("text", "")
    if body.text is None:
        paras.pop(idx)
        note = f"Deleted paragraph {body.paragraph_id}"
    else:
        text = body.text.strip()
        if not text:
            raise _err(422, "empty_paragraph", "Paragraph text cannot be empty. Delete it instead.")
        paras[idx] = {**paras[idx], "text": text, "edited_by": actor["name"], "locked_out_claim": None if paras[idx].get("locked_out_claim") and text != before else paras[idx].get("locked_out_claim")}
        note = f"Edited paragraph {body.paragraph_id}"
    draft["paragraphs"] = paras
    draft["watermark"] = "AI-assisted draft. Advocate review required."
    save_stage_result(matter_id, "draft", draft)
    append_ledger_entry(
        actor=actor["user_id"], role=actor["role"], matter_id=matter_id, action="edit", target="draft",
        target_id=body.paragraph_id, reason_code="draft_edit", note=note, org_id=actor["org_id"],
        diff={"before": before[:300], "after": (body.text or "")[:300]},
    )
    return draft_with_render(matter_id, draft)


@router.post("/matters/{matter_id}/draft/verify-citation", response_model=VerifyCitationResponse)
async def verify_citation(matter_id: str, body: VerifyCitationRequest, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    _authorized_matter(matter_id, actor, "analysis.run")
    rag = await ensure_stage(matter_id, "rag")
    corpus_sources = list(rag.get("corpus_sources", []))
    # Also include any citation_health sources
    c_health = await ensure_stage(matter_id, "citation_health")
    for ch in c_health:
        if ch.get("cited"):
            corpus_sources.append(ch["cited"])
        if ch.get("by"):
            corpus_sources.append(ch["by"])
    res = llm_client.verify_citation_against_corpus(body.text, corpus_sources)
    if res.get("verified") and res.get("source"):
        draft = await ensure_stage(matter_id, "draft")
        paragraphs = list(draft.get("paragraphs", []))
        if not any(p.get("text", "").strip() == body.text.strip() for p in paragraphs):
            paragraphs.append(
                {
                    "id": f"p{len(paragraphs) + 1}",
                    "text": body.text.strip(),
                    "confidence": "high",
                    "sources": [res["source"]],
                }
            )
            draft["paragraphs"] = paragraphs
            save_stage_result(matter_id, "draft", draft)
    return res


def _blocking_citations(matter_id: str) -> list[str]:
    """Titles of overruled authorities still blocking the draft. A reasoned senior override in the ledger lifts the block."""
    health = get_stage_result(matter_id, "citation_health") or []
    with db_session() as conn:
        overridden = {
            r["target_id"]
            for r in conn.execute(
                "SELECT target_id FROM ledger_entries WHERE matter_id = ? AND action = 'override' AND target = 'citation'",
                (matter_id,),
            ).fetchall()
        }
    return [
        c.get("cited", {}).get("title", "unknown authority")
        for c in health
        if c.get("blocks_draft") and c.get("cited", {}).get("source_id") not in overridden
    ]


def _require_citations_clear(matter_id: str, what: str) -> None:
    blocking = _blocking_citations(matter_id)
    if blocking:
        raise _err(
            409,
            "citation_blocks_draft",
            f"Cannot {what}: {len(blocking)} overruled authorit{'y blocks' if len(blocking) == 1 else 'ies block'} this draft ({'; '.join(blocking)}). "
            "A senior advocate must record a reasoned override on each citation first.",
        )


@router.get("/matters/{matter_id}/draft/export")
async def export_draft(matter_id: str, format: str = Query(default="docx"), actor: Actor = Depends(get_actor)) -> Response:
    matter = _authorized_matter(matter_id, actor, "draft.export")
    log_access(actor["user_id"], actor["role"], matter_id, f"GET /matters/{matter_id}/draft/export", org_id=actor["org_id"])
    await ensure_stage(matter_id, "citation_health")
    _require_citations_clear(matter_id, "export this draft")
    draft = await ensure_stage(matter_id, "draft")
    fmt = (format or "docx").lower()
    if fmt not in ("docx", "pdf"):
        raise HTTPException(status_code=400, detail={"error": {"code": "bad_format", "message": "Use format=docx or format=pdf"}})
    safe_title = re.sub(r"[^A-Za-z0-9]+", "_", matter.get("title", matter_id).replace(" (FICTIONAL)", ""))[:48].strip("_") or matter_id
    fname = f"{safe_title}_{draft.get('type', 'draft')}.{fmt}"
    if fmt == "pdf":
        blob = build_draft_pdf_bytes(matter, draft)
        media = "application/pdf"
    else:
        blob = build_draft_docx_bytes(matter, draft)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return Response(
        content=blob,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{fname}"', "Access-Control-Expose-Headers": "Content-Disposition"},
    )


@router.post("/matters/{matter_id}/reviews", response_model=LedgerEntry)
async def create_review(
    matter_id: str,
    body: ReviewRequest,
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    actor_obj = actor
    _authorized_matter(matter_id, actor_obj, REVIEW_ACTION_PERMISSION[body.action])
    if body.action in ("edit", "delete") and body.target != "fact":
        raise _err(400, "unsupported_edit", "Only fact cards can be edited or deleted. Use override or submit for other findings.")
    if body.action == "edit" and body.target_id == "new" and not (body.note or "").strip():
        raise _err(422, "empty_fact", "Enter the fact statement before saving.")
    if body.action == "override" and body.target in ("score", "advice", "proof", "citation") and not (body.note or "").strip():
        raise _err(422, "reason_required", "An override must record the reasoning in the note.")
    if body.action == "override" and body.target == "score":
        band_req = body.diff.get("band") if isinstance(body.diff, dict) else None
        if not (isinstance(body.diff, dict) and body.diff.get("clear")) and band_req not in ("strong", "moderate", "uncertain", "weak"):
            raise _err(422, "band_required", "Choose the band you assess (strong, moderate, uncertain or weak).")
    if body.action == "override" and body.target == "advice":
        rec_req = body.diff.get("recommendation") if isinstance(body.diff, dict) else None
        if not (isinstance(body.diff, dict) and body.diff.get("clear")) and rec_req not in ("fight", "mediate", "settle", "plea_bargain"):
            raise _err(422, "route_required", "Choose the route you recommend instead.")
    if body.action in ("approve", "submit") and body.target != "draft":
        raise _err(400, "unsupported_action", f"'{body.action}' applies to the draft only.")
    if body.action == "approve":
        await ensure_stage(matter_id, "citation_health")
        _require_citations_clear(matter_id, "approve this draft")
    actor, role = actor_obj["user_id"], actor_obj["role"]
    entry = append_ledger_entry(
        actor=actor,
        role=role,
        matter_id=matter_id,
        action=body.action,
        target=body.target,
        target_id=body.target_id,
        reason_code=body.reason_code,
        note=body.note or "",
        org_id=actor_obj["org_id"],
        diff={"text": body.diff} if isinstance(body.diff, str) else body.diff,
    )
    if body.action == "delete" and body.target == "fact":
        facts = [f for f in await ensure_stage(matter_id, "facts") if f.get("id") != body.target_id]
        save_stage_result(matter_id, "facts", facts)

    if body.action in ("override", "edit") and body.target == "fact":
        facts = await ensure_stage(matter_id, "facts")
        diff_status = body.diff.get("status") if isinstance(body.diff, dict) else None
        if body.target_id == "new" and (body.note or "").strip():
            next_n = max([int(m.group(1)) for f in facts if (m := re.match(r"fact_(\d+)$", str(f.get("id", ""))))] + [0]) + 1
            facts.append(
                {
                    "id": f"fact_{next_n:02d}",
                    "added_by_advocate": True,
                    "statement": body.note.strip(),
                    "status": diff_status if diff_status in ("documented", "alleged", "disputed", "unknown") else "documented",
                    "source": {"document_id": "advocate_entry", "location": f"verified by {actor}"},
                    "original": None,
                }
            )
        else:
            for item in facts:
                if item.get("id") == body.target_id:
                    if (body.note or "").strip():
                        item["statement"] = body.note.strip()
                    if diff_status in ("documented", "alleged", "disputed", "unknown"):
                        item["status"] = diff_status
                    elif item.get("status") in ("unknown", "alleged"):
                        item["status"] = "documented"
                    break
        save_stage_result(matter_id, "facts", facts)

    if body.action == "override":
        if body.target == "citation":
            c_health = await ensure_stage(matter_id, "citation_health")
            for item in c_health:
                if item.get("cited", {}).get("source_id") == body.target_id:
                    item["blocks_draft"] = False
            save_stage_result(matter_id, "citation_health", c_health)
        elif body.target == "proof":
            proof = await ensure_stage(matter_id, "proof_ledger")
            for item in proof.get("items", []):
                if item.get("requirement") == body.target_id:
                    item["state"] = "present"
            save_stage_result(matter_id, "proof_ledger", proof)
        elif body.target == "score":
            sc = await ensure_stage(matter_id, "score")
            sc.setdefault("model_band", sc.get("band"))
            if body.diff.get("clear"):
                sc["band"] = sc["model_band"]
                sc["override"] = None
            else:
                sc["band"] = body.diff["band"]
                sc["override"] = {"band": body.diff["band"], "model_band": sc["model_band"], "by": actor_obj["name"],
                                  "reason_code": body.reason_code, "note": (body.note or "").strip(), "at": entry["at"]}
            save_stage_result(matter_id, "score", sc)
            # Advice follows the effective (advocate-assessed) band unless a route override is in force.
            adv = await ensure_stage(matter_id, "advice")
            if not adv.get("override"):
                proof = await ensure_stage(matter_id, "proof_ledger")
                docs_text = "\n".join(d.get("extracted_text", "") for d in _load_docs(matter_id))
                fresh = await evaluate_advice(_load_matter(matter_id)["case_type"], sc, proof, docs_text)
                fresh["based_on_band"] = sc["band"]
                save_stage_result(matter_id, "advice", fresh)
        elif body.target == "advice":
            adv = await ensure_stage(matter_id, "advice")
            adv.setdefault("model_recommendation", adv.get("recommendation"))
            if body.diff.get("clear"):
                adv["recommendation"] = adv["model_recommendation"]
                adv["override"] = None
            else:
                adv["recommendation"] = body.diff["recommendation"]
                adv["override"] = {"recommendation": body.diff["recommendation"], "model_recommendation": adv["model_recommendation"],
                                   "by": actor_obj["name"], "note": (body.note or "").strip(), "at": entry["at"]}
            save_stage_result(matter_id, "advice", adv)

    if body.action in ("approve", "submit") and body.target == "draft":
        draft = await ensure_stage(matter_id, "draft")
        if body.action == "approve":  # permission check above guarantees a senior
            draft["watermark"] = f"APPROVED BY {actor} ({role.upper()}) — FOR ADVOCATE USE"
            new_status = "approved"
        else:
            draft["watermark"] = "AWAITING SENIOR APPROVAL — NOT FOR FILING"
            new_status = "in_review"
        save_stage_result(matter_id, "draft", draft)
        with db_session() as conn:
            conn.execute("UPDATE matters SET status = ? WHERE id = ?", (new_status, matter_id))
    else:
        with db_session() as conn:
            conn.execute("UPDATE matters SET status = 'in_review' WHERE id = ?", (matter_id,))
    return entry


@router.get("/ledger", response_model=LedgerResponse)
async def list_ledger(
    matter_id: Optional[str] = Query(default=None),
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    actor_obj = actor
    if matter_id and matter_id != "all":
        _authorized_matter(matter_id, actor_obj)
    bh = await check_solana_devnet_health()
    res = get_ledger(matter_id=matter_id, devnet_blockhash=bh)
    allowed_ids = _visible_matter_ids(actor_obj)
    res["entries"] = [e for e in res["entries"] if e.get("matter_id") in allowed_ids]
    return res


@router.get("/ledger/verify", response_model=LedgerVerify)
async def verify_ledger(actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    res = verify_ledger_chain()
    bh = await check_solana_devnet_health()
    if res["anchored_root"] and bh:
        res["anchored_root"]["tx"] = bh
    return res


@router.post("/ledger/tamper")
async def tamper_ledger(actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    """Integrity drill: simulates an insider editing one ledger row directly in the database
    (bypassing the API), then shows how hash-chain verification exposes it. Call again to restore."""
    require(actor, "ledger.tamper")
    from app.db import compute_entry_hash
    from app.ledger.chain import compute_merkle_root

    suffix = " [edited after the fact]"
    with db_session() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM ledger_entries ORDER BY seq ASC").fetchall()]
    if not rows:
        return {"tampered": False, "broken_at": None}
    target = next((r for r in rows if r["org_id"] == actor["org_id"]), rows[0])
    root_before = compute_merkle_root([r["hash"] for r in rows])
    note = target["note"] or ""
    tampered = not note.endswith(suffix)
    new_note = note + suffix if tampered else note[: -len(suffix)]
    with db_session() as conn:
        conn.execute("UPDATE ledger_entries SET note = ? WHERE id = ?", (new_note, target["id"]))
    recomputed = compute_entry_hash(
        target["prev_hash"], target["id"], target["actor"], target["role"], target["matter_id"], target["action"],
        target["target"], target["target_id"], target["reason_code"], new_note, target["at"],
    )
    verify = verify_ledger_chain()
    # Root a verifier would compute from the edited table (stored hashes no longer match content).
    root_after = compute_merkle_root([recomputed if r["id"] == target["id"] else r["hash"] for r in rows])
    return {
        "tampered": tampered,
        "broken_at": verify.get("broken_at"),
        "entry_id": target["id"],
        "field": "note",
        "before": note,
        "after": new_note,
        "stored_hash": target["hash"],
        "recomputed_hash": recomputed,
        "merkle_root_before": root_before,
        "merkle_root_after": root_after if tampered else root_before,
        "chain_valid": verify.get("valid"),
        "explanation": (
            "The row was edited directly in the database. Its stored SHA-256 hash no longer matches its content, "
            "so verification fails at this entry and the Merkle root differs from the anchored one."
            if tampered else "The original note was restored; every hash matches again and the chain verifies."
        ),
    }


@router.post("/demo/reset")
async def reset_demo(actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    require(actor, "demo.reset")
    with db_session() as conn:
        conn.execute("DELETE FROM ledger_entries WHERE id NOT IN ('led_001', 'led_002')")
        conn.execute("UPDATE ledger_entries SET note = 'Client confirmed payment date' WHERE id = 'led_001'")
        conn.execute("DELETE FROM documents WHERE id NOT IN ('doc_pdf_01', 'doc_docx_01', 'doc_voice_01', 'doc_docx_02', 'doc_docx_03', 'doc_docx_04')")
        conn.execute("DELETE FROM matters WHERE id NOT IN ('mat_001', 'mat_002', 'mat_003', 'mat_004')")
        conn.execute("UPDATE matters SET status = 'ready', next_deadline = '2026-12-24', days_left = 41, priority = 0.86 WHERE id = 'mat_001'")
        conn.execute("UPDATE matters SET status = 'in_review', next_deadline = '2027-02-02', days_left = 81, priority = 0.64 WHERE id = 'mat_002'")
        conn.execute("UPDATE matters SET status = 'draft', next_deadline = NULL, days_left = NULL, priority = 0.41 WHERE id = 'mat_003'")
        conn.execute("DELETE FROM stage_results")
    init_db(restore_baseline=True)
    await precedent_client.warm_landmark_cache()
    await seed_fast_stage_results()
    return {"reset": True}


@router.get("/access-logs", response_model=list[AccessLogEntry])
async def get_access_logs(
    actor: Actor = Depends(get_actor),
) -> list[dict[str, Any]]:
    actor_obj = actor
    with db_session() as conn:
        rows = conn.execute(
            "SELECT id, actor, role, matter_id, endpoint, at FROM access_logs WHERE org_id = ? ORDER BY id DESC LIMIT 12",
            (actor_obj["org_id"],),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/ml/model", response_model=ModelInfoResponse)
async def get_model_info(actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    from app.ml.service import META_PATH

    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    with db_session() as conn:
        runs = conn.execute("SELECT * FROM retrain_runs ORDER BY id ASC").fetchall()
    history = [
        {
            "version": r["new_version"],
            "labels_added": r["labels_added"],
            "accuracy": json.loads(r["metrics_after_json"]).get("accuracy"),
            "brier": json.loads(r["metrics_after_json"]).get("brier"),
            "at": r["created_at"],
        }
        for r in runs
    ]
    return {
        "version": meta["version"],
        "trained_at": "2026-11-13T10:30:00Z",
        "labels": 240 + sum(r["labels_added"] for r in runs),
        "metrics": {"accuracy": meta["accuracy"], "brier": meta["brier"]},
        "history": history,
    }


@router.post("/ml/retrain", response_model=RetrainResponse)
async def ml_retrain(actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    require(actor, "ml.retrain")
    return retrain_from_overrides()


@router.get("/queue", response_model=list[QueueItem])
async def get_queue(
    actor: Actor = Depends(get_actor),
) -> list[dict[str, Any]]:
    allowed_ids = _visible_matter_ids(actor)
    items = await compute_nyaya_queue()
    return [item for item in items if item.get("matter_id") in allowed_ids]


@router.get("/alerts", response_model=list[AlertItem])
async def get_alerts(
    actor: Actor = Depends(get_actor),
) -> list[dict[str, Any]]:
    with db_session() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM matters WHERE org_id = ? ORDER BY priority DESC", (actor["org_id"],)).fetchall()]
    matters = [m for m in rows if _can_access_matter(m, actor)]
    alerts: list[dict[str, Any]] = []
    for m in matters:
        days = m.get("days_left")
        if days is not None:
            level = "urgent" if days <= 45 else ("warn" if days <= 90 else "info")
            alerts.append(
                {
                    "id": f"alt_{m['id']}",
                    "matter_id": m["id"],
                    "title": m["title"],
                    "kind": "limitation",
                    "due": m["next_deadline"] or "2026-12-31",
                    "days_left": days,
                    "level": level,
                }
            )
        if m["case_type"] == "civil_recovery":
            alerts.append(
                {
                    "id": f"alt_med_{m['id']}",
                    "matter_id": m["id"],
                    "title": f"{m['title']} — s.12A mediation check",
                    "kind": "mediation_window",
                    "due": m["next_deadline"] or "2027-02-02",
                    "days_left": days if days is not None else 60,
                    "level": "warn",
                }
            )
    return alerts


@router.post("/alerts/test")
async def send_test_alert(
    matter_id: Optional[str] = Query(default=None),
    actor: Actor = Depends(get_actor),
) -> dict[str, Any]:
    actor_obj = actor
    require(actor_obj, "alerts.test")
    with db_session() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM matters WHERE org_id = ? ORDER BY priority DESC", (actor_obj["org_id"],)).fetchall()]
    matters = [m for m in rows if _can_access_matter(m, actor_obj)]
    target = None
    if matter_id:
        target = _authorized_matter(matter_id, actor_obj)
    elif matters:
        target = next((m for m in matters if m.get("days_left") is not None), matters[0])
    if not target:
        return {"sent": False, "matter_id": "", "title": "No accessible matter", "channel": "telegram", "days_left": 0}
    days_left = int(target.get("days_left") if target.get("days_left") is not None else 30)
    sent = await notify_client.send_deadline_alert(
        matter_id=target["id"],
        title=target["title"],
        days_left=days_left,
    )
    log_access(
        actor_obj["user_id"],
        actor_obj["role"],
        target["id"],
        "POST /alerts/test",
        org_id=actor_obj["org_id"],
    )
    return {
        "sent": sent,
        "matter_id": target["id"],
        "title": target["title"],
        "channel": "telegram",
        "days_left": days_left,
    }


@router.post("/precedents/search")
async def explore_precedents(body: dict[str, Any], actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    """Matter-free semantic precedent search over the Insaaf Precedent Index (with live web sweep)."""
    query = str(body.get("query") or "").strip()[:500]
    if len(query) < 3:
        raise _err(422, "query_too_short", "Describe the facts or legal issue (at least 3 characters).")
    area = body.get("area") or None
    _check_area(area)
    limit = max(1, min(int(body.get("limit") or 20), 50))
    return await precedent_client.explore(
        query, area=area, state=str(body.get("state") or ""), district=str(body.get("district") or ""),
        court=str(body.get("court") or ""), outcome=str(body.get("outcome") or ""), limit=limit,
    )


@router.get("/precedents/{doc_id}")
async def get_precedent(doc_id: str, actor: Actor = Depends(get_actor)) -> dict[str, Any]:
    from app.services.precedents import corpus as _corpus

    rec = _corpus.get(doc_id)
    if not rec:
        raise _err(404, "not_found", "Judgment not in the index.")
    return {k: rec.get(k) for k in ("doc_id", "title", "court", "seat", "state", "bench", "date", "outcome", "statutes",
                                      "headnote", "holding", "paras", "url", "practice_areas", "paragraph_count")}


@router.post("/law-changes/scan", response_model=list[LawChangeItem])
async def scan_law_changes(body: LawScanRequest, actor: Actor = Depends(get_actor)) -> list[dict[str, Any]]:
    return await evaluate_law_changes(body.text, offence_date=body.offence_date or "")


@router.get("/matters/{matter_id}/law-changes", response_model=list[LawChangeItem])
async def get_law_changes(matter_id: str, actor: Actor = Depends(get_actor)) -> list[dict[str, Any]]:
    _authorized_matter(matter_id, actor)
    return await ensure_stage(matter_id, "law_changes")


_HEALTH_PING_CACHE: dict[str, Any] = {
    "ts": 0.0,
    "running": False,
    "precedent_index": "ok",
    "llm": "ok",
    "translation": "ok",
}


async def _refresh_external_pings() -> None:
    if _HEALTH_PING_CACHE["running"]:
        return
    _HEALTH_PING_CACHE["running"] = True
    try:
        k, l, b = await asyncio.gather(
            precedent_client.ping(),
            llm_client.ping(),
            bhashini_client.ping(),
            return_exceptions=True,
        )
        _HEALTH_PING_CACHE["precedent_index"] = k if isinstance(k, str) else "degraded"
        _HEALTH_PING_CACHE["llm"] = l if isinstance(l, str) else "degraded"
        _HEALTH_PING_CACHE["translation"] = b if isinstance(b, str) else "degraded"
        _HEALTH_PING_CACHE["ts"] = time.time()
    finally:
        _HEALTH_PING_CACHE["running"] = False


@router.get("/health/deep", response_model=DeepHealthResponse)
async def deep_health() -> dict[str, Any]:
    try:
        with db_session() as conn:
            conn.execute("SELECT 1").fetchone()
        db_status = "ok"
    except Exception:
        db_status = "down"

    if time.time() - float(_HEALTH_PING_CACHE["ts"]) > 120.0 and not _HEALTH_PING_CACHE["running"]:
        asyncio.create_task(_refresh_external_pings())

    stats = precedent_client.stats()
    return {
        "precedent_index": _HEALTH_PING_CACHE["precedent_index"],
        "web_sweep": "ok" if stats["web_sweep_enabled"] else "down",
        "llm": _HEALTH_PING_CACHE["llm"],
        "translation": _HEALTH_PING_CACHE["translation"],
        "db": db_status,
        "model_version": get_current_model_version(),
        "index_size": stats["index_size"],
        "llm_provider": "Groq" if settings.groq_api_key else ("Gemini" if settings.gemini_api_key else None),
    }

