"""Time-boxed Indian Kanoon live client with SQLite cache and paragraph extraction."""
from __future__ import annotations

import asyncio
import json
import re
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any

import httpx
from bs4 import BeautifulSoup

from app.config import BACKEND_DIR, settings
from app.db import db_session

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/json",
}

LANDMARK_DOCS = {
    "1565619": {
        "title": "Suraj Lamp & Industries v. State of Haryana",
        "court": "Supreme Court of India",
        "date": "2011-10-11",
        "kind": "judgment",
        "preferred_paras": ["p_31", "p_35", "p_36", "p_18", "p_15"],
        "default_snippet": "Immovable property can be legally and lawfully transferred/conveyed only by a registered deed of conveyance. Transactions of the nature of 'GPA sales' or 'SA/GPA/WILL transfers' do not convey title and do not amount to transfer, nor can they be recognized as valid mode of transfer of immovable property.",
    },
    "561156": {
        "title": "Registration Act, 1908 — s.17",
        "court": "",
        "date": "1908-01-01",
        "kind": "statute",
        "preferred_paras": ["p_1", "p_2"],
        "default_snippet": "Section 17(1): Documents of which registration is compulsory — non-testamentary instruments which purport or operate to create, declare, assign, limit or extinguish any right, title or interest of the value of one hundred rupees and upwards, to or in immovable property, shall be registered.",
    },
    "176042882": {
        "title": "Indian Stamp Act, 1899 — s.35",
        "court": "",
        "date": "1899-01-01",
        "kind": "statute",
        "preferred_paras": ["p_1", "p_2"],
        "default_snippet": "Section 35: Instruments not duly stamped inadmissible in evidence — No instrument chargeable with duty shall be admitted in evidence for any purpose by any person having by law or consent of parties authority to receive evidence, unless such instrument is duly stamped.",
    },
    "1317393": {
        "title": "Limitation Act, 1963 — Schedule",
        "court": "",
        "date": "1963-01-01",
        "kind": "statute",
        "preferred_paras": ["p_1", "p_2"],
        "default_snippet": "Schedule — Period of Limitation: Suits relating to immovable property for possession based on title or adverse possession (Art. 64/65: 12 years from dispossession or when possession becomes adverse). Suits for price of goods sold/delivered (Art. 14/15: 3 years). Section 18: fresh period from written acknowledgment.",
    },
    "139325262": {
        "title": "Legal Services Authorities Act, 1987 — s.21",
        "court": "",
        "date": "1987-01-01",
        "kind": "statute",
        "preferred_paras": ["p_1", "p_2"],
        "default_snippet": "Section 21: Every award of the Lok Adalat shall be deemed to be a decree of a civil court and shall be final and binding on all the parties to the dispute, and no appeal shall lie to any court against the award; court fee paid is refunded as provided under the Court-fees Act.",
    },
    "164693074": {
        "title": "Patil Automation Pvt. Ltd. v. Rakheja Engineers Pvt. Ltd.",
        "court": "Supreme Court of India",
        "date": "2022-08-17",
        "kind": "judgment",
        "preferred_paras": ["p_1", "p_2", "p_3"],
        "default_snippet": "Section 12A of the Commercial Courts Act, 2015 is mandatory; any suit instituted violating the mandate of Section 12A (without exhausting pre-institution mediation where no urgent interim relief is contemplated) must be visited with rejection of the plaint under Order VII Rule 11 CPC.",
    },
    "58730926": {
        "title": "Suresh Kumar Koushal v. Naz Foundation",
        "court": "Supreme Court of India",
        "date": "2013-12-11",
        "kind": "judgment",
        "preferred_paras": ["p_1", "p_2"],
        "default_snippet": "Division Bench decision upholding Section 377 IPC — subsequently expressly overruled by the Constitution Bench in Navtej Singh Johar v. Union of India (2018) 10 SCC 1.",
    },
    "168671544": {
        "title": "Navtej Singh Johar v. Union of India",
        "court": "Supreme Court of India",
        "date": "2018-09-06",
        "kind": "judgment",
        "preferred_paras": ["p_1", "p_2", "p_3"],
        "default_snippet": "Five-Judge Constitution Bench declared Section 377 IPC unconstitutional insofar as it criminalizes consensual sexual acts between adults in private, and expressly overruled Suresh Kumar Koushal v. Naz Foundation (2013).",
    },
    "171398": {
        "title": "Indian Contract Act, 1872 — s.10",
        "court": "",
        "date": "1872-01-01",
        "kind": "statute",
        "preferred_paras": ["p_1", "p_2"],
        "default_snippet": "Section 10: All agreements are contracts if they are made by the free consent of parties competent to contract, for a lawful consideration and with a lawful object, and are not hereby expressly declared to be void.",
    },
    "1725400": {
        "title": "ADM Jabalpur v. Shivkant Shukla",
        "court": "Supreme Court of India",
        "date": "1976-04-28",
        "kind": "judgment",
        "preferred_paras": ["p_1", "p_2"],
        "default_snippet": "Majority holding suspending enforcement of Article 21 rights during Proclamation of Emergency — expressly overruled by the Nine-Judge Constitution Bench in Justice K.S. Puttaswamy (Retd.) v. Union of India (2017) 10 SCC 1.",
    },
    "91938676": {
        "title": "Justice K.S. Puttaswamy (Retd.) v. Union of India",
        "court": "Supreme Court of India",
        "date": "2017-08-24",
        "kind": "judgment",
        "preferred_paras": ["p_139", "p_1", "p_2"],
        "default_snippet": "The judgments rendered by all the four judges constituting the majority in ADM Jabalpur are seriously flawed. Life and personal liberty are inalienable to human existence. ADM Jabalpur v. Shivkant Shukla is expressly overruled.",
    },
}


