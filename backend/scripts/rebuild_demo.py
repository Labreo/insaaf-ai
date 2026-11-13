"""Re-seed demo data and recompute every matter's analysis offline (no LLM, no web).

Keeps matters you created; only adds missing seed matters and refreshes cached stage results.

    python3 -I scripts/rebuild_demo.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import db_session, init_db  # noqa: E402
from app.demo_accounts import credentials_path, demo_passwords  # noqa: E402
from app.pipeline.orchestrator import seed_fast_stage_results  # noqa: E402


async def main() -> None:
    init_db()
    demo_passwords()
    with db_session() as conn:
        conn.execute("DELETE FROM stage_results WHERE stage != 'urgency_flags'")
        n = conn.execute("SELECT COUNT(*) FROM matters").fetchone()[0]
    await seed_fast_stage_results(force=True)
    print(f"rebuilt analysis for {n} matters; demo credentials in {credentials_path()}")


if __name__ == "__main__":
    asyncio.run(main())
