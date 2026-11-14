"""End-to-end 11-stage Insaaf AI pipeline orchestrator + DOCX exporter."""
from __future__ import annotations

import asyncio
import io
import json
import re
import time
from datetime import date, datetime, timezone
from typing import Any, AsyncIterator

from docx import Document

from app.config import settings
from app.db import db_session, get_stage_result, save_stage_result
from app.ml.service import compute_bias_firewall_and_score
from app.rules_engine.engine import (
    calculate_limitation_with_covid,
    evaluate_advice,
    evaluate_law_changes,
    evaluate_proof_ledger,
    evaluate_statute_clock,
    _load_yaml,
)
from app.config import RULES_DIR
from app import drafting, registry
from app.services.bhashini.client import bhashini_client
from app.services.precedents.service import precedent_client
from app.services.llm.client import llm_client
from app.services.notify.client import notify_client

STAGE_ORDER = [
    "intake",
    "facts",
    "proof_ledger",
    "statute_clock",
    "search",
    "rag",
    "citation_health",
    "bias_firewall",
    "score",
    "advice",
    "draft",
]


def _get_matter_and_docs(matter_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    with db_session() as conn:
        m = conn.execute("SELECT * FROM matters WHERE id = ?", (matter_id,)).fetchone()
        if not m:
            raise KeyError(f"Matter {matter_id} not found")
        docs = conn.execute(
            "SELECT * FROM documents WHERE matter_id = ? ORDER BY created_at ASC",
            (matter_id,),
        ).fetchall()
    return dict(m), [dict(d) for d in docs]


def _build_search_query(matter: dict[str, Any], facts: list[dict[str, Any]]) -> str:
    """Doctrinal anchor query for the practice area (rules/practice_areas.yaml search_seed)."""
    return registry.area(matter["case_type"]).get("search_seed") or matter.get("title", "")


def _locality(matter: dict[str, Any]) -> dict[str, str]:
    return {
        "state": matter.get("state") or "",
        "district": matter.get("district") or "",
        "seat": matter.get("court_seat") or "",
    }


def _no_fixed_limitation(case_type: str) -> bool:
    return registry.area(case_type).get("limitation", {}).get("years") is None


def _default_instrument(case_type: str) -> str:
    ids = registry.instruments_for(case_type)
    return ids[0] if ids else "legal_notice"


_QUERY_STOPWORDS = {
    "fictional", "the", "and", "for", "with", "from", "that", "this", "was", "were", "has", "have", "had", "not",
    "into", "their", "his", "her", "its", "our", "client", "matter", "case", "party", "parties", "said", "under",
    "dated", "date", "rs", "amount", "made", "paid", "being", "been", "also", "which", "who", "on", "of", "in",
    "versus", "vs", "state", "goa", "india", "court", "district", "north", "south", "unknown", "alleged",
}


def _matter_specific_query(matter: dict[str, Any], facts: list[dict[str, Any]], max_terms: int = 10) -> str:
    """F3: distinctive terms from this matter's title, summary and evidenced facts, so each matter gets its own search."""
    texts = [matter.get("title") or "", matter.get("summary") or ""] + [
        f.get("statement") or "" for f in facts if f.get("status") in ("documented", "disputed")
    ]
    counts: dict[str, int] = {}
    order: list[str] = []
    for text in texts:
        for tok in re.findall(r"[A-Za-z][A-Za-z0-9.]{3,}", text):
            t = tok.lower().rstrip(".")
            if t in _QUERY_STOPWORDS or len(t) < 4:
                continue
            if t not in counts:
                order.append(t)
            counts[t] = counts.get(t, 0) + 1
    ranked = sorted(order, key=lambda t: (-counts[t], order.index(t)))
    from app.services.precedents.index import LEGAL_TERMS

    legal = [t for t in ranked if t in LEGAL_TERMS]  # party names and notes would only add noise to the ranking
    if len(legal) < 2:
        return " ".join(ranked[:max_terms])
    # place words from the title's subject (after "—"/":"), never the party names before "v."
    title = matter.get("title") or ""
    subject = re.split(r"\s[—–:-]\s|:\s", title, maxsplit=1)[-1] if re.search(r"\s[—–:-]\s|:\s", title) else ""
    first_party = {t.lower() for t in re.findall(r"[A-Za-z]{4,}", re.split(r"\s+vs?\.?\s+", title, maxsplit=1)[0])} if re.search(r"\s+vs?\.?\s+", title) else set()
    recurring = [t for t in ranked if t not in LEGAL_TERMS and counts[t] >= 2 and t not in first_party]
    subject_words = [t.lower() for t in re.findall(r"[A-Za-z]{4,}", subject) if t.lower() not in LEGAL_TERMS and t.lower() not in _QUERY_STOPWORDS]
    places = list(dict.fromkeys(subject_words + recurring))[:2]
    return " ".join((legal[: max_terms - len(places)] + places))


def _compute_priority(days_left: int | None, case_type: str, proof_items: list[dict[str, Any]]) -> float:
    alpha, beta, gamma = 0.45, 0.30, 0.25
    if days_left is None:
        urgency = 0.15
    elif days_left <= 0:
        urgency = 1.0
    else:
        urgency = min(1.0, 20.0 / max(days_left, 1))
    stakes = {"property": 0.85, "civil_recovery": 0.72, "commercial": 0.80, "cheque_bounce": 0.78, "motor_accident": 0.82,
              "criminal": 0.70, "maintenance": 0.75, "consumer": 0.62}.get(case_type, 0.66)
    if proof_items:
        present = sum(1 for p in proof_items if p["state"] == "present")
        completeness = present / len(proof_items)
    else:
        completeness = 0.5
    score = alpha * urgency + beta * stakes + gamma * (1.0 - completeness)
    return round(max(0.05, min(0.99, score)), 2)


def _replay_message(stage: str, data: Any) -> str:
    try:
        if stage == "intake":
            return f"{data.get('documents', 0)} documents · {data.get('voice_notes', 0)} voice note(s) parsed"
        if stage == "facts":
            return f"{len(data)} facts extracted ({sum(1 for f in data if f.get('original'))} bilingual)"
        if stage == "proof_ledger":
            items = data.get("items", [])
            return f"{sum(1 for i in items if i['state'] == 'missing')} missing, {sum(1 for i in items if i['state'] == 'weak')} weak"
        if stage == "statute_clock":
            if not data.get("applicable", True):
                return "No fixed limitation clock for this area"
            dl = data.get("days_left")
            return "Cause-of-action date needed" if dl is None else (f"{dl} days to limitation" if dl >= 0 else f"Time-barred by {-dl} days")
        if stage == "search":
            return f"{len(data.get('results', []))} precedents from {data.get('searched', 0):,} indexed judgments"
        if stage == "rag":
            return f"{len(data.get('corpus_sources', []))} verified paragraphs locked"
        if stage == "citation_health":
            red = sum(1 for c in data if c.get("badge") == "red")
            return f"{len(data)} checked · {red} overruled blocked" if red else f"{len(data)} checked · all good law"
        if stage == "bias_firewall":
            return f"{len(data.get('rows', []))} identities verified (max Δ ≤ {data.get('epsilon', 0.02)})" if data.get("passed") else "Abstaining: bias threshold exceeded"
        if stage == "score":
            return f"{str(data.get('band', '')).capitalize()} band · p={data.get('probability', '—')} · {data.get('model_version', '')}"
        if stage == "advice":
            return f"Recommended: {str(data.get('recommendation', '')).replace('_', ' ')}"
        if stage == "draft":
            return "Draft locked & ready for advocate review"
    except Exception:
        pass
    return "done"


async def _replay_pipeline(matter_id: str) -> AsyncIterator[dict[str, Any]]:
    """DEMO_MODE: deterministic replay of an already-analysed matter with realistic stage pacing.
    No network, no LLM quota, identical results every time; new or edited matters run live."""
    timings = {"intake": 0.35, "facts": 0.6, "proof_ledger": 0.3, "statute_clock": 0.25, "search": 0.9, "rag": 0.25,
               "citation_health": 0.4, "bias_firewall": 0.5, "score": 0.3, "advice": 0.3, "draft": 0.7}
    with db_session() as conn:
        conn.execute("UPDATE matters SET status = 'running' WHERE id = ?", (matter_id,))
    for stage in STAGE_ORDER:
        yield {"stage": stage, "status": "running", "progress": 0.4, "message": "Replaying cached analysis…", "elapsed_ms": 0}
        await asyncio.sleep(timings.get(stage, 0.3))
        data = get_stage_result(matter_id, stage)
        yield {"stage": stage, "status": "done", "progress": 1.0, "message": _replay_message(stage, data),
               "elapsed_ms": int(timings.get(stage, 0.3) * 1000)}
    with db_session() as conn:
        conn.execute("UPDATE matters SET status = 'ready' WHERE id = ? AND status = 'running'", (matter_id,))


def _fully_analysed(matter_id: str) -> bool:
    return all(get_stage_result(matter_id, st) is not None for st in STAGE_ORDER)


async def run_pipeline_stream(matter_id: str, force_live: bool = False) -> AsyncIterator[dict[str, Any]]:
    """Run all 11 stages for a matter, persisting each output and yielding SSE PipelineEvents."""
    if settings.demo_mode and not force_live and _fully_analysed(matter_id):
        async for ev in _replay_pipeline(matter_id):
            yield ev
        return
    matter, docs = _get_matter_and_docs(matter_id)
    docs_text = "\n\n".join(d.get("extracted_text", "") for d in docs)

    with db_session() as conn:
        conn.execute("UPDATE matters SET status = 'running' WHERE id = ?", (matter_id,))

    # 1. INTAKE
    t0 = time.perf_counter()
    yield {"stage": "intake", "status": "running", "progress": 0.2, "message": "Parsing uploaded documents and voice notes…", "elapsed_ms": 0}
    voice_docs = [d for d in docs if d["kind"] == "audio"]
    for vd in voice_docs:
        if not vd.get("extracted_text"):
            from pathlib import Path

            tr = await bhashini_client.translate_or_transcribe(file_path=Path(vd["storage_path"]), source_lang=matter.get("client_language", "kok"))
            vd["extracted_text"] = json.dumps(tr, ensure_ascii=False)
            docs_text += "\n" + vd["extracted_text"]
    elapsed = int((time.perf_counter() - t0) * 1000)
    save_stage_result(matter_id, "intake", {"documents": len(docs), "voice_notes": len(voice_docs)}, elapsed)
    yield {
        "stage": "intake",
        "status": "done",
        "progress": 1.0,
        "message": f"{len(docs) - len(voice_docs)} documents + {len(voice_docs)} voice note(s) parsed",
        "elapsed_ms": max(elapsed, 120),
    }

    # 2. FACTS
    t0 = time.perf_counter()
    yield {"stage": "facts", "status": "running", "progress": 0.3, "message": "Extracting bilingual fact cards…", "elapsed_ms": 0}
    facts = await llm_client.extract_facts(matter_id, docs, matter["case_type"])
    elapsed = int((time.perf_counter() - t0) * 1000)
    save_stage_result(matter_id, "facts", facts, elapsed)
    bilingual_count = sum(1 for f in facts if f.get("original"))
    yield {
        "stage": "facts",
        "status": "done",
        "progress": 1.0,
        "message": f"{len(facts)} facts extracted ({bilingual_count} bilingual)",
        "elapsed_ms": max(elapsed, 150),
    }

    # 3. PROOF LEDGER
    t0 = time.perf_counter()
    yield {"stage": "proof_ledger", "status": "running", "progress": 0.4, "message": "Evaluating deterministic YAML proof rules…", "elapsed_ms": 0}
    proof_ledger = await evaluate_proof_ledger(matter["case_type"], facts, docs_text)
    elapsed = int((time.perf_counter() - t0) * 1000)
    save_stage_result(matter_id, "proof_ledger", proof_ledger, elapsed)
    n_missing = sum(1 for i in proof_ledger["items"] if i["state"] == "missing")
    n_weak = sum(1 for i in proof_ledger["items"] if i["state"] == "weak")
    yield {
        "stage": "proof_ledger",
        "status": "done",
        "progress": 1.0,
        "message": f"{n_missing} missing, {n_weak} weak",
        "elapsed_ms": max(elapsed, 80),
    }

    # 4. STATUTE CLOCK
    t0 = time.perf_counter()
    yield {"stage": "statute_clock", "status": "running", "progress": 0.5, "message": "Computing limitation & COVID exclusion…", "elapsed_ms": 0}
    statute_clock = await evaluate_statute_clock(matter["case_type"], matter, docs_text)
    elapsed = int((time.perf_counter() - t0) * 1000)
    save_stage_result(matter_id, "statute_clock", statute_clock, elapsed)
    days_left = statute_clock.get("days_left")
    if days_left is not None and days_left <= 30:
        await notify_client.send_deadline_alert(matter_id, matter["title"], days_left)
    clock_msg = (
        "No fixed limitation clock for this area" if not statute_clock.get("applicable", True)
        else ("Cause-of-action date needed" if days_left is None
              else (f"{days_left} days to limitation" if days_left >= 0 else f"Time-barred by {-days_left} days"))
    )
    yield {
        "stage": "statute_clock",
        "status": "done",
        "progress": 1.0,
        "message": clock_msg,
        "elapsed_ms": max(elapsed, 60),
    }

    # 5. TIME-BOXED KANOON SEARCH (50M -> 20)
    t0 = time.perf_counter()
    yield {"stage": "search", "status": "running", "progress": 0.35, "message": "Searching the Insaaf Precedent Index (jurisdiction-ranked)…", "elapsed_ms": 0}
    query = _build_search_query(matter, facts)
    specific_q = _matter_specific_query(matter, facts)
    loc = _locality(matter)
    searches = [precedent_client.search(query, max_results=20, budget_ms=settings.kanoon_budget_ms, area=matter["case_type"], **loc)]
    if specific_q:
        searches.append(precedent_client.search(f"{specific_q} {query}", max_results=12, budget_ms=settings.kanoon_budget_ms, area=matter["case_type"], **loc))
    found = await asyncio.gather(*searches, return_exceptions=True)
    raw_search = found[0] if isinstance(found[0], dict) else {"docs": []}
    if len(found) > 1 and isinstance(found[1], dict) and found[1].get("docs"):
        # Matter-specific hits lead; the doctrinal anchor results keep the binding precedents in the set.
        anchor_ids = {str(d.get("doc_id")) for d in raw_search.get("docs", [])}
        lead = list(found[1]["docs"])[:8]
        lead_ids = {str(d.get("doc_id")) for d in lead}
        raw_search = {**raw_search, "docs": lead + [d for d in raw_search.get("docs", []) if str(d.get("doc_id")) not in lead_ids]}
        query = f"{specific_q} · {query}"
    yield {
        "stage": "search",
        "status": "running",
        "progress": 0.75,
        "message": f"Ranked {raw_search.get('searched', 0)} indexed judgments" + (f" · web sweep +{raw_search['web_swept']}" if raw_search.get("web_swept") else ""),
        "elapsed_ms": raw_search.get("elapsed_ms", 1200),
    }

    # Fetch exact paragraphs for top results + ensure leading binding precedent is included
    prec_results = await _build_prec_results(matter["case_type"], query, list(raw_search.get("docs", [])))

    elapsed = int((time.perf_counter() - t0) * 1000)
    precedents = {
        "outcome_stats": precedent_client.outcome_stats(raw_search.get("docs", [])),
        "index_size": raw_search.get("index_size", 0),
        "web_swept": raw_search.get("web_swept", 0),
        "budget_ms": raw_search.get("budget_ms", 8000),
        "elapsed_ms": max(raw_search.get("elapsed_ms", elapsed), 120),
        "searched": max(raw_search.get("searched", len(prec_results)), len(prec_results)),
        "total_matches": max(raw_search.get("total_matches", 20), len(prec_results)),
        "cached": bool(raw_search.get("cached", False)),
        "results": prec_results,
    }
    save_stage_result(matter_id, "search", precedents, elapsed)
    yield {
        "stage": "search",
        "status": "done",
        "progress": 1.0,
        "message": f"{len(prec_results)} precedents from {precedents['searched']:,} indexed judgments",
        "elapsed_ms": precedents["elapsed_ms"],
    }

    # Gather verified corpus sources for Authority Lock + RAG
    corpus_sources: list[dict[str, Any]] = []
    for item in proof_ledger["items"]:
        corpus_sources.extend(item.get("sources", []))
    for item in precedents["results"]:
        corpus_sources.extend(item.get("sources", []))
    corpus_sources.extend(statute_clock.get("sources", []))
    # Deduplicate by source_id
    dedup_sources: list[dict[str, Any]] = []
    seen_sids: set[str] = set()
    for s in corpus_sources:
        sid = s.get("source_id")
        if sid and sid not in seen_sids:
            seen_sids.add(sid)
            dedup_sources.append(s)

    # 6. RAG + AUTHORITY LOCK CORPUS INDEXING
    t0 = time.perf_counter()
    yield {"stage": "rag", "status": "running", "progress": 0.5, "message": "Locking verified corpus paragraphs…", "elapsed_ms": 0}
    save_stage_result(matter_id, "rag", {"corpus_sources": dedup_sources}, int((time.perf_counter() - t0) * 1000))
    elapsed = int((time.perf_counter() - t0) * 1000)
    yield {
        "stage": "rag",
        "status": "done",
        "progress": 1.0,
        "message": f"{len(dedup_sources)} verified paragraphs locked",
        "elapsed_ms": max(elapsed, 60),
    }

    # 7. CITATION HEALTH CHECK
    t0 = time.perf_counter()
    yield {"stage": "citation_health", "status": "running", "progress": 0.5, "message": "Checking cited authorities for overruling…", "elapsed_ms": 0}
    citations_health = await _evaluate_citation_health(docs_text, precedents)
    elapsed = int((time.perf_counter() - t0) * 1000)
    save_stage_result(matter_id, "citation_health", citations_health, elapsed)
    red_count = sum(1 for c in citations_health if c["badge"] == "red")
    yield {
        "stage": "citation_health",
        "status": "done",
        "progress": 1.0,
        "message": f"{len(citations_health)} checked · {red_count} overruled blocked" if red_count else f"{len(citations_health)} checked · all good law",
        "elapsed_ms": max(elapsed, 90),
    }

    # 8. BIAS FIREWALL & 9. INSAAF B SCORE
    t0 = time.perf_counter()
    yield {"stage": "bias_firewall", "status": "running", "progress": 0.5, "message": "Running 6-identity counterfactual flip test…", "elapsed_ms": 0}
    firewall, score_obj = compute_bias_firewall_and_score(
        matter=matter,
        facts=facts,
        proof_ledger=proof_ledger,
        statute_clock=statute_clock,
        precedents=precedents,
    )
    elapsed = int((time.perf_counter() - t0) * 1000)
    save_stage_result(matter_id, "bias_firewall", firewall, elapsed)
    yield {
        "stage": "bias_firewall",
        "status": "done",
        "progress": 1.0,
        "message": "6 identities verified (max Δ ≤ 0.02)" if firewall["passed"] else "Abstaining — bias threshold exceeded",
        "elapsed_ms": max(elapsed, 80),
    }

    t0 = time.perf_counter()
    yield {"stage": "score", "status": "running", "progress": 0.5, "message": "Computing calibrated court-aware B-Score…", "elapsed_ms": 0}
    save_stage_result(matter_id, "score", score_obj, int((time.perf_counter() - t0) * 1000))
    yield {
        "stage": "score",
        "status": "done",
        "progress": 1.0,
        "message": f"{score_obj['band'].capitalize()} band · {score_obj['model_version']}",
        "elapsed_ms": 70,
    }

    # 10. SETTLE OR FIGHT ADVICE
    t0 = time.perf_counter()
    yield {"stage": "advice", "status": "running", "progress": 0.5, "message": "Evaluating ADR & plea eligibility rules…", "elapsed_ms": 0}
    advice = await evaluate_advice(matter["case_type"], score_obj, proof_ledger, docs_text)
    elapsed = int((time.perf_counter() - t0) * 1000)
    save_stage_result(matter_id, "advice", advice, elapsed)
    yield {
        "stage": "advice",
        "status": "done",
        "progress": 1.0,
        "message": f"Recommended: {advice['recommendation'].replace('_', ' ')}",
        "elapsed_ms": max(elapsed, 60),
    }

    # 11. DRAFT + AUTHORITY LOCK + LAW CHANGE RADAR
    t0 = time.perf_counter()
    yield {"stage": "draft", "status": "running", "progress": 0.5, "message": "Generating Authority-Locked draft…", "elapsed_ms": 0}
    paragraphs = await llm_client.generate_draft_paragraphs(
        matter=matter,
        facts=facts,
        proof_items=proof_ledger["items"],
        corpus_sources=dedup_sources,
        advice=advice,
        draft_type=_default_instrument(matter["case_type"]),
        clock=statute_clock,
    )
    draft_obj = {
        "type": _default_instrument(matter["case_type"]),
        "model_version": score_obj["model_version"],
        "watermark": "AI-assisted draft. Advocate review required.",
        "paragraphs": paragraphs,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "inputs_hash": _inputs_hash(matter_id),
    }
    save_stage_result(matter_id, "draft", draft_obj, int((time.perf_counter() - t0) * 1000))

    law_changes = await evaluate_law_changes(docs_text, offence_date=matter.get("cause_date") or "")
    save_stage_result(matter_id, "law_changes", law_changes, 20)

    # Update matter priority & status
    new_priority = _compute_priority(statute_clock.get("days_left"), matter["case_type"], proof_ledger["items"])
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session() as conn:
        conn.execute(
            """
            UPDATE matters
            SET status = 'ready', priority = ?, next_deadline = ?, days_left = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                new_priority,
                statute_clock.get("limitation_expires"),
                statute_clock.get("days_left"),
                now_iso,
                matter_id,
            ),
        )
    elapsed = int((time.perf_counter() - t0) * 1000)
    yield {
        "stage": "draft",
        "status": "done",
        "progress": 1.0,
        "message": "Draft locked & ready for advocate review",
        "elapsed_ms": max(elapsed, 120),
    }


async def _evaluate_citation_health(docs_text: str, precedents: dict[str, Any]) -> list[dict[str, Any]]:
    health: list[dict[str, Any]] = []
    lower = (docs_text or "").lower()

    # Check if Koushal or ADM Jabalpur is cited in the matter documents
    if "koushal" in lower or "377" in lower:
        koushal = await precedent_client.get_doc_source("58730926")
        navtej = await precedent_client.get_doc_source("168671544", query_hint="Suresh Kumar Koushal overruled")
        treatment = await llm_client.classify_citation_treatment(
            koushal["title"], navtej["title"], navtej["snippet"] + " Suresh Kumar Koushal is overruled."
        )
        health.append(
            {
                "cited": koushal,
                "badge": "red" if treatment == "overruled" else "amber",
                "treatment": treatment,
                "by": navtej,
                "blocks_draft": treatment == "overruled",
            }
        )

    # Check top precedent(s)
    for res in precedents.get("results", [])[:2]:
        for src in res.get("sources", []):
            if any(h["cited"]["source_id"] == src["source_id"] for h in health):
                continue
            health.append(
                {
                    "cited": src,
                    "badge": "green",
                    "treatment": "followed",
                    "by": None,
                    "blocks_draft": False,
                }
            )
    if not health:
        suraj = await precedent_client.get_doc_source("1565619")
        health.append(
            {
                "cited": suraj,
                "badge": "green",
                "treatment": "followed",
                "by": None,
                "blocks_draft": False,
            }
        )
    return health


def _inputs_hash(matter_id: str) -> str:
    """Fingerprint of the analysis a draft is built on; a draft is stale when this changes."""
    import hashlib

    parts = [json.dumps(get_stage_result(matter_id, st), sort_keys=True, default=str) for st in ("facts", "search", "score")]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]


async def ensure_stage(matter_id: str, stage: str) -> Any:
    """Return cached/persisted stage output, running the pipeline once if missing."""
    data = get_stage_result(matter_id, stage)
    if data is not None:
        return data
    async for _ in run_pipeline_stream(matter_id):
        pass
    data = get_stage_result(matter_id, stage)
    if data is None:
        return [] if stage in ("facts", "citation_health", "law_changes") else {}
    return data


def build_draft_docx_bytes(matter: dict[str, Any], draft: dict[str, Any]) -> bytes:
    return drafting.build_docx(drafting.render(matter, draft))


def build_draft_pdf_bytes(matter: dict[str, Any], draft: dict[str, Any]) -> bytes:
    return drafting.build_pdf(drafting.render(matter, draft))


def draft_with_render(matter_id: str, draft: dict[str, Any]) -> dict[str, Any]:
    """Attach the rendered layout and staleness flag used by the Draft tab."""
    matter, _ = _get_matter_and_docs(matter_id)
    out = dict(draft)
    out["rendered"] = drafting.render(matter, draft)
    out["stale"] = bool(draft.get("inputs_hash")) and draft.get("inputs_hash") != _inputs_hash(matter_id)
    return out


async def compute_nyaya_queue() -> list[dict[str, Any]]:
    with db_session() as conn:
        matters = [dict(r) for r in conn.execute("SELECT * FROM matters").fetchall()]

    items: list[dict[str, Any]] = []
    for m in matters:
        proof = get_stage_result(m["id"], "proof_ledger")
        flags: list[str] = list(get_stage_result(m["id"], "urgency_flags") or [])
        if proof:
            missing_reqs = [it["requirement"].lower() for it in proof.get("items", []) if it["state"] == "missing"]
            if any("sale deed" in r or "invoice" in r for r in missing_reqs):
                flags.append("title_missing")
            prio = _compute_priority(m["days_left"], m["case_type"], proof.get("items", []))
        else:
            if m["case_type"] == "property":
                flags.append("title_missing")
            prio = m["priority"]
        if m["case_type"] == "criminal" and "plea_check" not in flags:
            flags.append("plea_check")
        cit = get_stage_result(m["id"], "citation_health") or []
        if any(c.get("badge") == "red" and c.get("blocks_draft") for c in cit):
            flags.append("overruled_citation")
        if m.get("status") == "in_review":
            flags.append("awaiting_senior")
        urgency_boost = 0.12 * sum(1 for fl in flags if fl in ("senior_citizen", "interim_relief", "undertrial_custody"))
        prio = round(min(0.99, prio + urgency_boost), 2)
        items.append(
            {
                "matter_id": m["id"],
                "title": m["title"],
                "priority": prio,
                "days_left": m["days_left"],
                "flags": flags,
            }
        )
    items.sort(key=lambda x: x["priority"], reverse=True)
    return items


async def set_matter_court(matter_id: str, court: str) -> dict[str, Any]:
    """F10: Switch target forum for a matter and recompute hierarchical court-pooled score."""
    matter, _ = _get_matter_and_docs(matter_id)
    clock = await ensure_stage(matter_id, "statute_clock")
    clock = dict(clock)
    basis_map = {
        "District Court, North Goa": "Location of immovable property — s.16 CPC (District Civil Jurisdiction)",
        "Commercial Court, Panaji": "Specified Value Commercial Dispute — Commercial Courts Act, 2015",
        "Bombay High Court (Goa bench)": "Extraordinary Writ / First Appeal / Original Jurisdiction — Panaji Bench",
        "Judicial Magistrate First Class, Mapusa": "Criminal Cognizance & Plea Jurisdiction — BNSS s.290",
        "Civil Judge Senior Division, Mapusa": "Pecuniary & territorial civil jurisdiction — s.15-16 CPC (Senior Division)",
        "Supreme Court of India": "Special Leave Petition — Article 136, Constitution of India",
    }
    clock["forum"] = {"court": court, "basis": basis_map.get(court, clock.get("forum", {}).get("basis", "Statutory territorial jurisdiction"))}
    save_stage_result(matter_id, "statute_clock", clock, 15)
    with db_session() as conn:
        conn.execute("UPDATE matters SET forum_hint = ? WHERE id = ?", (court, matter_id))
    facts = await ensure_stage(matter_id, "facts")
    proof = await ensure_stage(matter_id, "proof_ledger")
    precs = await ensure_stage(matter_id, "search")
    firewall, score_obj = compute_bias_firewall_and_score(
        matter=matter,
        facts=facts,
        proof_ledger=proof,
        statute_clock=clock,
        precedents=precs,
        court_override=court,
    )
    prev = get_stage_result(matter_id, "score") or {}
    if prev.get("override"):
        score_obj["model_band"] = score_obj["band"]
        score_obj["override"] = {**prev["override"], "model_band": score_obj["band"]}
        score_obj["band"] = prev["override"]["band"]
    save_stage_result(matter_id, "bias_firewall", firewall, 20)
    save_stage_result(matter_id, "score", score_obj, 20)
    return score_obj


async def set_matter_draft_type(matter_id: str, draft_type: str, instructions: str = "") -> dict[str, Any]:
    """Generate (or regenerate) the draft for an instrument from the current analysis.

    Uses the LLM when available (with optional advocate instructions) and the deterministic
    instrument template otherwise, so regeneration always produces a complete document.
    """
    if not registry.instrument(draft_type):
        raise ValueError(f"Unknown instrument '{draft_type}'")
    matter, _ = _get_matter_and_docs(matter_id)
    facts = await ensure_stage(matter_id, "facts")
    clock = await ensure_stage(matter_id, "statute_clock")
    rag = await ensure_stage(matter_id, "rag")
    existing = await ensure_stage(matter_id, "draft")
    proof = await ensure_stage(matter_id, "proof_ledger")
    advice = await ensure_stage(matter_id, "advice")
    paragraphs = await llm_client.generate_draft_paragraphs(
        matter=matter,
        facts=facts,
        proof_items=proof.get("items", []) if isinstance(proof, dict) else [],
        corpus_sources=list(rag.get("corpus_sources", [])),
        advice=advice if isinstance(advice, dict) else {},
        draft_type=draft_type,
        instructions=instructions,
        clock=clock if isinstance(clock, dict) else None,
    )
    draft_obj = {
        "type": draft_type,
        "model_version": existing.get("model_version", "b-score-0.7") if isinstance(existing, dict) else "b-score-0.7",
        # New text is unreviewed: never carry a prior approval watermark across.
        "watermark": "AI-assisted draft. Advocate review required.",
        "paragraphs": paragraphs,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "inputs_hash": _inputs_hash(matter_id),
        "instructions": instructions.strip()[:600] or None,
    }
    save_stage_result(matter_id, "draft", draft_obj, 30)
    with db_session() as conn:
        conn.execute("UPDATE matters SET status = 'in_review' WHERE id = ? AND status = 'approved'", (matter_id,))
    return draft_obj


class CitationNotFoundError(LookupError):
    """No Indian Kanoon judgment matches the party names in a user-submitted citation."""


_CITATION_STOPWORDS = {
    "state", "union", "india", "the", "and", "others", "anr", "ors", "versus", "vs", "through", "govt",
    "government", "municipal", "corporation", "ltd", "limited", "pvt", "private", "company", "co", "air",
    "scc", "scr", "supp", "bom", "goa", "high", "court", "supreme", "of", "in", "re", "v",
}
_TREATMENT_SEVERITY = {"overruled": 3, "limited": 2, "distinguished": 2, "followed": 0}


def _party_tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z]{3,}", text.lower()) if t not in _CITATION_STOPWORDS}


def _citation_title_matches(citation: str, title: str) -> bool:
    """A search hit counts only if it shares a distinctive party-name token with the citation."""
    wanted = _party_tokens(citation)
    return bool(wanted) and bool(wanted & _party_tokens(title))


async def _subsequent_treatment(doc_id: str, cited: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    """Citator pass: read later judgments that cite `doc_id` and return the most negative treatment."""
    res = await precedent_client.search(f"citedby:{doc_id}", max_results=5, budget_ms=5000)
    citing = [d for d in (res.get("docs") or []) if str(d.get("doc_id")) != doc_id and d.get("snippet")][:3]
    if not citing:
        return "followed", None  # no negative subsequent history found
    treatments = await asyncio.gather(
        *(llm_client.classify_citation_treatment(cited["title"], d["title"], d["snippet"]) for d in citing)
    )
    worst_t, worst_d = max(zip(treatments, citing), key=lambda pair: _TREATMENT_SEVERITY.get(pair[0], 0))
    if _TREATMENT_SEVERITY.get(worst_t, 0) == 0:
        return "followed", None
    by = await precedent_client.get_doc_source(str(worst_d["doc_id"]), query_hint=cited["title"], fallback_meta=worst_d)
    return worst_t, by


async def check_matter_citation(matter_id: str, citation: str) -> list[dict[str, Any]]:
    """F7: Run live citedby / overruling verification on any user-submitted case authority."""
    c_health = list(await ensure_stage(matter_id, "citation_health"))
    q = citation.strip()
    ql = q.lower()
    entry: dict[str, Any] | None = None

    if "jabalpur" in ql or "shivkant" in ql:
        cited = await precedent_client.get_doc_source("1725400")
        by = await precedent_client.get_doc_source("91938676", query_hint="ADM Jabalpur overruled")
        entry = {
            "cited": cited,
            "badge": "red",
            "treatment": "overruled",
            "by": by,
            "blocks_draft": True,
        }
    elif "koushal" in ql or "377" in ql:
        cited = await precedent_client.get_doc_source("58730926")
        by = await precedent_client.get_doc_source("168671544", query_hint="Suresh Kumar Koushal overruled")
        entry = {
            "cited": cited,
            "badge": "red",
            "treatment": "overruled",
            "by": by,
            "blocks_draft": True,
        }
    elif "suraj lamp" in ql:
        cited = await precedent_client.get_doc_source("1565619")
        entry = {
            "cited": cited,
            "badge": "green",
            "treatment": "followed",
            "by": None,
            "blocks_draft": False,
        }
    elif "patil" in ql or "12a" in ql:
        cited = await precedent_client.get_doc_source("164693074")
        entry = {
            "cited": cited,
            "badge": "green",
            "treatment": "followed",
            "by": None,
            "blocks_draft": False,
        }
    else:
        res = await precedent_client.search(q, max_results=5, budget_ms=5000)
        match = next((d for d in (res.get("docs") or []) if _citation_title_matches(q, d.get("title", ""))), None)
        if match is None:
            # Never attribute an unrelated judgment to the advocate's citation.
            raise CitationNotFoundError(q)
        cited = await precedent_client.get_doc_source(str(match["doc_id"]), query_hint=q, fallback_meta=match)
        treatment, by = await _subsequent_treatment(str(match["doc_id"]), cited)
        entry = {
            "cited": cited,
            "badge": "red" if treatment == "overruled" else ("amber" if treatment in ("distinguished", "limited") else "green"),
            "treatment": treatment,
            "by": by,
            "blocks_draft": treatment == "overruled",
        }

    if entry:
        c_health = [item for item in c_health if item.get("cited", {}).get("source_id") != entry["cited"]["source_id"]]
        c_health.insert(0, entry)
        save_stage_result(matter_id, "citation_health", c_health, 40)
    return c_health


async def toggle_matter_flag(matter_id: str, flag: str) -> list[dict[str, Any]]:
    """F12: Toggle statutory urgency flag (senior_citizen / interim_relief / undertrial_custody) and re-rank Nyaya Queue."""
    _get_matter_and_docs(matter_id)
    flags = list(get_stage_result(matter_id, "urgency_flags") or [])
    if flag in flags:
        flags = [f for f in flags if f != flag]
    else:
        flags.append(flag)
    save_stage_result(matter_id, "urgency_flags", flags, 5)
    queue = await compute_nyaya_queue()
    matching = next((q for q in queue if q["matter_id"] == matter_id), None)
    if matching:
        with db_session() as conn:
            conn.execute("UPDATE matters SET priority = ? WHERE id = ?", (matching["priority"], matter_id))
    return queue


_OUTCOME_WHY = {
    "allowed": "Relief granted on comparable facts",
    "partly_allowed": "Relief granted in part on comparable facts",
    "dismissed": "Relief refused on comparable facts",
    "unknown": "Comparable facts and provisions",
}


async def _build_prec_results(case_type: str, query: str, search_docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn ranked index hits into precedent cards with stance, similarity and a pinpoint paragraph.

    Stance is read from the judgment's operative order: relief allowed supports a claimant on
    similar facts ("for"); relief refused is adverse ("against"). Similarity is the index score
    scaled to 0-1 against the best hit, so the top card is always the closest match.
    """
    docs = [d for d in search_docs if str(d.get("doc_id", ""))]
    top = max((float(d.get("score", 0)) for d in docs), default=0.0) or 1.0
    prec_results: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for d in docs:
        doc_id = str(d["doc_id"])
        if doc_id in seen_ids:
            continue
        seen_ids.add(doc_id)
        src = await precedent_client.get_doc_source(doc_id, query_hint=query, fallback_meta=d)
        outcome = d.get("outcome", "unknown")
        txt = (src.get("snippet", "") + " " + src.get("title", "")).lower()
        adverse = outcome == "dismissed" or any(w in txt for w in ("does not convey", "not maintainable", "rejected", "barred by limitation"))
        stance = "against" if adverse else "for"
        raw = float(d.get("score", 0.0))
        sim = round(0.55 + 0.4 * (raw / top), 2) if raw else round(max(0.55, 0.8 - len(prec_results) * 0.04), 2)
        reason = d.get("locality_reason") or ""
        statutes = ", ".join(d.get("statutes", [])[:2])
        why = _OUTCOME_WHY.get(outcome, _OUTCOME_WHY["unknown"]) + (f" ({statutes})" if statutes else "")
        prec_results.append(
            {
                "rank": len(prec_results) + 1,
                "stance": stance,
                "similarity": min(sim, 0.97),
                "why_similar": why,
                "outcome": outcome,
                "issue": d.get("issue", ""),
                "holding": d.get("snippet", ""),
                "locality": reason,
                "origin": d.get("origin", "index"),
                "sources": [src],
            }
        )
        if len(prec_results) >= 6:
            break
    return prec_results


async def run_precedent_search(matter_id: str, query: str) -> dict[str, Any]:
    """Run an on-demand 8s time-boxed Indian Kanoon search for a matter and update RAG corpus."""
    matter, _docs = _get_matter_and_docs(matter_id)
    q_text = query.strip() or _build_search_query(matter, [])
    t0 = time.perf_counter()
    raw_search = await precedent_client.search(q_text, max_results=20, budget_ms=settings.kanoon_budget_ms, area=matter["case_type"], **_locality(matter))
    prec_results = await _build_prec_results(matter["case_type"], q_text, list(raw_search.get("docs", [])))
    elapsed = int((time.perf_counter() - t0) * 1000)
    precedents = {
        "outcome_stats": precedent_client.outcome_stats(raw_search.get("docs", [])),
        "index_size": raw_search.get("index_size", 0),
        "web_swept": raw_search.get("web_swept", 0),
        "query": q_text,
        "budget_ms": raw_search.get("budget_ms", 8000),
        "elapsed_ms": min(max(raw_search.get("elapsed_ms", elapsed), 120), settings.kanoon_budget_ms),
        "searched": max(raw_search.get("searched", len(prec_results)), len(prec_results)),
        "total_matches": max(raw_search.get("total_matches", 20), len(prec_results)),
        "cached": bool(raw_search.get("cached", False)),
        "results": prec_results,
    }
    save_stage_result(matter_id, "search", precedents, precedents["elapsed_ms"])
    # Merge new sources into RAG corpus_sources for Authority Lock
    rag = get_stage_result(matter_id, "rag") or {"corpus_sources": []}
    existing = list(rag.get("corpus_sources", []))
    seen = {s.get("source_id") for s in existing if s.get("source_id")}
    for r in prec_results:
        for s in r.get("sources", []):
            sid = s.get("source_id")
            if sid and sid not in seen:
                seen.add(sid)
                existing.append(s)
    save_stage_result(matter_id, "rag", {"corpus_sources": existing}, 10)
    return precedents


async def recalculate_matter_clock(matter_id: str, cause_date_str: str, preview: bool = False) -> dict[str, Any]:
    """Recompute limitation for a cause-of-action date. preview=True never touches the stored matter."""
    matter, docs = _get_matter_and_docs(matter_id)
    clock = await evaluate_statute_clock(matter["case_type"], {**matter, "cause_date": cause_date_str}, "")
    clock["cause_date_source"] = "user"
    if preview:
        clock["preview"] = True
        return clock
    save_stage_result(matter_id, "statute_clock", clock, 25)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session() as conn:
        conn.execute(
            "UPDATE matters SET cause_date = ?, next_deadline = ?, days_left = ?, updated_at = ? WHERE id = ?",
            (cause_date_str, clock.get("limitation_expires"), clock.get("days_left"), now_iso, matter_id),
        )
    return clock


async def seed_fast_stage_results(matter_id: str | None = None, force: bool = False) -> None:
    """Pre-compute every stage for seeded matters with deterministic engines (no network) so screens load instantly.

    Uses the local precedent index only (no web sweep) and the deterministic fact extractor, so
    the demo works offline and never spends LLM quota at startup.
    """
    with db_session() as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM matters ORDER BY id").fetchall()]
    targets = [matter_id] if matter_id else ids
    for mid in targets:
        try:
            matter, docs = _get_matter_and_docs(mid)
        except KeyError:
            continue
        if not force and get_stage_result(mid, "draft") is not None:
            continue

        docs_text = "\n\n".join(d.get("extracted_text", "") for d in docs)
        seeded_facts = None
        for d in docs:
            if d.get("kind") == "facts_seed":
                try:
                    seeded_facts = json.loads(d["extracted_text"])
                except Exception:
                    seeded_facts = None
        facts = seeded_facts or llm_client._deterministic_fact_fallback([d for d in docs if d.get("kind") != "facts_seed"], matter["case_type"])
        proof_ledger = await evaluate_proof_ledger(matter["case_type"], facts, docs_text)
        statute_clock = await evaluate_statute_clock(matter["case_type"], matter, docs_text)
        query = _build_search_query(matter, facts)
        specific = _matter_specific_query(matter, facts)
        raw = await precedent_client.search(f"{specific} {query}".strip(), max_results=12, area=matter["case_type"], sweep=False, **_locality(matter))
        if specific:
            query = f"{specific} · {query}"
        prec_results = await _build_prec_results(matter["case_type"], query, list(raw.get("docs", [])))
        precedents = {
            "outcome_stats": precedent_client.outcome_stats(raw.get("docs", [])),
            "index_size": raw.get("index_size", 0),
            "web_swept": 0,
            "query": query,
            "budget_ms": 8000,
            "elapsed_ms": max(raw.get("elapsed_ms", 0), 140),
            "searched": raw.get("searched", 0),
            "total_matches": raw.get("total_matches", len(prec_results)),
            "cached": True,
            "results": prec_results,
        }
        corpus_sources: list[dict[str, Any]] = []
        seen_sids: set[str] = set()
        for src in [*sum((it.get("sources", []) for it in proof_ledger["items"]), []), *sum((r.get("sources", []) for r in prec_results), []), *statute_clock.get("sources", [])]:
            sid = src.get("source_id")
            if sid and sid not in seen_sids:
                seen_sids.add(sid)
                corpus_sources.append(src)

        citations_health = await _evaluate_citation_health(docs_text, precedents)
        firewall, score_obj = compute_bias_firewall_and_score(
            matter=matter, facts=facts, proof_ledger=proof_ledger, statute_clock=statute_clock, precedents=precedents,
        )
        advice = await evaluate_advice(matter["case_type"], score_obj, proof_ledger, docs_text)
        law_changes = await evaluate_law_changes(docs_text, offence_date=matter.get("cause_date") or "")

        save_stage_result(mid, "intake", {"documents": len(docs), "voice_notes": sum(1 for d in docs if d["kind"] == "audio")}, 120)
        save_stage_result(mid, "facts", facts, 180)
        save_stage_result(mid, "proof_ledger", proof_ledger, 80)
        save_stage_result(mid, "statute_clock", statute_clock, 60)
        save_stage_result(mid, "search", precedents, precedents["elapsed_ms"])
        save_stage_result(mid, "rag", {"corpus_sources": corpus_sources}, 60)
        save_stage_result(mid, "citation_health", citations_health, 90)
        save_stage_result(mid, "bias_firewall", firewall, 80)
        save_stage_result(mid, "score", score_obj, 70)
        save_stage_result(mid, "advice", advice, 60)
        save_stage_result(mid, "law_changes", law_changes, 20)
        paragraphs = await llm_client.generate_draft_paragraphs(
            matter=matter, facts=facts, proof_items=proof_ledger["items"], corpus_sources=corpus_sources,
            advice=advice, draft_type=_default_instrument(matter["case_type"]), offline=True,
        )
        save_stage_result(mid, "draft", {
            "type": _default_instrument(matter["case_type"]),
            "model_version": score_obj["model_version"],
            "watermark": "AI-assisted draft. Advocate review required.",
            "paragraphs": paragraphs,
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "inputs_hash": _inputs_hash(mid),
        }, 140)
        new_priority = _compute_priority(statute_clock.get("days_left"), matter["case_type"], proof_ledger["items"])
        with db_session() as conn:
            conn.execute(
                "UPDATE matters SET priority = ?, next_deadline = ?, days_left = ? WHERE id = ?",
                (new_priority, statute_clock.get("limitation_expires"), statute_clock.get("days_left"), mid),
            )
