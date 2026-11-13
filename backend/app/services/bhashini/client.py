"""Insaaf Translate: client-statement transcription and translation for 12 Indian languages.

Speech: Whisper large-v3 (Groq), Gemini multimodal as fallback.
Text:   LLM translation (Groq, then Gemini) with a Goa land-law glossary, then the keyless
        Google Translate endpoint as a last resort. Nothing here ever invents a statement:
        when every engine fails the result is marked "pending" with an empty translation.

(The module keeps its historical path so existing imports keep working; no Bhashini key is used.)
"""
from __future__ import annotations

import json
import re
import urllib.parse
from pathlib import Path
from typing import Any

import httpx

from app.config import settings
from app.registry import language_label
from app.services.llm.client import llm_client

AUDIO_MIME_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
}

# Google Translate codes where they differ from ours.
_GTX_CODE = {"kok": "gom"}

GOA_LAND_GLOSSARY = {
    "मुंडकार": "mundkar",
    "भाटकार": "bhatkar",
    "कोमुनिदाद": "comunidade",
    "फॉर्म i & xiv": "Form I & XIV",
    "फॉर्म 1 & 14": "Form I & XIV",
}


def _glossary(text: str) -> str:
    out = text
    for src, dst in GOA_LAND_GLOSSARY.items():
        out = re.sub(re.escape(src), dst, out, flags=re.IGNORECASE)
    return out


# Legally decisive Konkani / Marathi land terms. Getting these backwards flips who owns the land.
TERM_HINTS = (
    "Glossary (keep these meanings exactly): भाटकार / bhatkar = landlord who owns the land; "
    "मुंडकार / mundkar = occupant-tenant protected under the Goa Mundkars Act living on the bhatkar's land; "
    "कोमुनिदाद / comunidade = village land association; राबता / रावता = lives / resides; "
    "जमनीर = on the land; घर = house; भाडें = rent; Form I & XIV = Goa record of rights."
)
LOW_RESOURCE = {"kok"}  # translation quality is lower: always ask the advocate to verify


class TranslationClient:
    engine_name = "Insaaf Translate"

    async def ping(self) -> str:
        return "ok" if (settings.groq_api_key or settings.gemini_api_key) else "degraded"

    async def _gtx(self, text: str, source: str, target: str) -> str:
        try:
            sl = _GTX_CODE.get(source, source or "auto")
            tl = _GTX_CODE.get(target, target)
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={sl}&tl={tl}&dt=t&q={urllib.parse.quote(text)}"
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(url)
            if r.status_code == 200:
                data = r.json()
                return "".join(seg[0] for seg in data[0] if seg and seg[0]).strip()
        except Exception:
            pass
        return ""

    async def translate(self, text: str, source_lang: str = "auto", target_lang: str = "en") -> dict[str, Any]:
        """Translate text. Returns {text, engine, confidence}; text is '' if every engine failed."""
        text = (text or "").strip()
        if not text:
            return {"text": "", "engine": "none", "confidence": "low"}
        if source_lang == target_lang:
            return {"text": text, "engine": "identity", "confidence": "high"}
        src_name = language_label(source_lang) if source_lang != "auto" else "the source language"
        tgt_name = language_label(target_lang)
        prompt = (
            f"Translate this client statement from {src_name} into {tgt_name} for an Indian advocate's file. "
            "Keep names, dates, amounts, survey numbers and Goa land-law terms (mundkar, bhatkar, comunidade, "
            "Form I & XIV) unchanged. Return only the translation, no commentary.\n"
            + (TERM_HINTS + "\n" if source_lang in ("kok", "mr", "auto") else "")
            + "\n" + text
        )
        try:
            out = await llm_client.generate_text(prompt, max_tokens=900, timeout=20.0)
            if out:
                conf = "medium" if source_lang in LOW_RESOURCE else "high"
                return {"text": _glossary(out.strip()), "engine": llm_client.last_model or "llm", "confidence": conf}
        except Exception:
            pass
        out = await self._gtx(text, source_lang, target_lang)
        if out:
            return {"text": _glossary(out), "engine": "google-translate", "confidence": "medium"}
        return {"text": "", "engine": "none", "confidence": "low"}

    async def translate_or_transcribe(
        self,
        file_path: Path | None = None,
        text: str | None = None,
        source_lang: str = "kok",
        audio_bytes: bytes | None = None,
        mime: str | None = None,
    ) -> dict[str, Any]:
        # 1. Prepared voice-note fixture (transcript already on file).
        if file_path and file_path.suffix.lower() == ".json" and file_path.exists():
            data = json.loads(file_path.read_text(encoding="utf-8"))
            orig = data.get("original_text", "")
            eng = data.get("english_translation", "")
            if orig and not eng:
                eng = (await self.translate(orig, data.get("language", source_lang)))["text"]
            return {
                "language": data.get("language", source_lang),
                "original_text": orig,
                "english_translation": eng,
                "translation_confidence": data.get("translation_confidence", "medium"),
                "duration_range": data.get("duration_range", "00:00-00:24"),
                "status": "transcribed" if eng else "pending",
            }

        # 2. Typed / pasted statement.
        if text:
            tr = await self.translate(text, source_lang)
            return {
                "language": source_lang,
                "original_text": text,
                "english_translation": tr["text"],
                "translation_confidence": tr["confidence"],
                "engine": tr["engine"],
                "status": "transcribed" if tr["text"] else "pending",
            }

        # 3. Audio recording.
        if audio_bytes is None and file_path and file_path.exists():
            audio_bytes = file_path.read_bytes()
            mime = mime or AUDIO_MIME_TYPES.get(file_path.suffix.lower(), "audio/webm")
        if audio_bytes:
            res = await llm_client.transcribe_audio(audio_bytes, mime or "audio/webm", source_lang)
            if res.get("no_speech"):
                return {"language": source_lang, "original_text": "", "english_translation": "", "translation_confidence": "low", "status": "no_speech"}
            if res.get("original_text"):
                return {
                    "language": res.get("language") or source_lang,
                    "original_text": res["original_text"],
                    "english_translation": _glossary(res.get("english_translation") or ""),
                    "translation_confidence": "high" if res.get("english_translation") else "low",
                    "engine": res.get("engine", "speech"),
                    "status": "transcribed",
                }
        return {"language": source_lang, "original_text": "", "english_translation": "", "translation_confidence": "low", "status": "pending"}


translation_client = TranslationClient()
# Historical name kept for existing imports.
bhashini_client = translation_client
