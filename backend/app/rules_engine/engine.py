"""Deterministic YAML rule engine for Proof Ledger, Statute Clock, Settle-or-Fight, and Law Change Radar."""
from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from app.config import RULES_DIR
from app.config import today as app_today
from app import registry
from app.services.precedents.service import precedent_client


def _load_yaml(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


async def _resolve_sources(raw_sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for s in raw_sources or []:
        doc_id = str(s.get("doc_id", "")).strip()
        if doc_id:
            src = await precedent_client.get_doc_source(
                doc_id,
                fallback_meta={
                    "kind": s.get("kind", "statute"),
                    "title": s.get("title", ""),
                    "court": s.get("court", ""),
                    "date": s.get("date", ""),
                },
            )
            resolved.append(src)
        else:
            resolved.append(
                {
                    "source_id": s.get("source_id", "src_rule"),
                    "kind": s.get("kind", "statute"),
                    "title": s.get("title", ""),
                    "court": s.get("court", ""),
                    "date": s.get("date", ""),
                    "paragraph": s.get("paragraph", "—"),
                    "snippet": s.get("snippet", ""),
                    "url": s.get("url", ""),
                }
            )
    return resolved


_NEG_BEFORE = re.compile(r"\b(no|not|without|never|neither|nor|nil|absence of|lack of|lacks|lacking|missing|cannot|none)\b[^.;\n]{0,40}$")
_NEG_AFTER = re.compile(r"^[^.;\n]{0,30}\b(does not exist|do not exist|not exist|is missing|are missing|not available|not produced|not on file|absent|unavailable|not found|was not|were not|is not|are not)\b")


def _evidence_hit(corpus: str, keyword: str) -> bool:
    """True if `keyword` occurs in a non-negated clause ("no written contract exists" does NOT establish a written contract)."""
    start = 0
    while True:
        i = corpus.find(keyword, start)
        if i < 0:
            return False
        before = corpus[max(0, i - 60):i]
        after = corpus[i + len(keyword): i + len(keyword) + 40]
        if not _NEG_BEFORE.search(before) and not _NEG_AFTER.search(after):
            return True
        start = i + len(keyword)


async def evaluate_proof_ledger(
    case_type: str,
    facts: list[dict[str, Any]],
    documents_text: str,
) -> dict[str, Any]:
    pack_path = RULES_DIR / "proof_ledger" / f"{case_type}.yaml"
    if not pack_path.exists():
        pack_path = RULES_DIR / "proof_ledger" / "property.yaml"
    pack = _load_yaml(pack_path)

    corpus = (
        " ".join(f.get("statement", "") for f in facts) + "\n" + (documents_text or "")
    ).lower()

    items: list[dict[str, Any]] = []
    for rule in pack.get("rules", []):
        detect = rule.get("detect", {})
        present_any = [k.lower() for k in detect.get("present_any", [])]
        weak_any = [k.lower() for k in detect.get("weak_any", [])]
        negative_any = [k.lower() for k in detect.get("negative_any", [])]

        has_negative = any(k in corpus for k in negative_any)  # explicit "missing" phrases are matched as written
        has_weak = any(_evidence_hit(corpus, k) for k in weak_any)
        has_present = any(_evidence_hit(corpus, k) for k in present_any)

        if has_negative:
            state = "missing"
        elif has_weak and not has_present:
            state = "weak"
        elif has_present:
            state = "present"
        else:
            state = "missing"

        sources = await _resolve_sources(rule.get("sources", []))
        items.append(
            {
                "requirement": rule["requirement"],
                "state": state,
                "severity": rule["severity"],
                "why": rule["why"],
                "sources": sources,
            }
        )
    return {"case_type": case_type, "items": items}


def calculate_limitation_with_covid(
    cause_date: date,
    limitation_years: int,
    covid_from: date = date(2020, 3, 15),
    covid_to: date = date(2022, 2, 28),
    reference_today: date | None = None,
) -> tuple[date, int, list[dict[str, str]]]:
    """Deterministic limitation calculator honouring the Supreme Court's COVID exclusion.

    Only the days of the limitation window that actually fall inside the exclusion are added
    back, and the excluded period reported is that overlap (not the whole COVID window).
    """
    today = reference_today or app_today()
    try:
        nominal_expiry = cause_date.replace(year=cause_date.year + limitation_years)
    except ValueError:  # 29 February
        nominal_expiry = cause_date.replace(year=cause_date.year + limitation_years, day=28)

    excluded: list[dict[str, str]] = []
    final_expiry = nominal_expiry
    if cause_date <= covid_to and nominal_expiry >= covid_from:
        overlap_start = max(cause_date, covid_from)
        overlap_end = min(nominal_expiry, covid_to)
        if overlap_end >= overlap_start:
            excluded_days = (overlap_end - overlap_start).days + 1
            final_expiry = nominal_expiry + timedelta(days=excluded_days)
            excluded.append(
                {
                    "from": overlap_start.isoformat(),
                    "to": overlap_end.isoformat(),
                    "days": str(excluded_days),
                    "reason": "Supreme Court suo motu COVID limitation exclusion (15.03.2020 to 28.02.2022)",
                }
            )
    return final_expiry, (final_expiry - today).days, excluded


_MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
_DATE_PATTERNS = [
    (re.compile(r"\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b"), lambda m: (int(m[1]), int(m[2]), int(m[3]))),
    (re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3,9}),?[ -](20\d{2}|19\d{2})\b"), lambda m: (int(m[3]), _MONTHS.get(m[2].lower()) or next((v for k, v in _MONTHS.items() if k.startswith(m[2].lower()[:3]) and len(m[2]) >= 3), 0), int(m[1]))),
    (re.compile(r"\b([A-Za-z]{3,9}) (\d{1,2})(?:st|nd|rd|th)?,? (20\d{2}|19\d{2})\b"), lambda m: (int(m[3]), next((v for k, v in _MONTHS.items() if k.startswith(m[1].lower()[:3])), 0), int(m[2]))),
    (re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2}|19\d{2})\b"), lambda m: (int(m[3]), int(m[2]), int(m[1]))),  # dd/mm/yyyy (India)
]


