"""Build / extend the Insaaf Precedent Index (ml/data/precedent_corpus.json).

    python3 -I scripts/build_precedent_corpus.py [--max-queries 150] [--areas cheque_bounce,consumer]

Resumable: queries already run (ml/data/corpus_build_log.json) and judgments already in the
corpus are skipped. Uses Serper for discovery and public judgment pages for content.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.registry import areas  # noqa: E402
from app.services.precedents import corpus  # noqa: E402
from app.services.precedents.harvest import doc_id_from_url, fetch_judgment, record_from_serper, serper_search  # noqa: E402

LOG = corpus.CORPUS_PATH.parent / "corpus_build_log.json"

# Per-area discovery queries. {loc} variants bias results toward the jurisdictions the demo covers.
AREA_QUERIES: dict[str, list[str]] = {
    "property": ["registered sale deed unregistered agreement possession title suit", "adverse possession Article 65 limitation title", "Form I and XIV mutation possession Goa"],
    "civil_recovery": ["money recovery suit part payment acknowledgment section 18 limitation", "summary suit Order XXXVII leave to defend recovery", "recovery of price of goods invoices decree"],
    "commercial": ["section 12A commercial courts act pre-institution mediation mandatory", "commercial suit damages breach of contract section 73", "commercial court specified value jurisdiction"],
    "cheque_bounce": ["section 138 negotiable instruments act dishonour cheque legally enforceable debt", "section 139 presumption rebuttal cheque security", "demand notice section 138 limitation complaint section 142", "section 147 compounding cheque dishonour"],
    "consumer": ["deficiency in service consumer protection act 2019 compensation", "delay in possession flat consumer commission refund interest", "medical negligence consumer commission compensation"],
    "rent_tenancy": ["eviction bona fide requirement landlord rent controller", "arrears of rent eviction default tenant", "sub-letting eviction tenant rent act"],
    "family_matrimonial": ["mutual consent divorce section 13B cooling period waiver", "cruelty divorce section 13(1)(ia) hindu marriage act", "desertion divorce family court appeal"],
    "maintenance": ["maintenance section 125 crpc wife income husband", "interim maintenance Rajnesh affidavit of assets", "maintenance section 144 BNSS"],
    "motor_accident": ["motor accident compensation multiplier future prospects", "MACT claim insurance company liability section 149", "motor accident disability compensation loss of earning capacity"],
    "labour": ["termination workman section 25F retrenchment compensation reinstatement", "back wages reinstatement industrial dispute labour court", "gratuity payment of gratuity act controlling authority"],
    "writ_service": ["writ petition article 226 service promotion seniority", "natural justice show cause notice writ quashed", "regularisation of service writ petition"],
    "criminal": ["bail section 439 parity custody period", "anticipatory bail section 438 economic offence", "plea bargaining section 265A", "bail BNSS section 483"],
    "arbitration": ["section 11 appointment of arbitrator existence of arbitration agreement", "section 34 arbitration award patent illegality set aside", "section 9 arbitration interim measures"],
    "succession_probate": ["probate will suspicious circumstances attesting witness section 63", "daughter coparcenary right section 6 hindu succession", "letters of administration succession certificate"],
    "intellectual_property": ["trademark infringement passing off deceptive similarity injunction", "prior user trademark registration passing off", "copyright infringement interim injunction"],
}
JURIS = ["Bombay High Court Goa", "Supreme Court", "Karnataka High Court", ""]

# Second-round queries for areas whose first harvest was thin or noisy (see corpus evaluation).
EXTRA_QUERIES: dict[str, list[str]] = {
    "intellectual_property": ["trade marks act section 29 infringement deceptively similar mark injunction", "passing off goodwill misrepresentation trade dress", "trademark rectification prior user section 34"],
    "property": ["agreement of sale does not create interest in property section 54 transfer of property", "suit for declaration of title and possession registered sale deed", "general power of attorney sale Suraj Lamp title"],
    "succession_probate": ["probate proof of will section 63 succession act section 68 evidence act attesting witness", "letters of administration will genuineness suspicious circumstances"],
    "motor_accident": ["just compensation motor accident Pranay Sethi future prospects multiplier Sarla Verma", "MACT permanent disability loss of earning capacity compensation"],
}


def _load_log() -> dict:
    if LOG.exists():
        return json.loads(LOG.read_text(encoding="utf-8"))
    return {"queries": {}, "serper_calls": 0}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-queries", type=int, default=150)
    ap.add_argument("--areas", default="")
    ap.add_argument("--per-query", type=int, default=10)
    ap.add_argument("--extra", action="store_true", help="run the second-round EXTRA_QUERIES")
    args = ap.parse_args()

    log = _load_log()
    records = corpus.load_records()
    by_id = {r["doc_id"]: r for r in records}
    ap_extra = "--extra" in sys.argv
    table = EXTRA_QUERIES if ap_extra else AREA_QUERIES
    wanted = [a for a in (args.areas.split(",") if args.areas else areas().keys()) if a in table]
    plan: list[tuple[str, str]] = []
    for juris in JURIS:  # breadth first across jurisdictions so a capped run still covers every area
        for area in wanted:
            for q in table[area]:
                full = f"site:indiankanoon.org/doc {q} {juris}".strip()
                if full not in log["queries"]:
                    plan.append((area, full))
    plan = plan[: args.max_queries]
    print(f"corpus={len(records)} planned_queries={len(plan)}")

    sem = asyncio.Semaphore(4)

    async def enrich(rec: dict) -> None:
        async with sem:
            full = await fetch_judgment(rec["doc_id"])
            await asyncio.sleep(0.4)
        if full:
            areas_tag = sorted(set(rec.get("practice_areas", [])))
            rec.update(full)
            rec["practice_areas"] = areas_tag

    for i, (area, q) in enumerate(plan, 1):
        items = await serper_search(q, num=args.per_query)
        log["serper_calls"] += 1
        log["queries"][q] = {"area": area, "hits": len(items), "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        fresh: list[dict] = []
        for it in items:
            did = doc_id_from_url(it.get("link", ""))
            if not did:
                continue
            if did in by_id:
                tags = set(by_id[did].get("practice_areas", [])) | {area}
                by_id[did]["practice_areas"] = sorted(tags)
                continue
            rec = record_from_serper(it, area)
            if rec:
                by_id[did] = rec
                fresh.append(rec)
        await asyncio.gather(*(enrich(r) for r in fresh))
        print(f"[{i}/{len(plan)}] {area:22s} +{len(fresh):2d}  total={len(by_id)}  {q[:70]}")
        if i % 5 == 0:
            corpus.save_records(list(by_id.values()))
            LOG.write_text(json.dumps(log, indent=1), encoding="utf-8")
    corpus.save_records(list(by_id.values()))
    LOG.write_text(json.dumps(log, indent=1), encoding="utf-8")
    print(f"done: {len(by_id)} judgments, serper_calls={log['serper_calls']}")


if __name__ == "__main__":
    asyncio.run(main())
