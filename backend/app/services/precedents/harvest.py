"""Judgment harvester: Serper web search + public judgment-page parsing into corpus records.

Used offline by scripts/build_precedent_corpus.py and live by the web sweep (new hits are
added to the local index so it grows with use). No Indian Kanoon API token is involved:
pages are the public judgment HTML that any browser can open.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import httpx
from bs4 import BeautifulSoup

from app import config

SERPER_URL = "https://google.serper.dev/search"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
DOC_RE = re.compile(r"indiankanoon\.org/(?:doc|docfragment)/(\d+)")

_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}

COURT_STATE = {
    "supreme court": ("Supreme Court of India", "India"),
    "bombay high court": ("Bombay High Court", "Maharashtra"),
    "karnataka high court": ("Karnataka High Court", "Karnataka"),
    "delhi high court": ("Delhi High Court", "Delhi"),
    "madras high court": ("Madras High Court", "Tamil Nadu"),
    "kerala high court": ("Kerala High Court", "Kerala"),
    "calcutta high court": ("Calcutta High Court", "West Bengal"),
    "gujarat high court": ("Gujarat High Court", "Gujarat"),
    "allahabad high court": ("Allahabad High Court", "Uttar Pradesh"),
    "punjab-haryana high court": ("Punjab & Haryana High Court", "Punjab"),
    "punjab & haryana": ("Punjab & Haryana High Court", "Punjab"),
    "rajasthan high court": ("Rajasthan High Court", "Rajasthan"),
    "telangana high court": ("Telangana High Court", "Telangana"),
    "andhra pradesh high court": ("Andhra Pradesh High Court", "Andhra Pradesh"),
    "madhya pradesh high court": ("Madhya Pradesh High Court", "Madhya Pradesh"),
    "national consumer disputes": ("NCDRC", "India"),
    "state consumer disputes": ("State Consumer Commission", ""),
    "district consumer": ("District Consumer Commission", ""),
}

_STATUTE_PATTERNS = [
    (re.compile(r"\bsection\s+138\b[^.]{0,40}negotiable|\bs\.?\s?138\s+(?:of\s+the\s+)?(?:n\.?i\.?|negotiable)", re.I), "NI Act s.138"),
    (re.compile(r"\bsection\s+12a\b|\bs\.?\s?12-?a\b[^.]{0,30}commercial", re.I), "Commercial Courts Act s.12A"),
    (re.compile(r"\bsection\s+17\b[^.]{0,30}registration act", re.I), "Registration Act s.17"),
    (re.compile(r"\border\s+vii\s+rule\s+11\b", re.I), "CPC O.VII R.11"),
    (re.compile(r"\bsection\s+125\b[^.]{0,30}(?:cr\.?p\.?c|code of criminal)", re.I), "CrPC s.125"),
    (re.compile(r"\bsection\s+166\b[^.]{0,30}motor vehicles", re.I), "MV Act s.166"),
    (re.compile(r"\bsection\s+25-?f\b", re.I), "ID Act s.25F"),
    (re.compile(r"\bsection\s+13-?b\b", re.I), "HMA s.13B"),
    (re.compile(r"\barticle\s+226\b", re.I), "Constitution Art. 226"),
    (re.compile(r"\bsection\s+11\b[^.]{0,40}arbitration", re.I), "Arbitration Act s.11"),
    (re.compile(r"\bsection\s+34\b[^.]{0,40}arbitration", re.I), "Arbitration Act s.34"),
    (re.compile(r"\bsection\s+29\b[^.]{0,40}trade marks", re.I), "Trade Marks Act s.29"),
    (re.compile(r"\bsection\s+63\b[^.]{0,40}succession", re.I), "Succession Act s.63"),
    (re.compile(r"\bconsumer protection act\b", re.I), "Consumer Protection Act"),
    (re.compile(r"\bsection\s+(?:438|439)\b[^.]{0,20}(?:cr\.?p\.?c|code)", re.I), "CrPC s.438/439"),
    (re.compile(r"\bsection\s+(?:480|482|483)\b[^.]{0,20}bnss", re.I), "BNSS bail"),
    (re.compile(r"\blimitation act\b", re.I), "Limitation Act"),
]

_ALLOWED = re.compile(r"\b(appeal|petition|application|suit|complaint|revision|writ)\s+(?:is|stands|are)\s+(?:hereby\s+)?(allowed|partly allowed|partially allowed|decreed)\b", re.I)
_DISMISSED = re.compile(r"\b(appeal|petition|application|suit|complaint|revision|writ)\s+(?:is|stands|are)\s+(?:hereby\s+)?(dismissed|rejected|disposed of as withdrawn)\b", re.I)


def serper_key() -> str:
    return config.settings.serper_api_key


async def serper_search(query: str, num: int = 10, timeout: float = 12.0) -> list[dict[str, Any]]:
    """Google results via Serper (structured JSON). Returns organic items or [] on any failure."""
    key = serper_key()
    if not key:
        return []
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(SERPER_URL, headers={"X-API-KEY": key, "Content-Type": "application/json"},
                                  json={"q": query, "gl": "in", "hl": "en", "num": num})
        if r.status_code != 200:
            return []
        return list(r.json().get("organic", []))
    except Exception:
        return []


def doc_id_from_url(url: str) -> str | None:
    m = DOC_RE.search(url or "")
    return m.group(1) if m else None


def parse_date(text: str) -> str:
    m = re.search(r"on\s+(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})", text or "")
    if m and m.group(2).lower() in _MONTHS:
        try:
            return datetime(int(m.group(3)), _MONTHS[m.group(2).lower()], int(m.group(1))).date().isoformat()
        except ValueError:
            pass
    m = re.search(r"([A-Z][a-z]{2}) (\d{1,2}), (\d{4})", text or "")
    if m:
        try:
            return datetime.strptime(m.group(0), "%b %d, %Y").date().isoformat()
        except ValueError:
            pass
    return ""


def normalise_court(raw: str, body: str = "") -> tuple[str, str, str]:
    """(court, state, seat) from the page's court label and body text."""
    low = (raw or "").lower()
    court, state = (raw.strip() or "Unknown court"), ""
    for key, (name, st) in COURT_STATE.items():
        if key in low:
            court, state = name, st
            break
    seat = ""
    head = (body or "")[:4000].lower()
    if court == "Bombay High Court":
        if "goa" in head or "panaji" in head or "panjim" in head:
            seat, state = "Goa", "Goa"
        elif "aurangabad" in head:
            seat = "Aurangabad"
        elif "nagpur" in head:
            seat = "Nagpur"
        else:
            seat = "Mumbai"
    elif court == "Karnataka High Court":
        seat = "Dharwad" if "dharwad" in head else ("Kalaburagi" if "kalaburagi" in head or "gulbarga" in head else "Bengaluru")
    return court, state, seat


