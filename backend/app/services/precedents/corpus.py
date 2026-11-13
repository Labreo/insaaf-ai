"""On-disk judgment corpus for the Insaaf Precedent Index (ml/data/precedent_corpus.json)."""
from __future__ import annotations

import json
import os
import threading
from typing import Any

from app.config import ML_DIR

CORPUS_PATH = ML_DIR / "data" / "precedent_corpus.json"
_lock = threading.Lock()

# Statutes and landmark authorities the rule packs cite by document id. Text is the operative
# provision / holding as reported; every entry links to its public source page.
LANDMARKS: dict[str, dict[str, Any]] = {
    "1565619": {"title": "Suraj Lamp & Industries v. State of Haryana", "court": "Supreme Court of India", "date": "2011-10-11", "kind": "judgment", "statutes": ["Registration Act s.17"], "practice_areas": ["property"], "outcome": "dismissed",
                "headnote": "Immovable property can be legally and lawfully transferred/conveyed only by a registered deed of conveyance. Transactions of the nature of 'GPA sales' or 'SA/GPA/WILL transfers' do not convey title and do not amount to transfer, nor can they be recognized as valid mode of transfer of immovable property."},
    "561156": {"title": "Registration Act, 1908 — s.17", "court": "", "date": "1908-01-01", "kind": "statute", "practice_areas": ["property"],
               "headnote": "Section 17(1): Documents of which registration is compulsory — non-testamentary instruments which purport or operate to create, declare, assign, limit or extinguish any right, title or interest of the value of one hundred rupees and upwards, to or in immovable property, shall be registered."},
    "176042882": {"title": "Indian Stamp Act, 1899 — s.35", "court": "", "date": "1899-01-01", "kind": "statute", "practice_areas": ["property"],
                  "headnote": "Section 35: Instruments not duly stamped inadmissible in evidence — No instrument chargeable with duty shall be admitted in evidence for any purpose by any person having by law or consent of parties authority to receive evidence, unless such instrument is duly stamped."},
    "1317393": {"title": "Limitation Act, 1963 — Schedule", "court": "", "date": "1963-01-01", "kind": "statute", "practice_areas": [],
                "headnote": "Schedule — Period of Limitation: suits for possession based on title (Art. 65: 12 years); suits for price of goods sold and delivered (Art. 14: 3 years). Section 18: a written acknowledgment of liability before expiry gives a fresh period of limitation."},
    "139325262": {"title": "Legal Services Authorities Act, 1987 — s.21", "court": "", "date": "1987-01-01", "kind": "statute", "practice_areas": [],
                  "headnote": "Section 21: Every award of the Lok Adalat shall be deemed to be a decree of a civil court and shall be final and binding on all the parties to the dispute, and no appeal shall lie to any court against the award."},
    "164693074": {"title": "Patil Automation Pvt. Ltd. v. Rakheja Engineers Pvt. Ltd.", "court": "Supreme Court of India", "date": "2022-08-17", "kind": "judgment", "statutes": ["Commercial Courts Act s.12A", "CPC O.VII R.11"], "practice_areas": ["commercial", "civil_recovery"], "outcome": "dismissed",
                  "headnote": "Section 12A of the Commercial Courts Act, 2015 is mandatory; any suit instituted violating the mandate of Section 12A (without exhausting pre-institution mediation where no urgent interim relief is contemplated) must be visited with rejection of the plaint under Order VII Rule 11 CPC."},
    "58730926": {"title": "Suresh Kumar Koushal v. Naz Foundation", "court": "Supreme Court of India", "date": "2013-12-11", "kind": "judgment", "practice_areas": [],
                 "headnote": "Division Bench decision upholding Section 377 IPC; subsequently overruled by the Constitution Bench in Navtej Singh Johar v. Union of India (2018) 10 SCC 1."},
    "168671544": {"title": "Navtej Singh Johar v. Union of India", "court": "Supreme Court of India", "date": "2018-09-06", "kind": "judgment", "practice_areas": [],
                  "headnote": "Five-Judge Constitution Bench declared Section 377 IPC unconstitutional insofar as it criminalises consensual sexual acts between adults in private, and overruled Suresh Kumar Koushal v. Naz Foundation (2013)."},
    "171398": {"title": "Indian Contract Act, 1872 — s.10", "court": "", "date": "1872-01-01", "kind": "statute", "practice_areas": ["civil_recovery", "commercial"],
               "headnote": "Section 10: All agreements are contracts if they are made by the free consent of parties competent to contract, for a lawful consideration and with a lawful object, and are not hereby expressly declared to be void."},
    "1725400": {"title": "ADM Jabalpur v. Shivkant Shukla", "court": "Supreme Court of India", "date": "1976-04-28", "kind": "judgment", "practice_areas": ["writ_service"],
                "headnote": "Majority holding suspending enforcement of Article 21 rights during the Emergency; overruled by the Nine-Judge Bench in Justice K.S. Puttaswamy (Retd.) v. Union of India (2017) 10 SCC 1."},
    "91938676": {"title": "Justice K.S. Puttaswamy (Retd.) v. Union of India", "court": "Supreme Court of India", "date": "2017-08-24", "kind": "judgment", "practice_areas": ["writ_service"],
                 "headnote": "The judgments rendered by all the four judges constituting the majority in ADM Jabalpur are seriously flawed. Life and personal liberty are inalienable to human existence. ADM Jabalpur v. Shivkant Shukla is overruled."},
}

