"""Write a specific issue + holding line for every judgment from its reasoning paragraphs (Groq).

Replaces generic operative-only summaries ("suit decreed in part") with what a lawyer scans for:
the legal question and how the court answered it. Also repairs titles that are only a court name.
Resumable: records with summary_v2 are skipped.

    python3 -I scripts/summarise_corpus.py [--batch 8] [--limit 2000]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import init_db  # noqa: E402
from app.services.llm.client import llm_client  # noqa: E402
from app.services.precedents import corpus  # noqa: E402
from app.services.precedents.harvest import is_boilerplate  # noqa: E402

COURT_ONLY = re.compile(r"[A-Za-z &\-]*(High Court|Supreme Court|District Court|Tribunal|Commission)( of India)?( - \w+)?")


def _material(r: dict) -> str:
    paras = [p.get("text", "") for p in r.get("paras", []) if not is_boilerplate(p.get("text", ""))]
    body = " ".join(paras[:2] + paras[-4:])[:1400]
    return body or (r.get("headnote") or "")[:900]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--limit", type=int, default=2000)
    args = ap.parse_args()
    init_db()
    records = list(corpus.load_records(refresh=True))
    todo = [r for r in records if not r.get("summary_v2") and not r.get("landmark") and _material(r)][: args.limit]
    print(f"to_summarise={len(todo)}", flush=True)
    done = 0
    for i in range(0, len(todo), args.batch):
        chunk = todo[i : i + args.batch]
        items = "\n\n".join(f"[{r['doc_id']}] TITLE: {r.get('title','')[:140]} | COURT: {r.get('court','')}\nTEXT: {_material(r)}" for r in chunk)
        prompt = (
            "You index Indian court judgments for lawyers. For each judgment give:\n"
            "- issue: the legal question in <= 18 words (name the statute/section if the text does)\n"
            "- holding: what the court decided and why, in <= 30 words, specific to the facts (no 'the court decided the case')\n"
            "- outcome: allowed | dismissed | partly_allowed | unknown (for the party who brought the case)\n"
            "- case_name: 'A v. B' if the TITLE is only a court name and the text names the parties, else ''\n"
            "Use only the given text. If the text has no reasoning, set holding to ''.\n"
            'Return JSON {"items":[{"doc_id":"...","issue":"...","holding":"...","outcome":"...","case_name":""}]}\n\n' + items
        )
        try:
            data = json.loads(await llm_client.generate_text(prompt, json_mode=True, max_tokens=1600, timeout=60.0))
        except Exception as exc:
            print(f"batch {i // args.batch} failed: {type(exc).__name__}", flush=True)
            await asyncio.sleep(8)
            continue
        by_id = {r["doc_id"]: r for r in chunk}
        for it in (data if isinstance(data, list) else data.get("items", []) if isinstance(data, dict) else []):
            r = by_id.get(str(it.get("doc_id"))) if isinstance(it, dict) else None
            if not r:
                continue
            if it.get("holding"):
                r["holding_summary"] = str(it["holding"])[:320]
            if it.get("issue"):
                r["issue"] = str(it["issue"])[:200]
            if it.get("outcome") in ("allowed", "dismissed", "partly_allowed") and r.get("outcome", "unknown") == "unknown":
                r["outcome"] = it["outcome"]
                r["outcome_source"] = "llm"
            if it.get("case_name") and COURT_ONLY.fullmatch(r.get("title", "").strip()):
                r["title"] = str(it["case_name"])[:160]
            r["summary_v2"] = True
            done += 1
        if (i // args.batch) % 10 == 9:
            corpus.save_records(records)
            print(f"{i + len(chunk)}/{len(todo)} done={done} model={llm_client.last_model}", flush=True)
        await asyncio.sleep(1.0)
    corpus.save_records(records)
    print(f"finished done={done}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
