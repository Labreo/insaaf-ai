"""Seeded demo accounts. Each account has its own password.

Passwords come from (in order):
  1. INSAAF_DEMO_PASSWORDS — JSON object {user_id: password} in the environment / backend/.env
  2. backend/.demo_credentials — JSON written on first seed (gitignored)
  3. freshly generated random passwords, which are then written to (2)

Nothing here is a real person or a real firm; domains live under the product's own
insaaf.in namespace so they cannot collide with a real chamber's mail.
"""
from __future__ import annotations

import json
import os
import secrets
from pathlib import Path

from app.config import BACKEND_DIR

CREDENTIALS_FILE = BACKEND_DIR / ".demo_credentials"

ORG_A = ("org_chamber_a", "Kamat & Associates — Mapusa, Goa", "chamber")
ORG_B = ("org_chamber_b", "Sardessai Commercial Chambers — Panaji", "chamber")

# user_id, email, name, role, (org_id, org_name, plan), key_fingerprint, last_seen
DEMO_USERS: list[tuple[str, str, str, str, tuple[str, str, str], str, str]] = [
    ("senior_1", "dhanshri.kamat@kamat-associates.insaaf.in", "Adv. Dhanshri Kamat", "senior", ORG_A, "aes256-cha-9f4a", "2026-11-13T10:20:00Z"),
    ("junior_1", "kanak.w@kamat-associates.insaaf.in", "Adv. Kanak W.", "junior", ORG_A, "aes256-cha-9f4a", "2026-11-13T10:35:00Z"),
    ("junior_2", "meera.prabhu@kamat-associates.insaaf.in", "Adv. Meera Prabhu", "junior", ORG_A, "aes256-cha-9f4a", "2026-11-13T08:50:00Z"),
    ("clerk_1", "rohan.sawant@kamat-associates.insaaf.in", "Rohan Sawant", "clerk", ORG_A, "aes256-cha-9f4a", "2026-11-13T09:15:00Z"),
    ("student_1", "sneha.dessai@moot.insaaf.in", "Sneha Dessai (Law Student)", "student", (ORG_A[0], ORG_A[1], "student"), "aes256-moot-3c1b", "2026-11-12T18:00:00Z"),
    ("senior_b", "pradeep.sardessai@sardessai-chambers.insaaf.in", "Adv. Pradeep Sardessai", "senior", ORG_B, "aes256-chb-7d2e", "2026-11-13T11:05:00Z"),
    ("junior_b", "imran.shaikh@sardessai-chambers.insaaf.in", "Adv. Imran Shaikh", "junior", ORG_B, "aes256-chb-7d2e", "2026-11-13T09:40:00Z"),
]

_WORDS = (
    "nyaya", "vidhi", "satya", "dharma", "mandovi", "zuari", "sahyadri", "konkan", "adalat", "vakil",
    "bench", "decree", "prayer", "writ", "appeal", "remand", "affidavit", "caveat", "summons", "decree",
)


def _generate() -> str:
    # Readable but unique, e.g. "Mandovi-Caveat-4821".
    a, b = secrets.choice(_WORDS), secrets.choice(_WORDS)
    return f"{a.capitalize()}-{b.capitalize()}-{secrets.randbelow(9000) + 1000}"


def demo_passwords() -> dict[str, str]:
    ids = [u[0] for u in DEMO_USERS]
    raw = os.getenv("INSAAF_DEMO_PASSWORDS", "").strip()
    if raw:
        try:
            env_map = json.loads(raw)
            if isinstance(env_map, dict) and all(i in env_map for i in ids):
                return {i: str(env_map[i]) for i in ids}
        except json.JSONDecodeError:
            pass
    stored: dict[str, str] = {}
    if CREDENTIALS_FILE.exists():
        try:
            stored = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8")).get("passwords", {})
        except Exception:
            stored = {}
    changed = False
    for i in ids:
        if not stored.get(i):
            stored[i] = _generate()
            changed = True
    if changed:
        payload = {
            "note": "Demo-only credentials for seeded Insaaf accounts. Gitignored. Delete this file to rotate.",
            "accounts": {u[0]: {"email": u[1], "name": u[2], "role": u[3]} for u in DEMO_USERS},
            "passwords": stored,
        }
        try:
            CREDENTIALS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            os.chmod(CREDENTIALS_FILE, 0o600)
        except OSError:
            pass
    return {i: stored[i] for i in ids}


def credentials_path() -> Path:
    return CREDENTIALS_FILE
