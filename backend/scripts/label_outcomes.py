"""Label judgment outcomes in the precedent corpus with the LLM (Groq), in batches.

Reads each judgment's operative (last) paragraphs and asks for allowed / dismissed /
partly_allowed / unknown plus a one-line holding. Resumable: only 'unknown' records are sent.

    python3 -I scripts/label_outcomes.py [--batch 12] [--limit 1200]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import init_db  # noqa: E402
from app.services.llm.client import llm_client  # noqa: E402
from app.services.precedents import corpus  # noqa: E402

VALID = {"allowed", "dismissed", "partly_allowed", "unknown"}


def _operative(r: dict) -> str:
    paras = [p.get("text", "") for p in r.get("paras", [])]
    tail = " ".join(paras[-3:]) or r.get("holding", "") or r.get("headnote", "")
    return tail[:900]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=12)
    ap.add_argument("--limit", type=int, default=1200)
    args = ap.parse_args()
    init_db()
    records = list(corpus.load_records(refresh=True))
    todo = [r for r in records if r.get("outcome", "unknown") == "unknown" and _operative(r) and not r.get("landmark")][: args.limit]
    print(f"to_label={len(todo)}", flush=True)
    labelled = 0
    for i in range(0, len(todo), args.batch):
        chunk = todo[i : i + args.batch]
        items = "\n\n".join(f"[{r['doc_id']}] {r.get('title','')[:120]}\nOPERATIVE TEXT: {_operative(r)}" for r in chunk)
        prompt = (
            "For each Indian court judgment below, read the operative text and classify the final result for the party "
            "who brought the case (appellant / petitioner / plaintiff / complainant / applicant): allowed, dismissed, "
            "partly_allowed, or unknown if the text does not say. Also give a one-sentence neutral holding.\n"
            'Return JSON {"labels":[{"doc_id":"...","outcome":"...","holding":"..."}]}\n\n' + items
        )
        try:
            raw = await llm_client.generate_text(prompt, json_mode=True, max_tokens=1400, timeout=45.0)
            data = json.loads(raw)
        except Exception as exc:
            print(f"batch {i // args.batch}: failed {type(exc).__name__}", flush=True)
            await asyncio.sleep(5)
            continue
        by_id = {r["doc_id"]: r for r in chunk}
        for lab in data.get("labels", []):
            r = by_id.get(str(lab.get("doc_id")))
            if r and lab.get("outcome") in VALID:
                r["outcome"] = lab["outcome"]
                r["outcome_source"] = "llm"
                if lab.get("holding"):
                    r["holding_summary"] = str(lab["holding"])[:300]
                labelled += 1
        if (i // args.batch) % 5 == 4:
            corpus.save_records(records)
            print(f"{i + len(chunk)}/{len(todo)} labelled={labelled} model={llm_client.last_model}", flush=True)
        await asyncio.sleep(1.5)
    corpus.save_records(records)
    print(f"done labelled={labelled}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