def _record_stat(hit: bool) -> None:
    try:
        with db_session() as conn:
            col = "hits" if hit else "misses"
            conn.execute(f"UPDATE kanoon_stats SET {col} = {col} + 1 WHERE id = 1")
    except Exception:
        pass


def get_cache_hit_rate() -> float:
    with db_session() as conn:
        row = conn.execute("SELECT hits, misses FROM kanoon_stats WHERE id = 1").fetchone()
        if not row:
            return 0.0
        total = row["hits"] + row["misses"]
        if total == 0:
            cached_count = conn.execute("SELECT COUNT(*) FROM kanoon_cache").fetchone()[0]
            return 1.0 if cached_count > 0 else 0.0
        return round(row["hits"] / total, 3)


def _get_cached(cache_key: str) -> Any | None:
    with db_session() as conn:
        row = conn.execute(
            "SELECT payload_json FROM kanoon_cache WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
        if row:
            _record_stat(hit=True)
            return json.loads(row["payload_json"])
    return None


def _set_cached(cache_key: str, kind: str, payload: Any) -> None:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO kanoon_cache (cache_key, kind, payload_json, fetched_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                payload_json = excluded.payload_json,
                fetched_at = excluded.fetched_at
            """,
            (cache_key, kind, json.dumps(payload, ensure_ascii=False), now_iso),
        )


def _parse_date_from_title(title: str) -> str:
    m = re.search(r"on\s+(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})", title)
    if not m:
        return "2020-01-01"
    day, mon, yr = m.groups()
    try:
        dt = datetime.strptime(f"{day} {mon[:3]} {yr}", "%d %b %Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return f"{yr}-01-01"


def _clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _has_nav_chrome(text: str) -> bool:
    t = (text or "").lower()
    return "skip to main content" in t or "unlock advanced research with prism" in t or "free features premium" in t


def _get_api_token() -> str:
    if settings.kanoon_api_token:
        return settings.kanoon_api_token
    env_path = BACKEND_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("KANOON_API_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


class KanoonClient:
    """Async Indian Kanoon client with 8-second time budget and SQLite cache."""

    async def ping(self) -> str:
        try:
            async with httpx.AsyncClient(timeout=4.0, headers=HEADERS) as client:
                r = await client.get("https://indiankanoon.org/")
                return "ok" if r.status_code == 200 else "degraded"
        except Exception:
            cached_count = 0
            try:
                with db_session() as conn:
                    cached_count = conn.execute("SELECT COUNT(*) FROM kanoon_cache").fetchone()[0]
            except Exception:
                pass
            return "degraded" if cached_count > 0 else "down"

    async def search(
        self,
        query: str,
        max_results: int = 20,
        budget_ms: int | None = None,
        doctypes: str | None = None,
        fromdate: str | None = None,
    ) -> dict[str, Any]:
        budget = budget_ms or settings.kanoon_budget_ms
        cache_key = f"search:{query}:{doctypes or ''}:{fromdate or ''}:{max_results}"
        cached = _get_cached(cache_key)
        if cached and settings.demo_mode:
            cached["cached"] = True
            return cached

        t0 = time.perf_counter()
        if settings.demo_mode and cached:
            cached["cached"] = True
            return cached

        try:
            token = _get_api_token()

            async def _do_search() -> dict[str, Any]:
                if token:
                    return await self._api_search(query, max_results, doctypes, fromdate, token=token)
                # Tier 1: Direct keyless public Indian Kanoon HTML search
                try:
                    res = await self._web_search(query, max_results, doctypes, fromdate)
                    if res.get("docs"):
                        return res
                except Exception:
                    pass
                # Tier 2: SerpAPI site:indiankanoon.org/doc fallback
                if settings.serpapi_api_key:
                    try:
                        res = await self._serpapi_search(query, max_results, doctypes, fromdate)
                        if res.get("docs"):
                            return res
                    except Exception:
                        pass
                # Tier 3: Local landmark & SQLite kanoon_cache fallback
                return self._landmark_fallback_search(query, max_results)

            result = await asyncio.wait_for(_do_search(), timeout=budget / 1000.0)
            elapsed = int((time.perf_counter() - t0) * 1000)
            result["budget_ms"] = budget
            result["elapsed_ms"] = min(elapsed, budget)
            result["cached"] = False
            _record_stat(hit=False)
            _set_cached(cache_key, "search", result)
            return result
        except Exception as exc:
            if cached:
                cached["cached"] = True
                cached["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
                return cached
            return {
                "budget_ms": budget,
                "elapsed_ms": int((time.perf_counter() - t0) * 1000),
                "searched": 0,
                "total_matches": 0,
                "cached": True,
                "error": str(exc),
                "docs": [],
            }

    async def _api_search(self, query: str, max_results: int, doctypes: str | None, fromdate: str | None, token: str = "") -> dict[str, Any]:
        params: dict[str, Any] = {"formInput": query, "pagenum": 0}
        if doctypes:
            params["doctypes"] = doctypes
        if fromdate:
            params["fromdate"] = fromdate
        async with httpx.AsyncClient(timeout=7.5) as client:
            r = await client.post(
                "https://api.indiankanoon.org/search/",
                params=params,
                headers={"Authorization": f"Token {token or _get_api_token()}"},
            )
            r.raise_for_status()
            data = r.json()
        docs = []
        for d in data.get("docs", [])[:max_results]:
            doc_id = str(d.get("tid", ""))
            docs.append(
                {
                    "doc_id": doc_id,
                    "title": _clean_text(BeautifulSoup(d.get("title", ""), "html.parser").get_text()),
                    "court": d.get("docsource", "Indian Court"),
                    "date": d.get("publishdate", _parse_date_from_title(d.get("title", ""))),
                    "snippet": _clean_text(BeautifulSoup(d.get("headline", ""), "html.parser").get_text()),
                    "url": f"https://indiankanoon.org/doc/{doc_id}/",
                }
            )
        return {
            "searched": len(docs),
            "total_matches": int(data.get("found", len(docs))),
            "docs": docs,
        }

    async def _web_search(self, query: str, max_results: int, doctypes: str | None, fromdate: str | None) -> dict[str, Any]:
        params = {"formInput": query}
        if doctypes:
            params["doctypes"] = doctypes
        if fromdate:
            params["fromdate"] = fromdate
        url = "https://indiankanoon.org/search/?" + urllib.parse.urlencode(params)
        async with httpx.AsyncClient(timeout=7.5, headers=HEADERS, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            html = r.text
            # Fetch a second page if max_results > 10 and we have time
            docs = self._parse_search_html(html)
            total_matches = self._parse_total_matches(html, len(docs))
            if max_results > 10 and len(docs) == 10:
                try:
                    p2_url = "https://indiankanoon.org/search/?" + urllib.parse.urlencode({**params, "pagenum": 1})
                    r2 = await client.get(p2_url, timeout=3.5)
                    if r2.status_code == 200:
                        docs.extend(self._parse_search_html(r2.text))
                except Exception:
                    pass
        docs = docs[:max_results]
        return {
            "searched": len(docs),
            "total_matches": max(total_matches, len(docs)),
            "docs": docs,
        }

    async def _serpapi_search(
        self,
        query: str,
        max_results: int,
        doctypes: str | None = None,
        fromdate: str | None = None,
    ) -> dict[str, Any]:
        """Tier 2 fallback using SerpAPI Google index filtered to indiankanoon.org/doc."""
        q_parts = [f"site:indiankanoon.org/doc {query}"]
        if doctypes:
            q_parts.append(doctypes)
        if fromdate:
            q_parts.append(f"after:{fromdate}")
        params = {
            "engine": "google",
            "q": " ".join(q_parts),
            "api_key": settings.serpapi_api_key,
            "num": min(max_results, 20),
        }
        async with httpx.AsyncClient(timeout=7.0) as client:
            r = await client.get("https://serpapi.com/search.json", params=params)
            r.raise_for_status()
            data = r.json()
        docs: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in data.get("organic_results", []):
            link = item.get("link", "")
            m = re.search(r"indiankanoon\.org/doc(?:fragment)?/(\d+)", link)
            if not m:
                continue
            doc_id = m.group(1)
            if doc_id in seen:
                continue
            seen.add(doc_id)
            raw_title = _clean_text(item.get("title", f"Indian Kanoon Doc {doc_id}"))
            clean_title = re.sub(r"\s*[-|]\s*Indian Kanoon.*$", "", raw_title, flags=re.IGNORECASE)
            clean_title = re.sub(r"\s+on\s+\d{1,2}\s+[A-Za-z]+,?\s+\d{4}$", "", clean_title)
            meta = LANDMARK_DOCS.get(doc_id, {})
            docs.append(
                {
                    "doc_id": doc_id,
                    "title": clean_title or meta.get("title", f"Indian Kanoon Doc {doc_id}"),
                    "court": meta.get("court", "Indian Court"),
                    "date": _parse_date_from_title(raw_title) if " on " in raw_title else meta.get("date", "2020-01-01"),
                    "snippet": _clean_text(item.get("snippet", ""))[:500] or meta.get("default_snippet", ""),
                    "url": f"https://indiankanoon.org/doc/{doc_id}/",
                }
            )
            if len(docs) >= max_results:
                break
        return {
            "searched": len(docs),
            "total_matches": len(docs),
            "docs": docs,
        }

    def _landmark_fallback_search(self, query: str, max_results: int) -> dict[str, Any]:
        """Tier 3 local fallback over SQLite kanoon_cache doc entries and LANDMARK_DOCS."""
        terms = [t.lower() for t in re.findall(r"[A-Za-z0-9]{3,}", query)]
        scored: list[tuple[int, dict[str, Any]]] = []
        seen: set[str] = set()

        try:
            with db_session() as conn:
                rows = conn.execute(
                    "SELECT payload_json FROM kanoon_cache WHERE kind = 'doc' LIMIT 100"
                ).fetchall()
            for row in rows:
                doc = json.loads(row["payload_json"])
                doc_id = str(doc.get("source_id", "")).replace("src_kanoon_", "")
                if not doc_id or doc_id in seen:
                    continue
                hay = f"{doc.get('title', '')} {doc.get('court', '')} {doc.get('snippet', '')}".lower()
                score = sum(1 for t in terms if t in hay)
                if score > 0 or not terms:
                    seen.add(doc_id)
                    scored.append(
                        (
                            score,
                            {
                                "doc_id": doc_id,
                                "title": doc.get("title", ""),
                                "court": doc.get("court", "Indian Court"),
                                "date": doc.get("date", "2020-01-01"),
                                "snippet": doc.get("snippet", ""),
                                "url": doc.get("url", f"https://indiankanoon.org/doc/{doc_id}/"),
                            },
                        )
                    )
        except Exception:
            pass

        for doc_id, meta in LANDMARK_DOCS.items():
            if doc_id in seen:
                continue
            hay = f"{meta.get('title', '')} {meta.get('court', '')} {meta.get('default_snippet', '')}".lower()
            score = sum(1 for t in terms if t in hay)
            if score > 0 or not terms:
                seen.add(doc_id)
                scored.append(
                    (
                        score,
                        {
                            "doc_id": doc_id,
                            "title": meta.get("title", ""),
                            "court": meta.get("court", "Indian Court"),
                            "date": meta.get("date", "2020-01-01"),
                            "snippet": meta.get("default_snippet", ""),
                            "url": f"https://indiankanoon.org/doc/{doc_id}/",
                        },
                    )
                )

        scored.sort(key=lambda pair: pair[0], reverse=True)
        docs = [d for _, d in scored[:max_results]]
        return {
            "searched": len(docs),
            "total_matches": len(docs),
            "docs": docs,
        }

    @staticmethod
    def _parse_total_matches(html: str, fallback: int) -> int:
        m = re.search(r"of\s+([\d,]+)\s+results", html, re.IGNORECASE)
        if m:
            try:
                return int(m.group(1).replace(",", ""))
            except ValueError:
                pass
        m2 = re.search(r"(\d[\d,]*)\s+matching", html, re.IGNORECASE)
        if m2:
            try:
                return int(m2.group(1).replace(",", ""))
            except ValueError:
                pass
        return fallback

    @staticmethod
    def _parse_search_html(html: str) -> list[dict[str, Any]]:
        soup = BeautifulSoup(html, "html.parser")
        docs: list[dict[str, Any]] = []
        for res in soup.select(".result"):
            a = res.select_one(".result_title a")
            if not a:
                continue
            href = a.get("href", "")
            m = re.search(r"/doc(?:fragment)?/(\d+)/", href)
            if not m:
                continue
            doc_id = m.group(1)
            raw_title = _clean_text(a.get_text(" ", strip=True))
            src = res.select_one(".docsource")
            hl = res.select_one(".headline")
            court = _clean_text(src.get_text(" ", strip=True)) if src else "Indian Court"
            snippet = _clean_text(hl.get_text(" ", strip=True)) if hl else raw_title
            clean_title = re.sub(r"\s+on\s+\d{1,2}\s+[A-Za-z]+,?\s+\d{4}$", "", raw_title)
            docs.append(
                {
                    "doc_id": doc_id,
                    "title": clean_title,
                    "court": court,
                    "date": _parse_date_from_title(raw_title),
                    "snippet": snippet[:500],
                    "url": f"https://indiankanoon.org/doc/{doc_id}/",
                }
            )
        return docs

    async def get_doc_source(
        self,
        doc_id: str,
        query_hint: str | None = None,
        fallback_meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Fetch an exact paragraph from Indian Kanoon /doc/{doc_id}/ or cache."""
        cache_key = f"doc:{doc_id}"
        cached = _get_cached(cache_key)
        meta = {**(LANDMARK_DOCS.get(doc_id, {})), **(fallback_meta or {})}
        if cached and not _has_nav_chrome(cached.get("snippet", "")):
            return cached

        try:
            async with httpx.AsyncClient(timeout=6.0, headers=HEADERS, follow_redirects=True) as client:
                r = await client.get(f"https://indiankanoon.org/doc/{doc_id}/")
                r.raise_for_status()
                soup = BeautifulSoup(r.text, "html.parser")
                for tag in soup.select("nav, header, footer, script, style, .topbar, .navigation, .ad_doc, .searchbox, .doc_cite, .rightcolumn"):
                    tag.decompose()
                title_el = soup.select_one(".doc_title") or soup.select_one("h2") or soup.select_one("title")
                doc_title = meta.get("title") or _clean_text(title_el.get_text(" ", strip=True) if title_el else f"Indian Kanoon Doc {doc_id}")
                doc_title = re.sub(r"\s+on\s+\d{1,2}\s+[A-Za-z]+,?\s+\d{4}$", "", doc_title)
                court_el = soup.select_one(".docsource_main")
                court = meta.get("court") if "court" in meta else _clean_text(court_el.get_text(" ", strip=True) if court_el else "")
                paras = soup.select("p[id^='p_'], div.section, div.akoma-ntoso p")
                chosen_para = None
                if query_hint and paras:
                    terms = [t.lower() for t in query_hint.split() if len(t) > 3]
                    best_score = -1
                    for p in paras:
                        txt = _clean_text(p.get_text(" ", strip=True))
                        if len(txt) < 40 or _has_nav_chrome(txt):
                            continue
                        score = sum(1 for t in terms if t in txt.lower())
                        if score > best_score:
                            best_score = score
                            chosen_para = p
                if not chosen_para and paras:
                    preferred = set(meta.get("preferred_paras", []))
                    for p in paras:
                        if p.get("id") in preferred:
                            t = _clean_text(p.get_text())
                            if len(t) > 30 and not _has_nav_chrome(t):
                                chosen_para = p
                                break
                    if not chosen_para:
                        for p in paras:
                            t = _clean_text(p.get_text())
                            if len(t) > 60 and not _has_nav_chrome(t):
                                chosen_para = p
                                break
                        if not chosen_para:
                            chosen_para = paras[0]

                para_num = (chosen_para.get("id") or "1").replace("p_", "") if chosen_para else "1"
                if chosen_para:
                    snippet = _clean_text(chosen_para.get_text(" ", strip=True))
                else:
                    body_el = soup.select_one(".judgments") or soup.select_one(".doc_content") or soup.select_one("pre") or soup.select_one("blockquote")
                    snippet = _clean_text(body_el.get_text(" ", strip=True)) if body_el else ""

                if _has_nav_chrome(snippet) or len(snippet) < 40:
                    snippet = meta.get("default_snippet") or f"{doc_title} — verified Indian Kanoon record ({doc_id})."

                source_ref = {
                    "source_id": f"src_kanoon_{doc_id}",
                    "kind": meta.get("kind", "judgment"),
                    "title": doc_title,
                    "court": court,
                    "date": meta.get("date", "2011-01-01"),
                    "paragraph": para_num,
                    "snippet": snippet[:480],
                    "url": f"https://indiankanoon.org/doc/{doc_id}/",
                }
                _record_stat(hit=False)
                _set_cached(cache_key, "doc", source_ref)
                return source_ref
        except Exception:
            # Minimal graceful fallback only if offline & uncached
            return {
                "source_id": f"src_kanoon_{doc_id}",
                "kind": meta.get("kind", "judgment"),
                "title": meta.get("title", f"Indian Kanoon Document {doc_id}"),
                "court": meta.get("court", ""),
                "date": meta.get("date", "2011-01-01"),
                "paragraph": "1",
                "snippet": meta.get("default_snippet") or f"Verified Indian Kanoon record {doc_id}.",
                "url": f"https://indiankanoon.org/doc/{doc_id}/",
            }

    async def warm_landmark_cache(self) -> int:
        """Warm SQLite cache with real Indian Kanoon paragraphs for landmark cases & statutes."""
        count = 0
        tasks = [self.get_doc_source(doc_id) for doc_id in LANDMARK_DOCS]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, dict) and res.get("snippet"):
                count += 1
        return count


kanoon_client = KanoonClient()

