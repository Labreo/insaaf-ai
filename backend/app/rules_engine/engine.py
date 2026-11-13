"""Deterministic YAML rule engine for Proof Ledger, Statute Clock, Settle-or-Fight, and Law Change Radar."""
from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from app.config import RULES_DIR
from app.services.kanoon.client import kanoon_client


def _load_yaml(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


async def _resolve_sources(raw_sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for s in raw_sources or []:
        doc_id = str(s.get("doc_id", "")).strip()
        if doc_id:
            src = await kanoon_client.get_doc_source(
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

        has_negative = any(k in corpus for k in negative_any)
        has_weak = any(k in corpus for k in weak_any)
        has_present = any(k in corpus for k in present_any)

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
    """Deterministic limitation calculator honouring SC suo motu COVID exclusion."""
    today = reference_today or date(2026, 11, 13)
    try:
        nominal_expiry = cause_date.replace(year=cause_date.year + limitation_years)
    except ValueError:
        # Handle Feb 29
        nominal_expiry = cause_date.replace(year=cause_date.year + limitation_years, day=28)

    excluded: list[dict[str, str]] = []
    final_expiry = nominal_expiry

    # If the limitation window overlaps [covid_from, covid_to], exclude overlapping days
    if cause_date <= covid_to and nominal_expiry >= covid_from:
        overlap_start = max(cause_date, covid_from)
        overlap_end = min(nominal_expiry, covid_to)
        if overlap_end >= overlap_start:
            excluded_days = (overlap_end - overlap_start).days + 1
            final_expiry = nominal_expiry + timedelta(days=excluded_days)
            excluded.append(
                {
                    "from": covid_from.isoformat(),
                    "to": covid_to.isoformat(),
                    "reason": "Supreme Court suo motu COVID limitation exclusion",
                }
            )

    days_left = (final_expiry - today).days
    return final_expiry, days_left, excluded


async def evaluate_statute_clock(
    case_type: str,
    matter: dict[str, Any],
    documents_text: str,
    reference_today: date | None = None,
) -> dict[str, Any]:
    cfg = _load_yaml(RULES_DIR / "statute_clock" / "limitation.yaml")
    case_cfg = cfg["case_types"].get(case_type, cfg["case_types"]["property"])
    covid = cfg["covid_exclusion"]
    covid_from = date.fromisoformat(covid["from"])
    covid_to = date.fromisoformat(covid["to"])

    # If matter already has a pinned next_deadline (e.g. seeded demo mat_001 -> 2026-12-24), honour exact date
    today = reference_today or date(2026, 11, 13)
    if matter.get("next_deadline"):
        expires = date.fromisoformat(matter["next_deadline"])
        days_left = (expires - today).days
        excluded = [
            {
                "from": covid["from"],
                "to": covid["to"],
                "reason": covid["reason"],
            }
        ] if case_type in ("property", "civil_recovery") else []
    else:
        cause_date = date.fromisoformat(case_cfg["default_cause_date"])
        # Detect date in uploaded documents if present
        m = re.search(r"(20\d{2}-\d{2}-\d{2})", documents_text or "")
        if m:
            try:
                cause_date = date.fromisoformat(m.group(1))
            except ValueError:
                pass
        expires, days_left, excluded = calculate_limitation_with_covid(
            cause_date=cause_date,
            limitation_years=int(case_cfg["limitation_years"]),
            covid_from=covid_from,
            covid_to=covid_to,
            reference_today=today,
        )

    sources = await _resolve_sources(case_cfg.get("sources", []))
    forum = dict(case_cfg["forum"])
    if matter.get("forum_hint"):
        forum["court"] = matter["forum_hint"]

    return {
        "limitation_expires": expires.isoformat(),
        "days_left": days_left,
        "article": case_cfg["article"],
        "excluded_periods": excluded,
        "forum": forum,
        "commercial_court": bool(case_cfg["commercial_court"]),
        "adr_routes": list(case_cfg["adr_routes"]),
        "sources": sources,
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
        return {"recommendation": recommendation, "options": options, "confidence": confidence}

    # Civil / Property routes
    lok_sources = await _resolve_sources(cfg["lok_adalat"]["sources"])
    options.append(
        {
            "route": "lok_adalat",
            "eligible": True,
            "why": cfg["lok_adalat"]["why"],
            "sources": lok_sources,
        }
    )

    med_sources = await _resolve_sources(cfg["pre_institution_mediation_12A"]["sources"])
    is_commercial = case_type == "civil_recovery"
    options.append(
        {
            "route": "pre_institution_mediation_12A",
            "eligible": is_commercial,
            "why": cfg["pre_institution_mediation_12A"]["why_eligible"] if is_commercial else cfg["pre_institution_mediation_12A"]["why_ineligible"],
            "sources": med_sources,
        }
    )

    fight_why = (
        f"Weak band: {', '.join(missing_critical)} missing."
        if missing_critical
        else ("Strong evidentiary record supports litigation." if band == "strong" else "Uncertain merits; weigh litigation costs.")
    )
    options.append(
        {
            "route": "fight",
            "eligible": True,
            "why": fight_why,
            "sources": [],
        }
    )

    if band == "strong" and not is_commercial:
        recommendation = "fight"
    elif band == "strong" and is_commercial:
        recommendation = "mediate"  # mandatory s.12A before suit per Patil Automation
    elif band == "weak":
        recommendation = "mediate"
    else:
        recommendation = "settle"

    confidence = "high" if band in ("strong", "weak") else "medium"
    return {"recommendation": recommendation, "options": options, "confidence": confidence}


async def evaluate_law_changes(documents_text: str, offence_date: str = "2025-08-14") -> list[dict[str, Any]]:
    cfg = _load_yaml(RULES_DIR / "law_change" / "mappings.yaml")
    cutoff = cfg.get("cutoff_date", "2024-07-01")
    applies = offence_date >= cutoff
    lower = (documents_text or "").lower()
    findings: list[dict[str, Any]] = []
    for m in cfg.get("mappings", []):
        aliases = [m["old"].lower()] + [a.lower() for a in m.get("aliases", [])]
        if any(a in lower for a in aliases):
            findings.append(
                {
                    "found": m["old"],
                    "replaced_by": m["new"],
                    "effective": cutoff,
                    "applies": applies,
                    "reason": m["reason"] if applies else f"Offence predates {cutoff}; old code applies.",
                    "sources": [],
                }
            )
    return findings

