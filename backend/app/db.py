"""SQLite persistence layer for matters, documents, stage outputs, Kanoon cache, and hash-chained ledger."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from app.config import DEMO_DIR, settings


def compute_entry_hash(
    prev_hash: str,
    entry_id: str,
    actor: str,
    role: str,
    matter_id: str,
    action: str,
    target: str,
    target_id: str,
    reason_code: str,
    note: str,
    at: str,
) -> str:
    payload = json.dumps(
        {
            "id": entry_id,
            "actor": actor,
            "role": role,
            "matter_id": matter_id,
            "action": action,
            "target": target,
            "target_id": target_id,
            "reason_code": reason_code,
            "note": note,
            "at": at,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256((prev_hash + "|" + payload).encode("utf-8")).hexdigest()


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or settings.database_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


@contextmanager
def db_session(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: Path | None = None) -> None:
    with db_session(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS matters (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL DEFAULT 'org_chamber_a',
                title TEXT NOT NULL,
                case_type TEXT NOT NULL,
                status TEXT NOT NULL,
                priority REAL NOT NULL,
                next_deadline TEXT,
                days_left INTEGER,
                forum_hint TEXT,
                client_language TEXT DEFAULT 'kok',
                created_by TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                matter_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                kind TEXT NOT NULL,
                pages INTEGER,
                storage_path TEXT NOT NULL,
                extracted_text TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS stage_results (
                matter_id TEXT NOT NULL,
                stage TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                elapsed_ms INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (matter_id, stage),
                FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS kanoon_cache (
                cache_key TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                fetched_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS kanoon_stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                hits INTEGER NOT NULL DEFAULT 0,
                misses INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS ledger_entries (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT UNIQUE NOT NULL,
                org_id TEXT NOT NULL DEFAULT 'org_chamber_a',
                actor TEXT NOT NULL,
                role TEXT NOT NULL,
                matter_id TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                target_id TEXT NOT NULL,
                reason_code TEXT NOT NULL,
                note TEXT NOT NULL,
                diff_json TEXT NOT NULL DEFAULT '{}',
                at TEXT NOT NULL,
                hash TEXT NOT NULL,
                prev_hash TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL DEFAULT 'org_chamber_a',
                actor TEXT NOT NULL,
                role TEXT NOT NULL,
                matter_id TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS retrain_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                old_version TEXT NOT NULL,
                new_version TEXT NOT NULL,
                metrics_before_json TEXT NOT NULL,
                metrics_after_json TEXT NOT NULL,
                labels_added INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.execute("INSERT OR IGNORE INTO kanoon_stats (id, hits, misses) VALUES (1, 0, 0)")
        _seed_demo_data(conn)


def _extract_doc_text_for_seed(path: Path) -> tuple[str, int]:
    if not path.exists():
        return "", 1
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        import fitz

        doc = fitz.open(str(path))
        pages = len(doc)
        text = "\n\n".join(f"[Page {i+1}]\n{p.get_text('text')}" for i, p in enumerate(doc))
        doc.close()
        return text, pages
    if suffix == ".docx":
        from docx import Document

        doc = Document(str(path))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return text, 1
    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        return json.dumps(data, ensure_ascii=False), 1
    return "", 1


def _seed_demo_data(conn: sqlite3.Connection) -> None:
    existing = conn.execute("SELECT COUNT(*) FROM matters").fetchone()[0]
    if existing == 0:
        today = date(2026, 11, 13)
        d1 = date(2026, 12, 24)
        d2 = date(2027, 2, 2)
        matters = [
            (
                "mat_001",
                "org_chamber_a",
                "Fernandes v. Naik — possession of plot, Mapusa (FICTIONAL)",
                "property",
                "ready",
                0.86,
                d1.isoformat(),
                (d1 - today).days,
                "Civil Judge Senior Division, Mapusa",
                "kok",
                "junior_1",
                "2026-11-13T09:30:00Z",
            ),
            (
                "mat_002",
                "org_chamber_a",
                "Shetty Traders — money recovery ₹4.2L (FICTIONAL)",
                "civil_recovery",
                "in_review",
                0.64,
                d2.isoformat(),
                (d2 - today).days,
                "Commercial Court, Panaji",
                "en",
                "junior_2",
                "2026-11-12T15:10:00Z",
            ),
            (
                "mat_003",
                "org_chamber_a",
                "State v. R. Gaonkar — plea eligibility check (FICTIONAL)",
                "criminal",
                "draft",
                0.41,
                None,
                None,
                "Judicial Magistrate First Class, Mapusa",
                "kok",
                "senior_1",
                "2026-11-10T11:00:00Z",
            ),
        ]
        conn.executemany(
            """
            INSERT INTO matters (id, org_id, title, case_type, status, priority, next_deadline, days_left, forum_hint, client_language, created_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            matters,
        )

        # Seed documents from demo/matters/
        demo_docs = [
            ("doc_pdf_01", "mat_001", "agreement_of_sale_fictional.pdf", "pdf", DEMO_DIR / "matters" / "mat_001" / "agreement_of_sale_fictional.pdf"),
            ("doc_docx_01", "mat_001", "chamber_intake_notes_fictional.docx", "docx", DEMO_DIR / "matters" / "mat_001" / "chamber_intake_notes_fictional.docx"),
            ("doc_voice_01", "mat_001", "client_voice_note_kok.json", "audio", DEMO_DIR / "matters" / "mat_001" / "client_voice_note_kok.json"),
            ("doc_docx_02", "mat_002", "shetty_traders_invoices_fictional.docx", "docx", DEMO_DIR / "matters" / "mat_002" / "shetty_traders_invoices_fictional.docx"),
            ("doc_docx_03", "mat_003", "state_v_gaonkar_chargesheet_fictional.docx", "docx", DEMO_DIR / "matters" / "mat_003" / "state_v_gaonkar_chargesheet_fictional.docx"),
        ]
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for doc_id, matter_id, fname, kind, fpath in demo_docs:
            text, pages = _extract_doc_text_for_seed(fpath)
            conn.execute(
                """
                INSERT OR IGNORE INTO documents (id, matter_id, filename, kind, pages, storage_path, extracted_text, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (doc_id, matter_id, fname, kind, pages, str(fpath), text, json.dumps({"fictional": True}), now_iso),
            )

    led_count = conn.execute("SELECT COUNT(*) FROM ledger_entries").fetchone()[0]
    if led_count == 0:
        e1_hash = compute_entry_hash(
            "GENESIS",
            "led_001",
            "junior_1",
            "junior",
            "mat_001",
            "edit",
            "fact",
            "fact_04",
            "wrong_fact",
            "Client confirmed payment date",
            "2026-11-13T10:02:00Z",
        )
        e2_hash = compute_entry_hash(
            e1_hash,
            "led_002",
            "senior_1",
            "senior",
            "mat_001",
            "override",
            "score",
            "score",
            "score_disagree",
            "Possession since 2009 underweighted",
            "2026-11-13T10:20:00Z",
        )
        conn.execute(
            """
            INSERT INTO ledger_entries (id, org_id, actor, role, matter_id, action, target, target_id, reason_code, note, diff_json, at, hash, prev_hash)
            VALUES (?, 'org_chamber_a', ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)
            """,
            ("led_001", "junior_1", "junior", "mat_001", "edit", "fact", "fact_04", "wrong_fact", "Client confirmed payment date", "2026-11-13T10:02:00Z", e1_hash, "GENESIS"),
        )
        conn.execute(
            """
            INSERT INTO ledger_entries (id, org_id, actor, role, matter_id, action, target, target_id, reason_code, note, diff_json, at, hash, prev_hash)
            VALUES (?, 'org_chamber_a', ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)
            """,
            ("led_002", "senior_1", "senior", "mat_001", "override", "score", "score", "score_disagree", "Possession since 2009 underweighted", "2026-11-13T10:20:00Z", e2_hash, e1_hash),
        )


def save_stage_result(matter_id: str, stage: str, payload: Any, elapsed_ms: int = 0, db_path: Path | None = None) -> None:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session(db_path) as conn:
        conn.execute(
            """
            INSERT INTO stage_results (matter_id, stage, payload_json, elapsed_ms, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(matter_id, stage) DO UPDATE SET
                payload_json = excluded.payload_json,
                elapsed_ms = excluded.elapsed_ms,
                updated_at = excluded.updated_at
            """,
            (matter_id, stage, json.dumps(payload, ensure_ascii=False), elapsed_ms, now_iso),
        )


def get_stage_result(matter_id: str, stage: str, db_path: Path | None = None) -> Any | None:
    with db_session(db_path) as conn:
        row = conn.execute(
            "SELECT payload_json FROM stage_results WHERE matter_id = ? AND stage = ?",
            (matter_id, stage),
        ).fetchone()
        if not row:
            return None
        return json.loads(row["payload_json"])


def log_access(actor: str, role: str, matter_id: str, endpoint: str, db_path: Path | None = None) -> None:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session(db_path) as conn:
        conn.execute(
            "INSERT INTO access_logs (org_id, actor, role, matter_id, endpoint, at) VALUES ('org_chamber_a', ?, ?, ?, ?, ?)",
            (actor, role, matter_id, endpoint, now_iso),
        )

