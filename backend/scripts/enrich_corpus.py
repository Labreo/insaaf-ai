"""Second pass over the precedent corpus: fetch full pages for search-hit-only records and
re-derive outcomes. Resumable; slow on purpose (polite to the source site).

    python3 -I scripts/enrich_corpus.py [--limit 800]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.precedents import corpus  # noqa: E402
from app.services.precedents.harvest import fetch_judgment, infer_outcome  # noqa: E402


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=800)
    args = ap.parse_args()
    records = list(corpus.load_records(refresh=True))
    todo = [r for r in records if not r.get("paragraph_count") and not r.get("landmark")][: args.limit]
    print(f"records={len(records)} to_fetch={len(todo)}", flush=True)
    sem = asyncio.Semaphore(2)
    done = 0

    async def one(r: dict) -> None:
        nonlocal done
        async with sem:
            full = await fetch_judgment(r["doc_id"])
            await asyncio.sleep(1.0)
        if full:
            tags = r.get("practice_areas", [])
            r.update(full)
            r["practice_areas"] = tags
        done += 1
        if done % 25 == 0:
            print(f"{done}/{len(todo)} fetched", flush=True)
            corpus.save_records(records)

    await asyncio.gather(*(one(r) for r in todo))
    # Re-derive outcomes from stored paragraphs for every record (pattern set improves over time).
    for r in records:
        paras = [p.get("text", "") for p in r.get("paras", [])] + [r.get("holding", "")]
        if r.get("outcome", "unknown") == "unknown" and any(paras):
            r["outcome"] = infer_outcome(paras)
    corpus.save_records(records)
    full = sum(1 for r in records if r.get("paragraph_count"))
    print(f"done: full_pages={full}/{len(records)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
