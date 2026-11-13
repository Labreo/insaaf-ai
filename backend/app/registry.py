"""Practice-area, language and instrument registry loaded from rules/*.yaml (single source of truth)."""
from __future__ import annotations

from functools import lru_cache
from typing import Any

import yaml

from app.config import RULES_DIR


@lru_cache(maxsize=1)
def _registry() -> dict[str, Any]:
    return yaml.safe_load((RULES_DIR / "practice_areas.yaml").read_text(encoding="utf-8")) or {}


@lru_cache(maxsize=1)
def _instruments() -> dict[str, Any]:
    path = RULES_DIR / "instruments.yaml"
    if not path.exists():
        return {}
    return (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("instruments", {})


def areas() -> dict[str, dict[str, Any]]:
    return _registry().get("areas", {})


def area(case_type: str) -> dict[str, Any]:
    return areas().get(case_type) or areas()["property"]


def is_area(case_type: str) -> bool:
    return case_type in areas()


def languages() -> dict[str, str]:
    return _registry().get("languages", {"en": "English"})


def language_label(code: str | None) -> str:
    return languages().get((code or "").lower(), (code or "").upper() or "Unknown")


def instruments() -> dict[str, dict[str, Any]]:
    return _instruments()


def instrument(instrument_id: str) -> dict[str, Any] | None:
    return _instruments().get(instrument_id)


def instruments_for(case_type: str) -> list[str]:
    ids = list(area(case_type).get("instruments", []))
    return [i for i in ids if i in _instruments()] or [i for i in ("legal_notice",) if i in _instruments()]


def meta_payload() -> dict[str, Any]:
    return {
        "areas": [
            {
                "id": k,
                "label": v["label"],
                "tag": v["tag"],
                "group": v.get("group", "Civil"),
                "forum": v.get("forum", ""),
                "limitation": v.get("limitation", {}),
                "commercial_court": bool(v.get("commercial_court")),
                "adr_routes": v.get("adr_routes", []),
                "instruments": instruments_for(k),
                "statutes": v.get("statutes", []),
            }
            for k, v in areas().items()
        ],
        "languages": [{"code": k, "label": v} for k, v in languages().items()],
        "instruments": [
            {"id": k, "label": v.get("label", k), "kind": v.get("kind", "pleading")} for k, v in _instruments().items()
        ],
    }
