"""Request authentication, sessions, and the role permission matrix.

Every protected route takes ``actor: dict = Depends(get_actor)``. The actor is
resolved per request from a signed, expiring Bearer token whose session row must
still exist and be unrevoked. Role and organisation always come from the users
table, never from client-supplied headers or token claims.
"""
from __future__ import annotations

import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Header, HTTPException

from app.db import db_session
from app.security import (
    SESSION_TTL_SECONDS,
    TokenError,
    decode_token,
    sign_token,
    token_fingerprint,
)

ROLES = ("senior", "junior", "clerk", "student")

# Permission matrix. Enforced in the backend; the frontend only mirrors it for UX.
PERMISSIONS: dict[str, frozenset[str]] = {
    "matter.read": frozenset({"senior", "junior", "clerk", "student"}),
    "matter.create": frozenset({"senior", "junior", "clerk"}),
    "matter.delete": frozenset({"senior"}),
    "document.upload": frozenset({"senior", "junior", "clerk"}),
    "document.delete": frozenset({"senior", "junior"}),
    "queue.flag": frozenset({"senior", "junior", "clerk"}),
    # Runs or mutates analysis (pipeline, clock recalculation, search, citation checks, court, draft type, verified insertions).
    "analysis.run": frozenset({"senior", "junior"}),
    "draft.export": frozenset({"senior", "junior", "clerk"}),
    "review.edit": frozenset({"senior", "junior"}),
    "review.delete": frozenset({"senior", "junior"}),  # the UI checks review.<action>
    "review.submit": frozenset({"senior", "junior"}),
    "review.override": frozenset({"senior"}),
    "review.approve": frozenset({"senior"}),
    "alerts.test": frozenset({"senior", "junior"}),
    "ledger.tamper": frozenset({"senior"}),
    "ml.retrain": frozenset({"senior"}),
    "demo.reset": frozenset({"senior"}),
    # Matter record editing: full edit for advocates, metadata-only (court, district, language, parties) for clerks.
    "matter.edit": frozenset({"senior", "junior"}),
    "matter.edit_meta": frozenset({"senior", "junior", "clerk"}),
    "org.manage": frozenset({"senior"}),
}

REVIEW_ACTION_PERMISSION = {
    "edit": "review.edit",
    "delete": "review.delete",
    "submit": "review.submit",
    "override": "review.override",
    "approve": "review.approve",
}


def _http_error(status: int, code: str, message: str) -> HTTPException:
    headers = {"WWW-Authenticate": 'Bearer realm="insaaf"'} if status == 401 else None
    return HTTPException(status_code=status, detail={"error": {"code": code, "message": message}}, headers=headers)


def require(actor: dict[str, Any], permission: str) -> None:
    allowed = PERMISSIONS[permission]
    if actor["role"] not in allowed:
        raise _http_error(
            403,
            "forbidden_role",
            f"Role '{actor['role']}' is not permitted to perform '{permission}'.",
        )


def can(role: str, permission: str) -> bool:
    return role in PERMISSIONS[permission]


def permissions_for(role: str) -> list[str]:
    return sorted(p for p, roles in PERMISSIONS.items() if role in roles)


# ---------------------------------------------------------------- sessions


def create_session(user: dict[str, Any]) -> dict[str, Any]:
    now = int(time.time())
    expires_at = now + SESSION_TTL_SECONDS
    sid = secrets.token_urlsafe(24)
    with db_session() as conn:
        conn.execute(
            "INSERT INTO sessions (sid, user_id, org_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)",
            (sid, user["user_id"], user["org_id"], now, expires_at),
        )
        conn.execute(
            "UPDATE users SET last_seen = ? WHERE user_id = ?",
            (datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), user["user_id"]),
        )
    token = sign_token(sid, user["user_id"], now, expires_at)
    return {"token": token, "sid": sid, "expires_at": expires_at}


def revoke_session(sid: str) -> None:
    with db_session() as conn:
        conn.execute("UPDATE sessions SET revoked_at = ? WHERE sid = ? AND revoked_at IS NULL", (int(time.time()), sid))


def revoke_all_sessions(user_id: str) -> None:
    with db_session() as conn:
        conn.execute("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", (int(time.time()), user_id))


def resolve_token(token: str) -> dict[str, Any]:
    try:
        claims = decode_token(token)
    except TokenError as exc:
        raise _http_error(401, exc.code, exc.message) from exc
    with db_session() as conn:
        row = conn.execute(
            """
            SELECT s.sid, s.user_id AS session_user, s.org_id AS session_org, s.expires_at, s.revoked_at, u.*
            FROM sessions s JOIN users u ON u.user_id = s.user_id
            WHERE s.sid = ?
            """,
            (claims["sid"],),
        ).fetchone()
    if row is None or row["session_user"] != claims["sub"]:
        raise _http_error(401, "invalid_session", "Session not found. Sign in again.")
    if row["revoked_at"] is not None:
        raise _http_error(401, "session_revoked", "Session was signed out. Sign in again.")
    if int(row["expires_at"]) <= int(time.time()):
        raise _http_error(401, "session_expired", "Session expired. Sign in again.")
    if row["session_org"] != row["org_id"]:
        # The account moved chambers after this session was issued.
        raise _http_error(401, "invalid_session", "Session no longer matches the account's chamber. Sign in again.")
    actor = {
        "user_id": row["user_id"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "org_id": row["org_id"],
        "org_name": row["org_name"],
        "org_plan": row["org_plan"],
        "key_fingerprint": row["key_fingerprint"],
        "session_id": row["sid"],
        "session_expires_at": int(row["expires_at"]),
        "session_fingerprint": token_fingerprint(token),
    }
    return actor


def get_actor(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    """FastAPI dependency: the authenticated actor for this request, or 401."""
    if not authorization:
        raise _http_error(401, "not_authenticated", "Sign in required.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _http_error(401, "not_authenticated", "Bearer token required.")
    return resolve_token(token.strip())


# ---------------------------------------------------------------- login throttling


class LoginThrottle:
    """Per-identifier failed-attempt limiter. Process-local; a shared store is needed for multiple workers."""

    def __init__(self, max_failures: int = 5, window_seconds: int = 300):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> list[float]:
        return [t for t in self._failures.get(key, []) if now - t < self.window_seconds]

    def blocked(self, key: str) -> bool:
        with self._lock:
            now = time.time()
            recent = self._recent(key, now)
            self._failures[key] = recent
            return len(recent) >= self.max_failures

    def fail(self, key: str) -> None:
        with self._lock:
            now = time.time()
            self._failures[key] = self._recent(key, now) + [now]

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._failures.clear()
            else:
                self._failures.pop(key, None)


login_throttle = LoginThrottle()
