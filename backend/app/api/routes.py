"""FastAPI routes implementing docs/API_CONTRACT.md."""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import fitz
from docx import Document
from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse

from app.config import UPLOADS_DIR, settings
from app.db import db_session, get_stage_result, init_db, log_access, save_stage_result
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
    Advice,
    AlertItem,
    BiasFirewall,
    BiasFirewallRow,
    CitationCheckRequest,
    CitationHealth,
    ClockRecalculateRequest,
    CreateMatterRequest,
    DeepHealthResponse,
    Draft,
    Fact,
    FlipRequest,
    LawChangeItem,
    LawScanRequest,
    LedgerEntry,
    LedgerResponse,
    LedgerVerify,
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
from app.rules_engine.engine import evaluate_law_changes
from app.services.bhashini.client import bhashini_client
from app.services.kanoon.client import get_cache_hit_rate, kanoon_client
from app.services.llm.client import llm_client

router = APIRouter()
_ACTIVE_ROLE = "junior"


def _actor_from_headers(x_actor: Optional[str], x_role: Optional[str]) -> tuple[str, str]:
    return (x_actor or "junior_1", x_role or _ACTIVE_ROLE)


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
        doc_list.append(
            {
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
    return row


def _get_matter_or_404(matter_id: str) -> dict[str, Any]:
    with db_session() as conn:
        row = conn.execute("SELECT * FROM matters WHERE id = ?", (matter_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"error": {"code": "not_found", "message": f"Matter {matter_id} not found"}})
        return _format_matter_row(dict(row), conn)


@router.get("/me", response_model=MeResponse)
async def get_me(
    x_actor: Optional[str] = Header(default="junior_1"),
    x_role: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    role = x_role if x_role in ("senior", "junior", "clerk", "student") else _ACTIVE_ROLE
    return {
        "user_id": x_actor or "junior_1",
        "name": "Adv. Kanak",
        "role": role,
        "org": {
            "id": "org_chamber_a",
            "name": "Chamber A — Goa",
            "plan": "chamber",
            "members": [
                {"name": "Adv. Dhanshri", "role": "senior", "last_seen": "2026-11-13T10:20:00Z"},
                {"name": "Adv. Kanak", "role": "junior", "last_seen": "2026-11-13T10:35:00Z"},
                {"name": "R. Sawant", "role": "clerk", "last_seen": "2026-11-13T09:15:00Z"},
                {"name": "S. Dessai", "role": "student", "last_seen": "2026-11-12T18:00:00Z"},
            ],
        },
    }


@router.post("/me/role")
async def set_me_role(body: SetRoleRequest) -> dict[str, Any]:
    global _ACTIVE_ROLE
    _ACTIVE_ROLE = body.role
    return {"role": _ACTIVE_ROLE}


@router.get("/matters", response_model=list[Matter])
async def list_matters() -> list[dict[str, Any]]:
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM matters ORDER BY priority DESC, updated_at DESC").fetchall()
        return [_format_matter_row(dict(r), conn) for r in rows]


@router.delete("/matters/{matter_id}")
async def delete_matter(matter_id: str) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    with db_session() as conn:
        conn.execute("DELETE FROM matters WHERE id = ?", (matter_id,))
    return {"deleted": matter_id}


@router.delete("/matters/{matter_id}/documents/{doc_id}")
async def delete_document(matter_id: str, doc_id: str) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    with db_session() as conn:
        conn.execute("DELETE FROM documents WHERE id = ? AND matter_id = ?", (doc_id, matter_id))
    return {"deleted": doc_id}


@router.post("/matters", response_model=Matter)
async def create_matter(
    body: CreateMatterRequest,
    x_actor: Optional[str] = Header(default="junior_1"),
) -> dict[str, Any]:
    matter_id = f"mat_{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO matters (id, org_id, title, case_type, status, priority, next_deadline, days_left, forum_hint, client_language, created_by, updated_at)
            VALUES (?, 'org_chamber_a', ?, ?, 'draft', 0.50, NULL, NULL, ?, ?, ?, ?)
            """,
            (
                matter_id,
                body.title,
                body.case_type,
                body.forum_hint,
                body.client_language or "kok",
                x_actor or "junior_1",
                now_iso,
            ),
        )
    return _get_matter_or_404(matter_id)


@router.get("/matters/{matter_id}", response_model=Matter)
async def get_matter(
    matter_id: str,
    x_actor: Optional[str] = Header(default="junior_1"),
    x_role: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    m = _get_matter_or_404(matter_id)
    actor, role = _actor_from_headers(x_actor, x_role)
    log_access(actor, role, matter_id, f"GET /matters/{matter_id}")
    return m


@router.post("/matters/{matter_id}/documents", response_model=MatterDocument)
async def upload_document(matter_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    matter = _get_matter_or_404(matter_id)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    doc_id = f"doc_{uuid.uuid4().hex[:8]}"
    fname = file.filename or "upload.bin"
    suffix = Path(fname).suffix.lower()
    save_path = UPLOADS_DIR / f"{doc_id}_{fname}"
    content = await file.read()
    save_path.write_bytes(content)

    pages: int | None = None
    extracted = ""
    if suffix == ".pdf":
        kind = "pdf"
        pdf_doc = fitz.open(str(save_path))
        pages = len(pdf_doc)
        extracted = "\n\n".join(f"[Page {i+1}]\n{p.get_text('text')}" for i, p in enumerate(pdf_doc))
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

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO documents (id, matter_id, filename, kind, pages, storage_path, extracted_text, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)
            """,
            (doc_id, matter_id, fname, kind, pages, str(save_path), extracted, now_iso),
        )
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
async def trigger_pipeline(matter_id: str) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    job_id = f"job_{matter_id}_{uuid.uuid4().hex[:6]}"
    return {"job_id": job_id}


@router.get("/matters/{matter_id}/events")
async def stream_pipeline_events(matter_id: str) -> StreamingResponse:
    _get_matter_or_404(matter_id)

    async def event_gen():
        async for ev in run_pipeline_stream(matter_id):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.get("/matters/{matter_id}/facts", response_model=list[Fact])
async def get_facts(matter_id: str) -> list[dict[str, Any]]:
    _get_matter_or_404(matter_id)
    return await ensure_stage(matter_id, "facts")


@router.get("/matters/{matter_id}/proof-ledger", response_model=ProofLedgerResponse)
async def get_proof_ledger(matter_id: str) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    return await ensure_stage(matter_id, "proof_ledger")


@router.get("/matters/{matter_id}/statute-clock", response_model=StatuteClock)
async def get_statute_clock(matter_id: str) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    return await ensure_stage(matter_id, "statute_clock")


@router.post("/matters/{matter_id}/statute-clock/recalculate", response_model=StatuteClock)
async def recalculate_statute_clock_endpoint(matter_id: str, body: ClockRecalculateRequest) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    return await recalculate_matter_clock(matter_id, body.cause_date)


@router.get("/matters/{matter_id}/precedents", response_model=Precedents)
async def get_precedents(matter_id: str) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    return await ensure_stage(matter_id, "search")


@router.post("/matters/{matter_id}/precedents/search", response_model=Precedents)
async def search_precedents_endpoint(matter_id: str, body: PrecedentSearchRequest) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    return await run_precedent_search(matter_id, body.query)


@router.get("/matters/{matter_id}/citations/health", response_model=list[CitationHealth])
async def get_citations_health(matter_id: str) -> list[dict[str, Any]]:
    _get_matter_or_404(matter_id)
    return await ensure_stage(matter_id, "citation_health")


@router.post("/matters/{matter_id}/citations/check", response_model=list[CitationHealth])
async def check_citations_endpoint(matter_id: str, body: CitationCheckRequest) -> list[dict[str, Any]]:
    _get_matter_or_404(matter_id)
    return await check_matter_citation(matter_id, body.citation)


@router.post("/matters/{matter_id}/court", response_model=Score)
async def set_court_endpoint(matter_id: str, body: SetCourtRequest) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    return await set_matter_court(matter_id, body.court)


@router.post("/matters/{matter_id}/flags", response_model=list[QueueItem])
async def toggle_flag_endpoint(matter_id: str, body: ToggleFlagRequest) -> list[dict[str, Any]]:
    _get_matter_or_404(matter_id)
    return await toggle_matter_flag(matter_id, body.flag)


async def _refresh_score_and_firewall(matter_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    matter = _get_matter_or_404(matter_id)
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
    if existing_score and existing_score.get("overridden_band"):
        score_obj["band"] = existing_score["overridden_band"]
        score_obj["overridden_band"] = existing_score["overridden_band"]
    save_stage_result(matter_id, "bias_firewall", firewall)
    save_stage_result(matter_id, "score", score_obj)
    return firewall, score_obj


@router.get("/matters/{matter_id}/score", response_model=Score)
async def get_score(matter_id: str) -> dict[str, Any]:
    _, score_obj = await _refresh_score_and_firewall(matter_id)
    return score_obj


@router.get("/matters/{matter_id}/bias-firewall", response_model=BiasFirewall)
async def get_bias_firewall(matter_id: str) -> dict[str, Any]:
    firewall, _ = await _refresh_score_and_firewall(matter_id)
    return firewall


@router.post("/matters/{matter_id}/bias-firewall/flip", response_model=BiasFirewallRow)
async def flip_bias_firewall(matter_id: str, body: FlipRequest) -> dict[str, Any]:
    matter = _get_matter_or_404(matter_id)
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
async def get_advice(matter_id: str) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    return await ensure_stage(matter_id, "advice")


@router.get("/matters/{matter_id}/draft", response_model=Draft)
async def get_draft(
    matter_id: str,
    x_actor: Optional[str] = Header(default="junior_1"),
    x_role: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    actor, role = _actor_from_headers(x_actor, x_role)
    log_access(actor, role, matter_id, f"GET /matters/{matter_id}/draft")
    return await ensure_stage(matter_id, "draft")


@router.post("/matters/{matter_id}/draft/type", response_model=Draft)
async def set_draft_type_endpoint(matter_id: str, body: SetDraftTypeRequest) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    return await set_matter_draft_type(matter_id, body.draft_type)


@router.post("/matters/{matter_id}/draft/verify-citation", response_model=VerifyCitationResponse)
async def verify_citation(matter_id: str, body: VerifyCitationRequest) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
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


@router.get("/matters/{matter_id}/draft/export")
async def export_draft(matter_id: str, format: str = Query(default="docx")) -> Response:
    matter = _get_matter_or_404(matter_id)
    draft = await ensure_stage(matter_id, "draft")
    if format != "docx":
        raise HTTPException(status_code=400, detail={"error": {"code": "bad_format", "message": "Only format=docx is supported"}})
    blob = build_draft_docx_bytes(matter, draft)
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{matter_id}_draft.docx"'},
    )


@router.post("/matters/{matter_id}/reviews", response_model=LedgerEntry)
async def create_review(
    matter_id: str,
    body: ReviewRequest,
    x_actor: Optional[str] = Header(default="junior_1"),
    x_role: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _get_matter_or_404(matter_id)
    actor, role = _actor_from_headers(x_actor, x_role)
    entry = append_ledger_entry(
        actor=actor,
        role=role,
        matter_id=matter_id,
        action=body.action,
        target=body.target,
        target_id=body.target_id,
        reason_code=body.reason_code,
        note=body.note or "",
        diff={"text": body.diff} if isinstance(body.diff, str) else body.diff,
    )
    if body.action in ("override", "edit") and body.target == "fact":
        facts = await ensure_stage(matter_id, "facts")
        diff_status = body.diff.get("status") if isinstance(body.diff, dict) else None
        if body.target_id == "new" and (body.note or "").strip():
            facts.append(
                {
                    "id": f"fact_{len(facts) + 1:02d}",
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
            sc["band"] = "strong" if sc.get("band") in ("weak", "uncertain", "moderate") else "moderate"
            save_stage_result(matter_id, "score", sc)

    if body.action == "approve" and body.target == "draft":
        draft = await ensure_stage(matter_id, "draft")
        if role == "senior":
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
async def list_ledger(matter_id: Optional[str] = Query(default=None)) -> dict[str, Any]:
    bh = await check_solana_devnet_health()
    return get_ledger(matter_id=matter_id, devnet_blockhash=bh)


@router.get("/ledger/verify", response_model=LedgerVerify)
async def verify_ledger() -> dict[str, Any]:
    res = verify_ledger_chain()
    bh = await check_solana_devnet_health()
    if res["anchored_root"] and bh:
        res["anchored_root"]["tx"] = bh
    return res


@router.post("/ledger/tamper")
async def tamper_ledger() -> dict[str, Any]:
    suffix = " [edited after the fact]"
    with db_session() as conn:
        row = conn.execute("SELECT id, note FROM ledger_entries ORDER BY seq ASC LIMIT 1").fetchone()
        if not row:
            return {"tampered": False, "broken_at": None}
        note = row["note"] or ""
        if note.endswith(suffix):
            new_note = note[: -len(suffix)]
            tampered = False
        else:
            new_note = note + suffix
            tampered = True
        conn.execute("UPDATE ledger_entries SET note = ? WHERE id = ?", (new_note, row["id"]))
        return {"tampered": tampered, "broken_at": row["id"] if tampered else None}


@router.post("/demo/reset")
async def reset_demo() -> dict[str, Any]:
    global _ACTIVE_ROLE
    _ACTIVE_ROLE = "junior"
    with db_session() as conn:
        conn.execute("DELETE FROM ledger_entries WHERE id NOT IN ('led_001', 'led_002')")
        conn.execute("UPDATE ledger_entries SET note = 'Client confirmed payment date' WHERE id = 'led_001'")
        conn.execute("DELETE FROM documents WHERE id NOT IN ('doc_pdf_01', 'doc_docx_01', 'doc_voice_01', 'doc_docx_02', 'doc_docx_03')")
        conn.execute("DELETE FROM matters WHERE id NOT IN ('mat_001', 'mat_002', 'mat_003')")
        conn.execute("UPDATE matters SET status = 'ready', next_deadline = '2026-12-24', days_left = 41, priority = 0.86 WHERE id = 'mat_001'")
        conn.execute("UPDATE matters SET status = 'in_review', next_deadline = '2027-02-02', days_left = 81, priority = 0.64 WHERE id = 'mat_002'")
        conn.execute("UPDATE matters SET status = 'draft', next_deadline = NULL, days_left = NULL, priority = 0.41 WHERE id = 'mat_003'")
        conn.execute("DELETE FROM stage_results")
    init_db()
    await kanoon_client.warm_landmark_cache()
    await seed_fast_stage_results()
    return {"reset": True}


@router.get("/access-logs", response_model=list[AccessLogEntry])
async def get_access_logs() -> list[dict[str, Any]]:
    with db_session() as conn:
        rows = conn.execute(
            "SELECT id, actor, role, matter_id, endpoint, at FROM access_logs ORDER BY id DESC LIMIT 12"
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/ml/model", response_model=ModelInfoResponse)
async def get_model_info() -> dict[str, Any]:
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
async def ml_retrain() -> dict[str, Any]:
    return retrain_from_overrides()


@router.get("/queue", response_model=list[QueueItem])
async def get_queue() -> list[dict[str, Any]]:
    return await compute_nyaya_queue()


@router.get("/alerts", response_model=list[AlertItem])
async def get_alerts() -> list[dict[str, Any]]:
    with db_session() as conn:
        matters = [dict(r) for r in conn.execute("SELECT * FROM matters ORDER BY priority DESC").fetchall()]
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


@router.post("/law-changes/scan", response_model=list[LawChangeItem])
async def scan_law_changes(body: LawScanRequest) -> list[dict[str, Any]]:
    return await evaluate_law_changes(body.text, offence_date=body.offence_date or "2025-08-14")


@router.get("/matters/{matter_id}/law-changes", response_model=list[LawChangeItem])
async def get_law_changes(matter_id: str) -> list[dict[str, Any]]:
    _get_matter_or_404(matter_id)
    return await ensure_stage(matter_id, "law_changes")


_HEALTH_PING_CACHE: dict[str, Any] = {
    "ts": 0.0,
    "running": False,
    "kanoon": "ok",
    "llm": "ok",
    "bhashini": "ok",
}


async def _refresh_external_pings() -> None:
    if _HEALTH_PING_CACHE["running"]:
        return
    _HEALTH_PING_CACHE["running"] = True
    try:
        k, l, b = await asyncio.gather(
            kanoon_client.ping(),
            llm_client.ping(),
            bhashini_client.ping(),
            return_exceptions=True,
        )
        _HEALTH_PING_CACHE["kanoon"] = k if isinstance(k, str) else "degraded"
        _HEALTH_PING_CACHE["llm"] = l if isinstance(l, str) else "degraded"
        _HEALTH_PING_CACHE["bhashini"] = b if isinstance(b, str) else "degraded"
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

    return {
        "kanoon": _HEALTH_PING_CACHE["kanoon"],
        "llm": _HEALTH_PING_CACHE["llm"],
        "bhashini": _HEALTH_PING_CACHE["bhashini"],
        "db": db_status,
        "model_version": get_current_model_version(),
        "cache_hit_rate": get_cache_hit_rate(),
    }

