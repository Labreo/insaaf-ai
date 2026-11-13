"""Shared test setup: isolated SQLite DB per test, fast password hashing, login helpers."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Must be set before app.security is imported: keeps PBKDF2 fast in tests only.
os.environ.setdefault("INSAAF_PBKDF2_ITERATIONS", "2000")

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


# Each seeded account has its own password; tests pin them so they are deterministic.
DEMO_PASSWORDS = {
    "senior_1": "Test-Senior-1001",
    "junior_1": "Test-Junior-1002",
    "junior_2": "Test-Junior-1003",
    "clerk_1": "Test-Clerk-1004",
    "student_1": "Test-Student-1005",
    "senior_b": "Test-SeniorB-1006",
    "junior_b": "Test-JuniorB-1007",
}
os.environ["INSAAF_DEMO_PASSWORDS"] = __import__("json").dumps(DEMO_PASSWORDS)
DEMO_PASSWORD = DEMO_PASSWORDS["senior_1"]


def pytest_addoption(parser):
    parser.addoption("--run-slow", action="store_true", default=False, help="run tests that compute live analysis stages")


def pytest_configure(config):
    config.addinivalue_line("markers", "slow: computes live analysis stages over the network; skipped unless --run-slow")


def pytest_collection_modifyitems(config, items):
    if config.getoption("--run-slow"):
        return
    skip = pytest.mark.skip(reason="slow: needs --run-slow (live Kanoon/LLM stage computation)")
    for item in items:
        if "slow" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def _fresh_db(tmp_path, monkeypatch):
    from dataclasses import replace

    import app.api.routes as routes_mod
    import app.config as cfg
    import app.db as db_mod
    import app.services.kanoon.client as kc_mod
    from app.auth import login_throttle

    test_db = tmp_path / "test_insaaf.db"
    new_settings = replace(cfg.settings, database_path=test_db, demo_mode=True)
    monkeypatch.setattr(cfg, "settings", new_settings)
    monkeypatch.setattr(db_mod, "settings", new_settings)
    monkeypatch.setattr(kc_mod, "settings", new_settings)
    monkeypatch.setattr(routes_mod, "UPLOADS_DIR", tmp_path / "uploads")
    login_throttle.reset()
    db_mod.init_db(test_db)
    yield
    login_throttle.reset()


def login(client, user_id: str, password: str | None = None) -> dict[str, str]:
    res = client.post("/v1/auth/login", json={"user_id": user_id, "password": password or DEMO_PASSWORDS[user_id]})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}
