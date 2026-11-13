"""Password hashing and signed session tokens.

No database access here, so both ``app.db`` (seeding) and ``app.auth`` (request
authentication) can import it without a cycle.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

from app.config import BACKEND_DIR

PBKDF2_ITERATIONS = int(os.getenv("INSAAF_PBKDF2_ITERATIONS", "150000"))
SESSION_TTL_SECONDS = int(os.getenv("INSAAF_SESSION_TTL_SECONDS", str(8 * 3600)))
_SECRET_FILE = BACKEND_DIR / ".auth_secret"
_LEGACY_SALT_PREFIX = "insaaf_salt|"


def _load_signing_secret() -> bytes:
    """Signing key: INSAAF_AUTH_SECRET (>= 32 chars) or a random key persisted to backend/.auth_secret.

    There is deliberately no hardcoded fallback: a known key would let anyone forge tokens.
    """
    env = os.getenv("INSAAF_AUTH_SECRET", "")
    if len(env) >= 32:
        return env.encode("utf-8")
    try:
        if _SECRET_FILE.exists():
            stored = _SECRET_FILE.read_bytes().strip()
            if len(stored) >= 32:
                return stored
        fresh = secrets.token_hex(32).encode("ascii")
        _SECRET_FILE.write_bytes(fresh)
        os.chmod(_SECRET_FILE, 0o600)
        return fresh
    except OSError:
        # Read-only filesystem: sessions will not survive a restart, which is safe.
        return secrets.token_hex(32).encode("ascii")


_SIGNING_SECRET = _load_signing_secret()


# ---------------------------------------------------------------- passwords


def hash_password(password: str, *, iterations: int = PBKDF2_ITERATIONS) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(
        iterations,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(dk).decode("ascii"),
    )


def verify_password(password: str, stored_hash: str) -> bool:
    """Constant-time check. Accepts PBKDF2 hashes and the legacy salted-SHA-256 format (rehashed on login)."""
    if not password or not stored_hash:
        return False
    try:
        if stored_hash.startswith("pbkdf2_sha256$"):
            _, iterations, salt_b64, dk_b64 = stored_hash.split("$", 3)
            dk = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), base64.b64decode(salt_b64), int(iterations)
            )
            return hmac.compare_digest(dk, base64.b64decode(dk_b64))
        legacy = hashlib.sha256((_LEGACY_SALT_PREFIX + password).encode("utf-8")).hexdigest()
        return hmac.compare_digest(legacy, stored_hash)
    except (ValueError, TypeError):
        return False


def needs_rehash(stored_hash: str) -> bool:
    return not stored_hash.startswith(f"pbkdf2_sha256${PBKDF2_ITERATIONS}$")


# A real hash of a random string, so unknown-account logins cost the same as wrong-password logins.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_hex(16))


# ---------------------------------------------------------------- tokens


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def sign_token(session_id: str, user_id: str, issued_at: int, expires_at: int) -> str:
    payload = _b64(
        json.dumps(
            {"sid": session_id, "sub": user_id, "iat": issued_at, "exp": expires_at},
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    )
    signing_input = f"v1.{payload}"
    sig = _b64(hmac.new(_SIGNING_SECRET, signing_input.encode("ascii"), hashlib.sha256).digest())
    return f"{signing_input}.{sig}"


class TokenError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def decode_token(token: str, *, now: int | None = None) -> dict[str, Any]:
    """Verify signature and expiry. Raises TokenError; never returns unverified data."""
    try:
        version, payload, sig = token.split(".")
    except ValueError as exc:
        raise TokenError("invalid_token", "Malformed session token.") from exc
    if version != "v1":
        raise TokenError("invalid_token", "Unsupported session token version.")
    expected = _b64(hmac.new(_SIGNING_SECRET, f"v1.{payload}".encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise TokenError("invalid_token", "Session token signature is invalid.")
    try:
        data = json.loads(_unb64(payload))
        sid, sub, exp = str(data["sid"]), str(data["sub"]), int(data["exp"])
    except (ValueError, KeyError, TypeError) as exc:
        raise TokenError("invalid_token", "Session token payload is invalid.") from exc
    if (now if now is not None else int(time.time())) >= exp:
        raise TokenError("session_expired", "Session expired. Sign in again.")
    return {"sid": sid, "sub": sub, "exp": exp, "iat": int(data.get("iat", 0))}


def token_fingerprint(token: str) -> str:
    """Short, non-reversible identifier safe to show in the UI or logs."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]