def extract_document_dates(text: str, not_after: date) -> list[date]:
    """All real calendar dates in the text (ISO, '14 March 2024', 'March 14, 2024', dd/mm/yyyy), not later than `not_after`."""
    found: set[date] = set()
    for rx, conv in _DATE_PATTERNS:
        for m in rx.finditer(text or ""):
            try:
                y, mo, d = conv(m)
                dt = date(y, mo, d)
            except (ValueError, TypeError):
                continue
            if dt <= not_after:
                found.add(dt)
    return sorted(found)


def _covid_window() -> tuple[date, date]:
    cfg = _load_yaml(RULES_DIR / "statute_clock" / "limitation.yaml").get("covid_exclusion", {})
    return date.fromisoformat(cfg.get("from", "2020-03-15")), date.fromisoformat(cfg.get("to", "2022-02-28"))


def limitation_for(case_type: str, cause_date: date | None, reference_today: date | None = None) -> dict[str, Any]:
    """Pure limitation computation for a practice area and cause-of-action date (no I/O beyond rules)."""
    area = registry.area(case_type)
    lim = area.get("limitation", {}) or {}
    years = lim.get("years")
    today = reference_today or app_today()
    base = {
        "article": lim.get("article", "Limitation Act, 1963"),
        "note": lim.get("note", ""),
        "limitation_years": years,
        "today": today.isoformat(),
        "excluded_periods": [],
    }
    if years is None:
        return {**base, "applicable": False, "limitation_expires": None, "days_left": None, "total_days": None,
                "cause_date": cause_date.isoformat() if cause_date else None}
    if cause_date is None:
        return {**base, "applicable": True, "limitation_expires": None, "days_left": None, "total_days": None, "cause_date": None,
                "note": base["note"] or "Enter the cause-of-action date to start the clock."}
    covid_from, covid_to = _covid_window()
    expires, days_left, excluded = calculate_limitation_with_covid(cause_date, int(years), covid_from, covid_to, today)
    return {**base, "applicable": True, "limitation_expires": expires.isoformat(), "days_left": days_left,
            "total_days": (expires - cause_date).days, "excluded_periods": excluded, "cause_date": cause_date.isoformat()}


