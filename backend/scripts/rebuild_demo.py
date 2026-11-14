"""Re-seed demo data and recompute every matter's analysis offline (no LLM, no web).

Keeps matters you created; only adds missing seed matters and refreshes cached stage results.

    python3 -I scripts/rebuild_demo.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import DEMO_DIR, db_session, init_db  # noqa: E402
from app.demo_accounts import credentials_path, demo_passwords  # noqa: E402
from app.pipeline.orchestrator import seed_fast_stage_results  # noqa: E402


def sync_seed_documents(conn) -> int:
    """Push edited demo/seed/matters.json text into already-seeded fictional matters."""
    seed_path = DEMO_DIR / "seed" / "matters.json"
    if not seed_path.exists():
        return 0
    changed = 0
    for m in json.loads(seed_path.read_text(encoding="utf-8")):
        if not conn.execute("SELECT 1 FROM matters WHERE id = ?", (m["id"],)).fetchone():
            continue
        conn.execute(
            "UPDATE matters SET summary = ?, cause_date = ? WHERE id = ?",
            (m["summary"], m["cause_date"], m["id"]),
        )
        for i, doc in enumerate(m.get("documents", []), start=1):
            row = conn.execute(
                "SELECT storage_path, extracted_text, metadata_json FROM documents WHERE id = ?",
                (f"doc_{m['id']}_{i}",),
            ).fetchone()
            if not row or '"fictional": true' not in (row["metadata_json"] or "") or row["extracted_text"] == doc["text"]:
                continue
            Path(row["storage_path"]).write_text(doc["text"], encoding="utf-8")
            conn.execute("UPDATE documents SET extracted_text = ? WHERE id = ?", (doc["text"], f"doc_{m['id']}_{i}"))
            changed += 1
    return changed


async def main() -> None:
    init_db()
    demo_passwords()
    with db_session() as conn:
        synced = sync_seed_documents(conn)
        if synced:
            print(f"synced {synced} edited seed documents")
        conn.execute("DELETE FROM stage_results WHERE stage != 'urgency_flags'")
        n = conn.execute("SELECT COUNT(*) FROM matters").fetchone()[0]
    await seed_fast_stage_results(force=True)
    print(f"rebuilt analysis for {n} matters; demo credentials in {credentials_path()}")


if __name__ == "__main__":
    asyncio.run(main())
