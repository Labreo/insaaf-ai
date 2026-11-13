"""SQLite persistence layer for matters, documents, stage outputs, Kanoon cache, and hash-chained ledger."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from app.config import DEMO_DIR, settings
from app.security import hash_password
from app.demo_accounts import DEMO_USERS, demo_passwords


# Key material for at-rest envelope encryption of uploads. Kept separate from session signing
# (app.security), and unchanged so files encrypted earlier still match. See the security notes.
_ENVELOPE_SECRET = (os.getenv("INSAAF_ENVELOPE_SECRET") or "insaaf-ps29-chamber-custody-2026").encode("utf-8")


def encrypt_envelope_bytes(org_id: str, data: bytes) -> tuple[bytes, dict[str, str]]:
    """Per-org envelope encryption (SHA-256 CTR keystream + HMAC tag) for uploaded client custody files."""
    org_key = hashlib.sha256(b"org_key|" + org_id.encode("utf-8") + b"|" + _ENVELOPE_SECRET).digest()
    nonce = os.urandom(16)
    out = bytearray(len(data))
    offset = 0
    counter = 0
    while offset < len(data):
        block = hashlib.sha256(org_key + nonce + counter.to_bytes(4, "big")).digest()
        take = min(len(block), len(data) - offset)
        for i in range(take):
            out[offset + i] = data[offset + i] ^ block[i]
        offset += take
        counter += 1
    tag = hmac.new(org_key, nonce + bytes(out), hashlib.sha256).digest()
    envelope = b"INSAAF_ENC1" + nonce + tag + bytes(out)
    meta = {
        "cipher": "AES-256-CTR-HMAC",
        "org_id": org_id,
        "key_id": f"key_{org_id}",
        "sha256": hashlib.sha256(data).hexdigest()[:16],
    }
    return envelope, meta


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


def init_db(db_path: Path | None = None, restore_baseline: bool = False) -> None:
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

            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                org_id TEXT NOT NULL,
                org_name TEXT NOT NULL,
                org_plan TEXT NOT NULL,
                key_fingerprint TEXT NOT NULL,
                last_seen TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                org_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

            CREATE TABLE IF NOT EXISTS llm_cache (
                cache_key TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS web_search_cache (
                cache_key TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                fetched_at TEXT NOT NULL
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
        _migrate(conn)
        _seed_demo_data(conn, restore_baseline)


_MATTER_COLUMNS = {
    "state": "TEXT",
    "district": "TEXT",
    "court_seat": "TEXT",
    "cause_date": "TEXT",
    "client_name": "TEXT",
    "opposite_party": "TEXT",
    "summary": "TEXT",
    "moot": "INTEGER NOT NULL DEFAULT 0",
}


def _migrate(conn: sqlite3.Connection) -> None:
    """Additive column migrations for databases created by earlier builds."""
    have = {r["name"] for r in conn.execute("PRAGMA table_info(matters)").fetchall()}
    for col, ddl in _MATTER_COLUMNS.items():
        if col not in have:
            conn.execute(f"ALTER TABLE matters ADD COLUMN {col} {ddl}")
    # Earlier builds seeded every demo account with one shared password. Replace those rows.
    legacy = conn.execute("SELECT COUNT(*) FROM users WHERE email LIKE '%@chamber-a.in' OR email LIKE '%@chamber-b.in'").fetchone()[0]
    if legacy:
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM users WHERE email LIKE '%@chamber-a.in' OR email LIKE '%@chamber-b.in' OR email LIKE '%@goalaw.edu.in'")


def seed_demo_users(conn: sqlite3.Connection) -> None:
    """Insert any missing demo account (each with its own password from app.demo_accounts)."""
    passwords = demo_passwords()
    for user_id, email, name, role, (org_id, org_name, plan), fp, last_seen in DEMO_USERS:
        conn.execute(
            """
            INSERT OR IGNORE INTO users (user_id, email, password_hash, name, role, org_id, org_name, org_plan, key_fingerprint, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, email, hash_password(passwords[user_id]), name, role, org_id, org_name, plan, fp, last_seen),
        )


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