async def evaluate_statute_clock(
    case_type: str,
    matter: dict[str, Any],
    documents_text: str,
    reference_today: date | None = None,
) -> dict[str, Any]:
    area = registry.area(case_type)
    today = reference_today or app_today()
    cause_date: date | None = None
    cause_source = "missing"
    if matter.get("cause_date"):
        try:
            cause_date = date.fromisoformat(matter["cause_date"])
            cause_source = "user"
        except ValueError:
            cause_date = None
    if cause_date is None:
        dates = extract_document_dates(documents_text or "", today)
        if dates:
            # The latest dated event on record is the best available proxy for accrual / acknowledgment (ss.18-19).
            cause_date = dates[-1]
            cause_source = "document"
    out = limitation_for(case_type, cause_date, today)
    cfg = _load_yaml(RULES_DIR / "statute_clock" / "limitation.yaml").get("case_types", {}).get(case_type, {})
    sources = await _resolve_sources(cfg.get("sources", []) or [
        {"source_id": "src_kanoon_1317393", "kind": "statute", "title": "Limitation Act, 1963 — Schedule", "doc_id": "1317393", "date": "1963-01-01"}
    ])
    forum = {"court": matter.get("forum_hint") or area.get("forum", "Competent court"),
             "basis": "Territorial and pecuniary jurisdiction" + (f" ({matter['district']})" if matter.get("district") else "")}
    return {
        **out,
        "forum": forum,
        "commercial_court": bool(area.get("commercial_court")),
        "adr_routes": list(area.get("adr_routes", [])),
        "sources": sources,
        "cause_date_source": cause_source if cause_date else "missing",
    }


async def evaluate_advice(
    case_type: str,
    score: dict[str, Any],
    proof_ledger: dict[str, Any],
    documents_text: str,
) -> dict[str, Any]:
    cfg = _load_yaml(RULES_DIR / "settle_or_fight" / "eligibility.yaml")["routes"]
    band = score.get("band", "uncertain")
    missing_critical = [
        it["requirement"]
        for it in proof_ledger.get("items", [])
        if it["state"] == "missing" and it["severity"] == "critical"
    ]
    lower_txt = (documents_text or "").lower()

    options: list[dict[str, Any]] = []

    if case_type == "criminal":
        # Check BNSS s.289 plea bargaining deterministic rules (respecting explicit negations)
        sanitized_txt = re.sub(
            r"\bnot\s+(?:a\s+)?(?:committed\s+)?(?:socio-economic(?:\s+offence)?|against\s+(?:a\s+)?woman(?:\s+or\s+child\s+under\s+14)?|child\s+under\s+14)",
            " ",
            lower_txt,
        )
        excluded_offence = any(w in sanitized_txt for w in ("pocso", "dowry", "child under 14", "against a woman", "against woman", "socio-economic"))
        over_7_yrs = any(w in sanitized_txt for w in ("life imprisonment", "death penalty", "10 years"))
        plea_eligible = not excluded_offence and not over_7_yrs
        options.append(
            {
                "route": "plea_bargain",
                "eligible": plea_eligible,
                "why": cfg["plea_bargain"]["why_eligible"] if plea_eligible else "Excluded under BNSS s.289 (>7 years or excluded category).",
                "sources": [],
            }
        )
        options.append(
            {
                "route": "fight",
                "eligible": True,
                "why": "Proceed to regular trial if prosecution evidence is weak.",
                "sources": [],
            }
        )
        recommendation = "plea_bargain" if plea_eligible else "fight"
        confidence = "high" if plea_eligible else "medium"
        return {"recommendation": recommendation, "options": options, "confidence": confidence, "based_on_band": band}

    # Civil, commercial, family and other routes, driven by the practice-area registry.
    area = registry.area(case_type)
    adr = [r.lower() for r in area.get("adr_routes", [])]
    lok_ok = case_type not in ("writ_service",) and any("lok adalat" in r for r in adr)
    lok_sources = await _resolve_sources(cfg["lok_adalat"]["sources"])
    options.append(
        {
            "route": "lok_adalat",
            "eligible": lok_ok,
            "why": cfg["lok_adalat"]["why"] if lok_ok else "Not a matter Lok Adalat can settle for this practice area.",
            "sources": lok_sources if lok_ok else [],
        }
    )
    is_commercial = bool(area.get("commercial_court")) or case_type == "civil_recovery" and "commercial" in lower_txt
    med_sources = await _resolve_sources(cfg["pre_institution_mediation_12A"]["sources"])
    med_route = next((r for r in area.get("adr_routes", []) if any(w in r.lower() for w in ("mediation", "compounding", "conciliation", "s.89", "counselling"))), None)
    options.append(
        {
            "route": "pre_institution_mediation_12A" if is_commercial else "mediation",
            "eligible": bool(is_commercial or med_route),
            "why": cfg["pre_institution_mediation_12A"]["why_eligible"] if is_commercial else (f"{med_route} is available for this dispute." if med_route else "No statutory mediation route."),
            "sources": med_sources if is_commercial else [],
        }
    )
    fight_why = (
        f"Weak evidence: {', '.join(missing_critical)} missing."
        if missing_critical
        else ("Strong evidentiary record supports litigation." if band == "strong" else "Uncertain merits; weigh litigation cost and delay.")
    )
    options.append({"route": "fight", "eligible": True, "why": fight_why, "sources": []})

    if band == "strong" and not is_commercial:
        recommendation = "fight"
    elif band in ("strong", "moderate") and is_commercial:
        recommendation = "mediate"  # mandatory s.12A before suit per Patil Automation
    elif band == "weak":
        recommendation = "mediate" if (is_commercial or med_route) else "settle"
    else:
        recommendation = "settle"

    confidence = "high" if band in ("strong", "weak") else "medium"
    return {"recommendation": recommendation, "options": options, "confidence": confidence, "based_on_band": band}


