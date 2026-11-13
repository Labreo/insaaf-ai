"""Application configuration loaded from backend/.env with fallback to learning/.env."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        key = k.strip()
        val = v.strip().strip('"').strip("'")
        if key and key not in os.environ and val:
            os.environ[key] = val


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
RULES_DIR = REPO_ROOT / "rules"
ML_DIR = REPO_ROOT / "ml"
DEMO_DIR = REPO_ROOT / "demo"
UPLOADS_DIR = BACKEND_DIR / "uploads"

# Load backend/.env first, then fallback to /Users/sanjaywaradkar/learning/.env
_load_env_file(BACKEND_DIR / ".env")
_load_env_file(Path("/Users/sanjaywaradkar/learning/.env"))


@dataclass(frozen=True)
class Settings:
    kanoon_api_token: str = os.getenv("KANOON_API_TOKEN", "")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "") or os.getenv("LLM_API_KEY", "") or os.getenv("GOOGLE_AI_API_KEY", "")
    gemini_api_key_secondary: str = os.getenv("GEMINI_API_KEY_SECONDARY", "")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_base_url: str = os.getenv("ANTHROPIC_BASE_URL", "")
    serpapi_api_key: str = os.getenv("SERPAPI_API_KEY", "")
    serper_api_key: str = os.getenv("SERPER_API_KEY", "")
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    bhashini_user_id: str = os.getenv("BHASHINI_USER_ID", "")
    bhashini_api_key: str = os.getenv("BHASHINI_API_KEY", "")
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "")
    solana_rpc_url: str = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
    database_path: Path = BACKEND_DIR / "insaaf.db"
    demo_mode: bool = os.getenv("DEMO_MODE", "false").lower() == "true"
    kanoon_budget_ms: int = int(os.getenv("KANOON_BUDGET_MS", "8000"))
    # Single clock for limitation maths and seeded deadlines. Empty = real system date.
    demo_today: str = os.getenv("INSAAF_DEMO_TODAY", "")


def today():
    """The app's notion of 'today' (pinned via INSAAF_DEMO_TODAY for reproducible demos)."""
    from datetime import date

    if settings.demo_today:
        try:
            return date.fromisoformat(settings.demo_today)
        except ValueError:
            pass
    return date.today()


settings = Settings()

