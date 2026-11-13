"""Precedent retrieval facade used by the pipeline: local index first, live web sweep second.

Exposes the same contract the pipeline used before (search / get_doc_source / ping), so the
11-stage pipeline, citation checks and rule packs need no other changes.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db import db_session
from app.services.precedents import corpus
from app.services.precedents.harvest import doc_id_from_url, fetch_judgment, record_from_serper, serper_key, serper_search
from app.services.precedents.index import STATE_HC, precedent_index

LEGAL_SITES = "site:indiankanoon.org/doc"


def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]{4,}", (s or "").lower())}


def _best_paragraph(rec: dict[str, Any], hint: str) -> tuple[str, str]:
    paras = rec.get("paras") or []
    if not paras:
        return "1", rec.get("headnote") or rec.get("holding") or ""
    want = _tokens(hint)
    if not want:
        p = paras[min(1, len(paras) - 1)] if len(paras) > 1 else paras[0]
        return str(p.get("n", 1)), p.get("text", "")
    best = max(paras, key=lambda p: len(want & _tokens(p.get("text", ""))))
    return str(best.get("n", 1)), best.get("text", "")


def to_source(rec: dict[str, Any], hint: str = "") -> dict[str, Any]:
    para, text = _best_paragraph(rec, hint)
    return {
        "source_id": f"src_kanoon_{rec['doc_id']}",
        "kind": rec.get("kind", "judgment") if rec.get("kind") in ("judgment", "statute", "rule", "notification", "amendment") else "judgment",
        "title": rec.get("title", ""),
        "court": rec.get("court", ""),
        "date": rec.get("date", ""),
        "paragraph": para,
        "snippet": (text or rec.get("headnote", ""))[:600],
        "url": rec.get("url") or f"https://indiankanoon.org/doc/{rec['doc_id']}/",
    }


class PrecedentClient:
    def __init__(self) -> None:
        self.serper_calls = 0
        self.web_hits = 0

    # ---- web sweep ------------------------------------------------------
    @staticmethod
    def _cache_get(key: str) -> list[dict[str, Any]] | None:
        try:
            with db_session() as conn:
                row = conn.execute("SELECT payload_json, fetched_at FROM web_search_cache WHERE cache_key = ?", (key,)).fetchone()
            if not row:
                return None
            fetched = datetime.fromisoformat(row["fetched_at"])
            if datetime.now(timezone.utc) - fetched > timedelta(days=7):
                return None
            return json.loads(row["payload_json"])
        except Exception:
            return None

    @staticmethod
    def _cache_put(key: str, query: str, items: list[dict[str, Any]]) -> None:
        try:
            with db_session() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO web_search_cache (cache_key, query, payload_json, fetched_at) VALUES (?, ?, ?, ?)",
                    (key, query, json.dumps(items, ensure_ascii=False), datetime.now(timezone.utc).isoformat()),
                )
        except Exception:
            pass

    async def web_sweep(self, query: str, area: str = "", state: str = "", budget_s: float = 6.0, fetch_pages: int = 3) -> list[dict[str, Any]]:
        """Live Serper sweep restricted to judgment pages; new judgments are added to the index."""
        if not serper_key():
            return []
        hc = STATE_HC.get((state or "").lower(), ("", ""))[0]
        q = f"{LEGAL_SITES} {query} {hc}".strip()
        key = hashlib.sha256(q.encode("utf-8")).hexdigest()
        items = self._cache_get(key)
        if items is None:
            items = await serper_search(q, num=10)
            self.serper_calls += 1
            self._cache_put(key, q, items)
        recs: list[dict[str, Any]] = []
        for it in items:
            did = doc_id_from_url(it.get("link", ""))
            if not did:
                continue
            existing = corpus.get(did)
            if existing:
                recs.append(existing)
                continue
            rec = record_from_serper(it, area)
            if rec:
                recs.append(rec)
        fresh = [r for r in recs if not corpus.get(r["doc_id"])]

        async def _enrich(r: dict[str, Any]) -> None:
            full = await fetch_judgment(r["doc_id"], timeout=budget_s)
            if full:
                tags = r.get("practice_areas", [])
                r.update(full)
                r["practice_areas"] = tags

        if fresh:
            try:
                await asyncio.wait_for(asyncio.gather(*(_enrich(r) for r in fresh[:fetch_pages])), timeout=budget_s)
            except asyncio.TimeoutError:
                pass
            for r in fresh:
                r["source"] = "web_sweep"
                corpus.add(r)
        self.web_hits += len(recs)
        return recs

    # ---- pipeline contract ----------------------------------------------
    async def search(
        self,
        query: str,
        max_results: int = 20,
        budget_ms: int = 8000,
        area: str | None = None,
        state: str = "",
        district: str = "",
        seat: str = "",
        sweep: bool = True,
        **_: Any,
    ) -> dict[str, Any]:
        t0 = time.perf_counter()
        if query.startswith("citedby:"):
            return await self._cited_by(query.split(":", 1)[1], max_results, t0, budget_ms)
        hits = precedent_index.search(query, k=max_results, area=area, state=state, district=district, seat=seat)
        swept = 0
        weak = not hits or hits[0]["similarity_raw"] < 0.12 or len(hits) < min(5, max_results)
        if sweep and weak:
            try:
                recs = await asyncio.wait_for(self.web_sweep(query, area or "", state), timeout=budget_ms / 1000)
                swept = len(recs)
                if recs:
                    hits = precedent_index.search(query, k=max_results, area=area, state=state, district=district, seat=seat)
            except asyncio.TimeoutError:
                pass
        docs = [
            {
                "doc_id": h["doc_id"],
                "title": h.get("title", ""),
                "court": h.get("court", ""),
                "date": h.get("date", ""),
                "snippet": (h.get("headnote") or "")[:400],
                "score": h["score"],
                "similarity_raw": h["similarity_raw"],
                "locality_reason": h.get("locality_reason", ""),
                "outcome": h.get("outcome", "unknown"),
                "seat": h.get("seat", ""),
                "statutes": h.get("statutes", []),
                "origin": h.get("source", "index"),
            }
            for h in hits
        ]
        return {
            "docs": docs,
            "searched": precedent_index.size(),
            "total_matches": len(docs),
            "elapsed_ms": int((time.perf_counter() - t0) * 1000),
            "budget_ms": budget_ms,
            "cached": swept == 0,
            "web_swept": swept,
            "index_size": precedent_index.size(),
        }

    async def _cited_by(self, doc_id: str, max_results: int, t0: float, budget_ms: int) -> dict[str, Any]:
        """Later judgments that refer to `doc_id`: corpus records that cite its title."""
        cited = corpus.get(doc_id)
        if not cited:
            return {"docs": [], "searched": 0, "total_matches": 0, "elapsed_ms": 0, "budget_ms": budget_ms, "cached": True}
        lead = re.split(r"\s+(?:v\.?|vs\.?)\s+", cited.get("title", ""), maxsplit=1)[0].lower()[:30]
        docs = []
        for r in corpus.load_records():
            if r["doc_id"] == doc_id or not lead:
                continue
            body = " ".join(p.get("text", "") for p in r.get("paras", [])).lower()
            if lead in body:
                para, text = _best_paragraph(r, lead)
                docs.append({"doc_id": r["doc_id"], "title": r["title"], "court": r.get("court", ""), "date": r.get("date", ""), "snippet": text})
            if len(docs) >= max_results:
                break
        return {"docs": docs, "searched": len(docs), "total_matches": len(docs), "elapsed_ms": int((time.perf_counter() - t0) * 1000), "budget_ms": budget_ms, "cached": True}

    async def get_doc_source(self, doc_id: str, query_hint: str = "", fallback_meta: dict[str, Any] | None = None) -> dict[str, Any]:
        rec = corpus.get(str(doc_id))
        if rec is None:
            full = await fetch_judgment(str(doc_id), timeout=6.0)
            if full:
                corpus.add({**full, "source": "on_demand"})
                rec = full
        if rec is not None:
            return to_source(rec, query_hint)
        meta = fallback_meta or {}
        return {
            "source_id": f"src_kanoon_{doc_id}",
            "kind": meta.get("kind", "judgment"),
            "title": meta.get("title", f"Document {doc_id}"),
            "court": meta.get("court", ""),
            "date": meta.get("date", ""),
            "paragraph": "1",
            "snippet": meta.get("snippet", ""),
            "url": f"https://indiankanoon.org/doc/{doc_id}/",
        }

    @staticmethod
    def outcome_stats(records: list[dict[str, Any]]) -> dict[str, int]:
        stats = {"allowed": 0, "dismissed": 0, "partly_allowed": 0, "unknown": 0}
        for r in records:
            stats[r.get("outcome") if r.get("outcome") in stats else "unknown"] += 1
        return stats

    async def explore(
        self,
        query: str,
        area: str | None = None,
        state: str = "",
        district: str = "",
        court: str = "",
        outcome: str = "",
        limit: int = 20,
        sweep: bool = True,
    ) -> dict[str, Any]:
        """Matter-free precedent search for the Precedent Search screen, with optional filters."""
        t0 = time.perf_counter()
        k = max(limit * 3, 30)
        hits = precedent_index.search(query, k=k, area=area, state=state, district=district)
        swept = 0
        if sweep and (not hits or hits[0]["similarity_raw"] < 0.12):
            try:
                recs = await asyncio.wait_for(self.web_sweep(query, area or "", state), timeout=8.0)
                swept = len(recs)
                if recs:
                    hits = precedent_index.search(query, k=k, area=area, state=state, district=district)
            except asyncio.TimeoutError:
                pass
        if court:
            hits = [h for h in hits if court.lower() in (h.get("court") or "").lower()]
        if outcome:
            hits = [h for h in hits if h.get("outcome") == outcome]
        hits = hits[:limit]
        return {
            "results": [
                {
                    "doc_id": h["doc_id"], "title": h.get("title", ""), "court": h.get("court", ""), "seat": h.get("seat", ""),
                    "date": h.get("date", ""), "outcome": h.get("outcome", "unknown"), "statutes": h.get("statutes", []),
                    "headnote": (h.get("headnote") or "")[:700], "locality": h.get("locality_reason", ""), "score": h["score"],
                    "url": h.get("url", ""), "practice_areas": h.get("practice_areas", []), "origin": h.get("source", "index"),
                }
                for h in hits
            ],
            "index_size": precedent_index.size(),
            "web_swept": swept,
            "outcome_stats": self.outcome_stats(hits),
            "elapsed_ms": int((time.perf_counter() - t0) * 1000),
        }

    async def ping(self) -> str:
        n = precedent_index.size()
        return "ok" if n >= 50 else ("degraded" if n else "down")

    async def warm_landmark_cache(self) -> int:
        return precedent_index.size()

    def stats(self) -> dict[str, Any]:
        recs = corpus.load_records()
        return {
            "index_size": len(recs),
            "web_sweep_enabled": bool(serper_key()),
            "serper_calls_this_process": self.serper_calls,
            "courts": len({r.get("court") for r in recs if r.get("court")}),
            "areas_covered": len({a for r in recs for a in r.get("practice_areas", [])}),
        }


precedent_client = PrecedentClient()