_cache: list[dict[str, Any]] | None = None


def _landmark_records() -> list[dict[str, Any]]:
    out = []
    for doc_id, m in LANDMARKS.items():
        out.append({
            "doc_id": doc_id, "title": m["title"], "court": m["court"], "state": "India" if m["court"] else "",
            "seat": "", "bench": "", "date": m["date"], "headnote": m["headnote"], "holding": "",
            "statutes": m.get("statutes", []), "outcome": m.get("outcome", "unknown"), "kind": m["kind"],
            "url": f"https://indiankanoon.org/doc/{doc_id}/", "verified": True, "landmark": True,
            "practice_areas": m.get("practice_areas", []), "paras": [{"n": 1, "text": m["headnote"]}],
        })
    return out


def load_records(refresh: bool = False) -> list[dict[str, Any]]:
    global _cache
    with _lock:
        if _cache is not None and not refresh:
            return _cache
        records: list[dict[str, Any]] = []
        if CORPUS_PATH.exists():
            try:
                records = list(json.loads(CORPUS_PATH.read_text(encoding="utf-8")).get("judgments", []))
            except Exception:
                records = []
        have = {r["doc_id"] for r in records}
        for lm in _landmark_records():
            if lm["doc_id"] in have:
                # Keep the curated headnote for landmarks the rule packs quote verbatim.
                for r in records:
                    if r["doc_id"] == lm["doc_id"]:
                        r.update({k: lm[k] for k in ("title", "headnote", "kind", "landmark")})
                        r["practice_areas"] = sorted(set(r.get("practice_areas", [])) | set(lm["practice_areas"]))
            else:
                records.append(lm)
        _cache = records
        return records


def save_records(records: list[dict[str, Any]]) -> None:
    global _cache
    with _lock:
        CORPUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": 1, "count": len(records), "judgments": sorted(records, key=lambda r: r["doc_id"])}
        tmp = CORPUS_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=0), encoding="utf-8")
        os.replace(tmp, CORPUS_PATH)  # atomic: concurrent readers never see a half-written file
        _cache = None


def get(doc_id: str) -> dict[str, Any] | None:
    for r in load_records():
        if r["doc_id"] == str(doc_id):
            return r
    return None


def add(record: dict[str, Any]) -> None:
    """Add (or merge) one record and persist. Used by the live web sweep."""
    records = list(load_records())
    for r in records:
        if r["doc_id"] == record["doc_id"]:
            r["practice_areas"] = sorted(set(r.get("practice_areas", [])) | set(record.get("practice_areas", [])))
            break
    else:
        records.append(record)
    save_records(records)