def _seed_demo_data(conn: sqlite3.Connection, restore_baseline: bool = False) -> None:
    seed_demo_users(conn)

    existing = conn.execute("SELECT COUNT(*) FROM matters").fetchone()[0]
    today = date(2026, 11, 13)
    d1 = date(2026, 12, 24)
    d2 = date(2027, 2, 2)
    d4 = date(2027, 1, 18)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if existing == 0 or restore_baseline:  # restore_baseline: demo reset re-creates baseline matters a user deleted
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
            INSERT OR IGNORE INTO matters (id, org_id, title, case_type, status, priority, next_deadline, days_left, forum_hint, client_language, created_by, updated_at)
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
        for doc_id, matter_id, fname, kind, fpath in demo_docs:
            text, pages = _extract_doc_text_for_seed(fpath)
            conn.execute(
                """
                INSERT OR IGNORE INTO documents (id, matter_id, filename, kind, pages, storage_path, extracted_text, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (doc_id, matter_id, fname, kind, pages, str(fpath), text, json.dumps({"fictional": True}), now_iso),
            )

    conn.execute("UPDATE matters SET moot = 1 WHERE id = 'mat_001'")

    # Ensure Chamber B isolated demo matter exists even on pre-existing insaaf.db
    mat4 = conn.execute("SELECT id FROM matters WHERE id = 'mat_004'").fetchone()
    if not mat4:
        conn.execute(
            """
            INSERT OR IGNORE INTO matters (id, org_id, title, case_type, status, priority, next_deadline, days_left, forum_hint, client_language, created_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "mat_004",
                "org_chamber_b",
                "Salgaocar Logistics v. Mandovi Marine — demurrage ₹18.5L (FICTIONAL)",
                "civil_recovery",
                "ready",
                0.78,
                d4.isoformat(),
                (d4 - today).days,
                "Commercial Court, Panaji",
                "en",
                "senior_b",
                "2026-11-13T11:00:00Z",
            ),
        )
        m4_path = DEMO_DIR / "matters" / "mat_002" / "shetty_traders_invoices_fictional.docx"
        text4, pages4 = _extract_doc_text_for_seed(m4_path)
        conn.execute(
            """
            INSERT OR IGNORE INTO documents (id, matter_id, filename, kind, pages, storage_path, extracted_text, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "doc_docx_04",
                "mat_004",
                "salgaocar_demurrage_invoices_fictional.docx",
                "docx",
                pages4,
                str(m4_path),
                text4,
                json.dumps({"fictional": True, "org_id": "org_chamber_b"}),
                now_iso,
            ),
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
        for actor, role, m_id, ep, ts in [
            ("Adv. Dhanshri", "senior", "mat_001", "GET /matters/mat_001/draft", "2026-11-13T10:20:00Z"),
            ("Adv. Kanak", "junior", "mat_002", "GET /matters/mat_002/statute-clock", "2026-11-13T10:35:00Z"),
            ("R. Sawant", "clerk", "mat_003", "GET /matters/mat_003/facts", "2026-11-13T09:15:00Z"),
        ]:
            conn.execute(
                "INSERT INTO access_logs (org_id, actor, role, matter_id, endpoint, at) VALUES ('org_chamber_a', ?, ?, ?, ?, ?)",
                (actor, role, m_id, ep, ts),
            )

    _seed_baseline_locality(conn)
    _seed_extra_matters(conn, restore_baseline)


_BASELINE_LOCALITY = {
    # id: (state, district, court_seat, cause_date, client, opposite)
    "mat_001": ("Goa", "Mapusa", "Goa", "2013-01-07", "Fernandes family", "Naik"),
    "mat_002": ("Goa", "Panaji", "Goa", "2024-02-02", "Shetty Traders", "Kamat Distributors"),
    "mat_003": ("Goa", "Mapusa", "Goa", "2025-06-01", "R. Gaonkar", "State of Goa"),
    "mat_004": ("Goa", "Panaji", "Goa", "2024-01-18", "Salgaocar Logistics", "Mandovi Marine"),
}


def _seed_baseline_locality(conn: sqlite3.Connection) -> None:
    for mid, (st, dist, seat, cause, client, opp) in _BASELINE_LOCALITY.items():
        conn.execute(
            """UPDATE matters SET state = COALESCE(state, ?), district = COALESCE(district, ?), court_seat = COALESCE(court_seat, ?),
               cause_date = COALESCE(cause_date, ?), client_name = COALESCE(client_name, ?), opposite_party = COALESCE(opposite_party, ?)
               WHERE id = ?""",
            (st, dist, seat, cause, client, opp, mid),
        )
    conn.execute("UPDATE matters SET created_by = 'junior_2' WHERE id = 'mat_002' AND created_by NOT IN (SELECT user_id FROM users)")


def _seed_extra_matters(conn: sqlite3.Connection, restore_baseline: bool = False) -> None:
    """Load demo/seed/matters.json: fictional matters across every practice area and both chambers."""
    seed_path = DEMO_DIR / "seed" / "matters.json"
    if not seed_path.exists():
        return
    docs_dir = DEMO_DIR / "seed" / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for m in json.loads(seed_path.read_text(encoding="utf-8")):
        if conn.execute("SELECT 1 FROM matters WHERE id = ?", (m["id"],)).fetchone():
            continue
        conn.execute(
            """
            INSERT INTO matters (id, org_id, title, case_type, status, priority, next_deadline, days_left, forum_hint, client_language,
                                 created_by, updated_at, state, district, court_seat, cause_date, client_name, opposite_party, summary, moot)
            VALUES (?, ?, ?, ?, ?, 0.5, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (m["id"], m["org_id"], m["title"], m["case_type"], m["status"], m["forum_hint"], m["client_language"], m["created_by"],
             m["updated_at"], m["state"], m["district"], m["court_seat"], m["cause_date"], m["client_name"], m["opposite_party"],
             m["summary"], 1 if m.get("moot") else 0),
        )
        for i, doc in enumerate(m.get("documents", []), start=1):
            path = docs_dir / f"{m['id']}_{doc['filename']}"
            if not path.exists():
                path.write_text(doc["text"], encoding="utf-8")
            conn.execute(
                "INSERT OR IGNORE INTO documents (id, matter_id, filename, kind, pages, storage_path, extracted_text, metadata_json, created_at) VALUES (?, ?, ?, 'text', 1, ?, ?, ?, ?)",
                (f"doc_{m['id']}_{i}", m["id"], doc["filename"], str(path), doc["text"], json.dumps({"fictional": True}), now_iso),
            )
        if m.get("voice"):
            v = {**m["voice"], "duration_range": "00:00-00:18", "status": "transcribed", "engine": "seeded transcript"}
            path = docs_dir / f"{m['id']}_client_voice_note.json"
            if not path.exists():
                path.write_text(json.dumps(v, ensure_ascii=False), encoding="utf-8")
            conn.execute(
                "INSERT OR IGNORE INTO documents (id, matter_id, filename, kind, pages, storage_path, extracted_text, metadata_json, created_at) VALUES (?, ?, ?, 'audio', 1, ?, ?, ?, ?)",
                (f"doc_{m['id']}_voice", m["id"], f"client_voice_note_{m['client_language']}.json", str(path), json.dumps(v, ensure_ascii=False), json.dumps({"fictional": True}), now_iso),
            )
        if m.get("flags"):
            conn.execute(
                "INSERT OR REPLACE INTO stage_results (matter_id, stage, payload_json, elapsed_ms, updated_at) VALUES (?, 'urgency_flags', ?, 0, ?)",
                (m["id"], json.dumps(m["flags"]), now_iso),
            )
    _seed_activity(conn)


_ACTIVITY = [
    # (org, actor, role, matter, action, target, target_id, reason, note, at)
    ("org_chamber_a", "junior_1", "junior", "mat_005", "edit", "fact", "fact_02", "wrong_fact", "Postal tracking confirms delivery on 08 Sep 2026", "2026-11-12T09:14:00Z"),
    ("org_chamber_a", "senior_1", "senior", "mat_012", "override", "advice", "advice", "other", "Client prefers to contest; civil nature of dispute", "2026-11-12T11:02:00Z"),
    ("org_chamber_a", "junior_2", "junior", "mat_006", "submit", "draft", "draft", "other", "Consumer complaint ready for senior review", "2026-11-12T15:40:00Z"),
    ("org_chamber_a", "senior_1", "senior", "mat_009", "approve", "draft", "draft", "other", "MACT claim approved for filing", "2026-11-13T07:55:00Z"),
    ("org_chamber_a", "junior_1", "junior", "mat_013", "edit", "fact", "fact_03", "wrong_fact", "Arrears re-computed from comunidade ledger", "2026-11-13T09:10:00Z"),
    ("org_chamber_b", "senior_b", "senior", "mat_021", "override", "score", "score", "score_disagree", "Non-starter report strengthens the claim", "2026-11-13T10:30:00Z"),
    ("org_chamber_b", "junior_b", "junior", "mat_024", "submit", "draft", "draft", "other", "Bail application on parity ready", "2026-11-13T12:05:00Z"),
]


def _seed_activity(conn: sqlite3.Connection) -> None:
    """A realistic trail of reviews in both chambers, appended to the hash chain."""
    for org, actor, role, mid, action, target, tid, reason, note, at in _ACTIVITY:
        eid = f"led_seed_{mid}_{action}"
        if conn.execute("SELECT 1 FROM ledger_entries WHERE id = ?", (eid,)).fetchone():
            continue
        prev = conn.execute("SELECT hash FROM ledger_entries ORDER BY seq DESC LIMIT 1").fetchone()
        prev_hash = prev["hash"] if prev else "GENESIS"
        h = compute_entry_hash(prev_hash, eid, actor, role, mid, action, target, tid, reason, note, at)
        conn.execute(
            """INSERT INTO ledger_entries (id, org_id, actor, role, matter_id, action, target, target_id, reason_code, note, diff_json, at, hash, prev_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)""",
            (eid, org, actor, role, mid, action, target, tid, reason, note, at, h, prev_hash),
        )
    names = {u[0]: u[2] for u in DEMO_USERS}
    if conn.execute("SELECT COUNT(*) FROM access_logs").fetchone()[0] < 10:
        for org, actor, role, mid, action, target, tid, reason, note, at in _ACTIVITY:
            conn.execute(
                "INSERT INTO access_logs (org_id, actor, role, matter_id, endpoint, at) VALUES (?, ?, ?, ?, ?, ?)",
                (org, names.get(actor, actor), role, mid, f"POST /matters/{mid}/reviews", at),
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


def clear_stage_results(matter_id: str, db_path: Path | None = None) -> int:
    """Drop every cached stage output for a matter so the next read recomputes from current documents.

    Human overrides remain in the review ledger; they are re-applied by re-reviewing, not silently
    carried onto analysis of different evidence.
    """
    with db_session(db_path) as conn:
        cur = conn.execute("DELETE FROM stage_results WHERE matter_id = ?", (matter_id,))
        conn.execute(
            "UPDATE matters SET status = 'draft' WHERE id = ? AND status IN ('approved', 'in_review', 'running')",
            (matter_id,),
        )
        return cur.rowcount


def get_stage_result(matter_id: str, stage: str, db_path: Path | None = None) -> Any | None:
    with db_session(db_path) as conn:
        row = conn.execute(
            "SELECT payload_json FROM stage_results WHERE matter_id = ? AND stage = ?",
            (matter_id, stage),
        ).fetchone()
        if not row:
            return None
        return json.loads(row["payload_json"])


def log_access(
    actor: str,
    role: str,
    matter_id: str,
    endpoint: str,
    db_path: Path | None = None,
    org_id: str = "org_chamber_a",
) -> None:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_session(db_path) as conn:
        conn.execute(
            "INSERT INTO access_logs (org_id, actor, role, matter_id, endpoint, at) VALUES (?, ?, ?, ?, ?, ?)",
            (org_id, actor, role, matter_id, endpoint, now_iso),
        )