_CODE = r"(?P<code>I\.?\s?P\.?\s?C\.?|Indian Penal Code|Cr\.?\s?P\.?\s?C\.?|Code of Criminal Procedure|(?:Indian\s+)?Evidence Act|IEA)(?![A-Za-z])"
_NUM = r"\d{1,3}[A-Z]?(?:\(\d+\))?"
_LIST = rf"{_NUM}(?:\s*(?:,|and|&|/|r/w|read with)\s*{_NUM})*"
# "u/s 406, 420 of the IPC", "Sections 438 Cr.P.C.", "s.65B Evidence Act", "302 IPC"
_BEFORE_RX = re.compile(rf"(?:(?:u/s|under\s+sections?|sections?|secs?\.?|ss?\.)\s*)?(?P<nums>{_LIST})\s*(?:of\s+(?:the\s+)?)?{_CODE}", re.IGNORECASE)
# "IPC 420", "IPC s.420, 406", "CrPC section 438"
_AFTER_RX = re.compile(rf"{_CODE}\s*(?:(?:u/s|sections?|secs?\.?|ss?\.)\s*)?(?P<nums>{_LIST})", re.IGNORECASE)


def _code_of(token: str) -> str:
    t = re.sub(r"[\s.]", "", token).lower()
    if t in ("ipc", "indianpenalcode"):
        return "IPC"
    if t in ("crpc", "codeofcriminalprocedure"):
        return "CrPC"
    return "IEA"


def extract_section_refs(text: str) -> list[tuple[str, str, str]]:
    """(code, section, label) for 'IPC 420', 's.420 IPC', 'u/s 406, 420 of the IPC', 'Section 438 Cr.P.C.', 's.65B Evidence Act'."""
    hits: list[tuple[int, str, str]] = []
    for rx in (_BEFORE_RX, _AFTER_RX):
        for m in rx.finditer(text or ""):
            code = _code_of(m.group("code"))
            for n in re.findall(_NUM, m.group("nums")):
                sec = re.sub(r"\(\d+\)$", "", n).upper()
                hits.append((m.start(), code, sec))
    out: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str]] = set()
    for _, code, sec in sorted(hits):
        if (code, sec) not in seen and int(re.sub(r"\D", "", sec) or 0) > 0:
            seen.add((code, sec))
            out.append((code, sec, f"{code} {sec}"))
    return out


async def evaluate_law_changes(documents_text: str, offence_date: str = "") -> list[dict[str, Any]]:
    cfg = _load_yaml(RULES_DIR / "law_change" / "mappings.yaml")
    cutoff = cfg.get("cutoff_date", "2024-07-01")
    od = (offence_date or "").strip() or app_today().isoformat()
    applies = od >= cutoff
    table = {(m["code"], str(m["section"]).upper()): m for m in cfg.get("mappings", [])}
    findings: list[dict[str, Any]] = []
    for code, sec, found in extract_section_refs(documents_text or ""):
        m = table.get((code, sec))
        if m:
            findings.append(
                {
                    "found": found,
                    "replaced_by": m["new"],
                    "effective": cutoff,
                    "applies": applies,
                    "reason": m["reason"] if applies else f"Offence / proceeding dated {od} predates {cutoff}: the old {code} provision continues to apply.",
                    "sources": [],
                    "location": m.get("subject"),
                }
            )
        else:
            findings.append(
                {
                    "found": found,
                    "replaced_by": "Not in crosswalk",
                    "effective": cutoff,
                    "applies": False,
                    "reason": f"{found} is not in the Insaaf crosswalk table yet. Check the official BNS/BNSS/BSA correspondence table.",
                    "sources": [],
                    "location": None,
                }
            )
    return findings
