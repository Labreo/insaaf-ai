"""Deadline & Nyaya Queue alert dispatch via Telegram Bot API."""
from __future__ import annotations

import httpx

from app.config import settings


class NotifyClient:
    async def send_deadline_alert(self, matter_id: str, title: str, days_left: int) -> bool:
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return False
        text = (
            f"⚖️ *Insaaf AI — Statute Clock Alert*\n"
            f"Matter: `{matter_id}` — {title}\n"
            f"Limitation remaining: *{days_left} days*"
        )
        try:
            url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.post(
                    url,
                    json={"chat_id": settings.telegram_chat_id, "text": text, "parse_mode": "Markdown"},
                )
                return r.status_code == 200
        except Exception:
            return False


notify_client = NotifyClient()