_POS = re.compile(
    r"\b(?:(?:appeal|petition|application|suit|complaint|revision|writ petition|claim|reference)s?\s+(?:is|are|stands?|was|were|is accordingly|are accordingly|is hereby)\s+(?:hereby\s+)?(?:allowed|decreed|accepted|granted|succeeds?)"
    r"|rule\s+(?:is\s+)?made\s+absolute|(?:bail|anticipatory bail)\s+(?:is\s+)?granted|accused\s+(?:is|are)\s+(?:hereby\s+)?acquitted|impugned (?:order|judgment|award) (?:is|stands) (?:hereby )?(?:quashed|set aside)"
    r"|(?:we|i) (?:allow|accept) (?:the|this) (?:appeal|petition|application))\b",
    re.I,
)
_NEG = re.compile(
    r"\b(?:(?:appeal|petition|application|suit|complaint|revision|writ petition|claim)s?\s+(?:is|are|stands?|was|were|is accordingly|are accordingly|is hereby)\s+(?:hereby\s+)?(?:dismissed|rejected|disposed of as withdrawn|fails?)"
    r"|rule\s+(?:is\s+)?discharged|(?:bail|anticipatory bail)\s+(?:application\s+)?(?:is\s+)?(?:rejected|refused|declined)|accused\s+(?:is|are)\s+(?:hereby\s+)?convicted|no merit in (?:the|this) (?:appeal|petition)"
    r"|(?:we|i) (?:dismiss|reject) (?:the|this) (?:appeal|petition|application))\b",
    re.I,
)


def infer_outcome(paragraphs: list[str]) -> str:
    tail = " ".join(paragraphs[-10:])
    if re.search(r"partly allowed|partially allowed|allowed in part|partly decreed|modified to the extent", tail, re.I):
        return "partly_allowed"
    pos = [m.start() for m in _POS.finditer(tail)]
    neg = [m.start() for m in _NEG.finditer(tail)]
    if pos and neg:
        return "allowed" if max(pos) > max(neg) else "dismissed"
    if pos:
        return "allowed"
    if neg:
        return "dismissed"
    return "unknown"


def statutes_in(text: str) -> list[str]:
    return sorted({label for rx, label in _STATUTE_PATTERNS if rx.search(text or "")})


_BOILER = re.compile(
    r"\b(s/o|d/o|w/o|r/o|r/at|aged about|digitally signed|signature not verified|location:|reserved on|pronounced on|uploaded on|"
    r"for the (?:appellant|petitioner|respondent|complainant|applicant)s?\s*:|advocate for|learned counsel|coram|hon'?ble mr|hon'?ble ms|"
    r"whether approved for reporting|versus\s*$|\.\.\.\s*(?:petitioner|respondent|appellant)s?|occ:|tq\.|dist\.)\b",
    re.I,
)


def is_boilerplate(text: str) -> bool:
    """Cause-title / appearance / signature lines that carry no legal content."""
    t = text or ""
    hits = len(_BOILER.findall(t))
    upper_ratio = sum(1 for c in t if c.isupper()) / max(1, sum(1 for c in t if c.isalpha()))
    dot_leaders = t.count("....") >= 2 or bool(re.search(r"\bINDEX\b|table of contents|for the convenience of exposition", t))
    return dot_leaders or hits >= 2 or (hits >= 1 and len(t) < 260) or upper_ratio > 0.6


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


async def fetch_judgment(doc_id: str, timeout: float = 15.0) -> dict[str, Any] | None:
    """Fetch and parse one public judgment page into a corpus record (None on failure)."""
    url = f"https://indiankanoon.org/doc/{doc_id}/"
    try:
        async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": UA}, follow_redirects=True) as client:
            r = await client.get(url)
        if r.status_code != 200 or len(r.text) < 2000:
            return None
    except Exception:
        return None
    soup = BeautifulSoup(r.text, "html.parser")
    title_el = soup.select_one("h2.doc_title") or soup.find("title")
    title = _clean(title_el.get_text(" ")) if title_el else f"Judgment {doc_id}"
    title = re.sub(r"\s*-\s*Indian Kanoon\s*$", "", title)
    src_el = soup.select_one("h2.docsource_main") or soup.select_one(".docsource_main")
    court_raw = _clean(src_el.get_text(" ")) if src_el else ""
    judgment = soup.select_one("div.judgments") or soup
    full_text = _clean(judgment.get_text(" "))
    paras: list[str] = []
    for el in judgment.find_all(["p", "blockquote", "pre"]):
        if el.name == "pre":
            paras.extend(x for x in (_clean(b) for b in re.split(r"\n\s*\n", el.get_text("\n"))) if len(x) > 60)
        else:
            t = _clean(el.get_text(" "))
            if len(t) > 60:
                paras.append(t)
    all_paras = paras
    paras = paras[:400]
    court, state, seat = normalise_court(court_raw, full_text)
    bench_el = soup.select_one("h3.doc_bench") or soup.select_one(".doc_bench")
    # Headnote: first substantive paragraphs (skip cause title / coram / counsel lines), capped for the index.
    skip = re.compile(r"^(coram|present|reserved|pronounced|date of|dated|mr\.|ms\.|in the (high|supreme) court|versus)", re.I)
    body_paras = [p for p in paras if not skip.match(p) and not p.isupper()]
    headnote = " ".join(body_paras[:3])[:900]
    holding = " ".join(body_paras[-3:])[:700] if len(body_paras) > 3 else ""
    # Paragraph store for pinpoint retrieval: opening, reasoning-dense, and operative paragraphs.
    reasoning = re.compile(r"\b(held|we are of the (?:view|opinion)|in our view|section \d+|article \d+|it is (?:well )?settled|therefore|accordingly|principle)\b", re.I)
    picked: list[tuple[int, str]] = []
    for i, ptxt in enumerate(body_paras):
        if i < 3 or i >= len(body_paras) - 3 or (reasoning.search(ptxt) and len(picked) < 14):
            picked.append((i + 1, ptxt[:600]))
    key_paras = [{"n": n, "text": t} for n, t in picked[:20]]
    return {
        "doc_id": str(doc_id),
        "title": title,
        "court": court,
        "state": state,
        "seat": seat,
        "bench": _clean(bench_el.get_text(" ")).replace("Bench:", "").strip() if bench_el else "",
        "date": parse_date(title),
        "headnote": headnote,
        "holding": holding,
        "statutes": statutes_in(full_text[:80000]),
        "outcome": infer_outcome(all_paras),
        "url": url,
        "verified": True,
        "paragraph_count": len(paras),
        "paras": key_paras,
    }


def record_from_serper(item: dict[str, Any], area: str = "") -> dict[str, Any] | None:
    """Lightweight record from a search hit alone (used when the page fetch fails)."""
    doc_id = doc_id_from_url(item.get("link", ""))
    if not doc_id:
        return None
    title = _clean(item.get("title", ""))
    snippet = _clean(item.get("snippet", ""))
    court, state, seat = normalise_court(title + " " + snippet, snippet)
    return {
        "doc_id": doc_id,
        "title": title,
        "court": court if court != (title + " " + snippet).strip() else "",
        "state": state,
        "seat": seat,
        "bench": "",
        "date": parse_date(title) or parse_date(item.get("date", "")),
        "headnote": snippet,
        "holding": "",
        "statutes": statutes_in(snippet),
        "outcome": "unknown",
        "url": f"https://indiankanoon.org/doc/{doc_id}/",
        "verified": True,
        "practice_areas": [area] if area else [],
        "paragraph_count": 0,
    }
