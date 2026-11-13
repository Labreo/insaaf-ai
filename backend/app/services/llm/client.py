"""Gemini LLM client with Concentrate/Anthropic fallback and Authority Lock verification."""
from __future__ import annotations

import base64
import hashlib
import json
import re
import time
from typing import Any

import httpx

from app.config import settings


def _normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", s.lower())).strip()



_PROPOSITION_STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "by", "to", "for", "and", "or", "is", "are", "was", "be", "been", "that",
    "this", "it", "as", "at", "with", "from", "held", "holds", "court", "supreme", "high", "case", "judgment",
    "per", "para", "paragraph", "vs", "v", "scc", "air", "scr", "bom", "can", "may", "must", "has", "have",
    "under", "which", "where", "its", "their", "any", "such", "law", "laid", "down", "observed", "ruled",
}
_NEGATIONS = {"not", "no", "never", "cannot", "without", "neither", "nor", "nothing", "none"}


def _content_tokens(text: str) -> list[str]:
    # _normalize_text turns "doesn't" into "doesn t"; restore the negation before tokenising.
    text = re.sub(r"n t\b", " not", text.replace("n't", " not")).replace("cannot", "can not")
    toks = re.findall(r"[a-z]+", text)
    return [t[:-1] if len(t) > 4 and t.endswith("s") else t for t in toks]


def _proposition_conflict(norm_input: str, title_norm: str, raw_snippet: str) -> str | None:
    """Return a rejection message if the claim around a case name is unsupported by or negates the stored paragraph."""
    title_toks = set(_content_tokens(title_norm))
    claim = [t for t in _content_tokens(norm_input) if t not in title_toks and t not in _PROPOSITION_STOPWORDS]
    claim_terms = [t for t in claim if t not in _NEGATIONS]
    if len(claim_terms) < 4 or not raw_snippet.strip():
        return None  # bare citation (case name / reporter only): nothing to check
    snippet_set = set(_content_tokens(_normalize_text(raw_snippet)))
    support = sum(1 for t in claim_terms if t in snippet_set) / len(claim_terms)
    if support < 0.5:
        return "Claim not supported by the stored paragraph of this authority."
    # Compare polarity against the single stored sentence that best matches the claim.
    sentences = [_content_tokens(_normalize_text(x)) for x in re.split(r"[.;]\s+", raw_snippet) if x.strip()]
    best = max(sentences, key=lambda toks: len(set(toks) & set(claim_terms)))
    claim_negated = any(t in _NEGATIONS for t in claim)
    holding_negated = any(t in _NEGATIONS for t in best)
    if claim_negated != holding_negated:
        return "Claim contradicts the stored holding of this authority."
    return None

_FACT_STATUSES = ("alleged", "documented", "disputed", "unknown")


def _coerce_confidence(value: Any) -> str:
    """Map LLM/Bhashini confidence (float 0-1, numeric string, or label) onto 'high'|'medium'|'low'."""
    if isinstance(value, str):
        label = value.strip().lower()
        if label in ("high", "medium", "low"):
            return label
        try:
            value = float(label)
        except ValueError:
            return "medium"
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return "medium"
    score = float(value)
    if score > 1.0:  # percentage form, e.g. 92
        score /= 100.0
    if score >= 0.8:
        return "high"
    if score >= 0.5:
        return "medium"
    return "low"


def normalize_fact_cards(facts: Any) -> list[dict[str, Any]]:
    """Force fact cards into the `Fact` response schema so one malformed LLM field cannot 500 GET /facts."""
    if not isinstance(facts, list):
        return []
    out: list[dict[str, Any]] = []
    for idx, item in enumerate(facts, start=1):
        if not isinstance(item, dict):
            continue
        statement = str(item.get("statement") or "").strip()
        if not statement:
            continue
        status = item.get("status")
        src = item.get("source")
        source = None
        if isinstance(src, dict) and src.get("document_id"):
            source = {"document_id": str(src["document_id"]), "location": str(src.get("location") or "unspecified")}
        orig = item.get("original")
        original = None
        if isinstance(orig, dict) and (orig.get("text") or "").strip():
            original = {
                "language": str(orig.get("language") or "und"),
                "text": str(orig["text"]),
                "translation_confidence": _coerce_confidence(orig.get("translation_confidence")),
            }
        out.append(
            {
                **item,
                "id": str(item.get("id") or f"fact_{idx:02d}"),
                "statement": statement,
                "status": status if status in _FACT_STATUSES else "alleged",
                "source": source,
                "original": original,
            }
        )
    return out

class LLMClient:
    """Gemini client: runtime model discovery, header auth, 429 cool-down, SQLite response cache."""

    # Preference order. Filtered at first use against the live model list for this key.
    PREFERRED = (
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-3-flash-preview",
        "gemini-flash-latest",
        "gemini-2.5-flash",
    )
    TRANSCRIBE_PREFERRED = ("gemini-3.5-transcribe", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash")
    GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
    GROQ_BASE = "https://api.groq.com/openai/v1"
    GROQ_MODELS = ("openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b")
    GROQ_WHISPER = ("whisper-large-v3-turbo", "whisper-large-v3")

    def __init__(self) -> None:
        self._available: set[str] | None = None
        self._cooldown: dict[str, float] = {}
        self.last_model: str | None = None
        self.calls = 0
        self.cache_hits = 0

    # ---- plumbing -------------------------------------------------------
    @staticmethod
    def _keys() -> list[str]:
        return [k for k in (settings.gemini_api_key, settings.gemini_api_key_secondary) if k]

    async def _discover(self) -> set[str]:
        if self._available is not None:
            return self._available
        found: set[str] = set()
        for key in self._keys():
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    r = await client.get(self.GEMINI_BASE, params={"pageSize": 200}, headers={"x-goog-api-key": key})
                if r.status_code == 200:
                    for m in r.json().get("models", []):
                        if "generateContent" in m.get("supportedGenerationMethods", []):
                            found.add(m["name"].split("/", 1)[-1])
                    break
            except Exception:
                continue
        # Discovery failure (offline) must not disable the client: fall back to the preference list.
        self._available = found or set(self.PREFERRED)
        return self._available

    async def _models(self, preferred: tuple[str, ...], kind: str = "text") -> list[str]:
        avail = await self._discover()
        now = time.time()
        return [m for m in preferred if m in avail and self._cooldown.get(f"{kind}:{m}", 0) < now]

    def _penalise(self, kind: str, model: str, status: int, body: str) -> None:
        low = body.lower()
        if status == 404 and "no longer available" in low:
            secs = 86400.0  # retired for this key
        elif status == 429 and ("perday" in low or "per_day" in low or "free_tier_requests" in low):
            secs = 3600.0  # daily free-tier bucket exhausted
        elif status == 429:
            secs = 60.0  # per-minute limit
        else:
            secs = 15.0  # transient (empty-body 404s are seen intermittently)
        self._cooldown[f"{kind}:{model}"] = time.time() + secs

    @staticmethod
    def _cache_key(kind: str, payload: Any) -> str:
        raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(f"{kind}|{raw}".encode("utf-8")).hexdigest()

    @staticmethod
    def _cache_get(key: str) -> Any | None:
        try:
            from app.db import db_session

            with db_session() as conn:
                row = conn.execute("SELECT payload_json FROM llm_cache WHERE cache_key = ?", (key,)).fetchone()
            return json.loads(row["payload_json"]) if row else None
        except Exception:
            return None

    @staticmethod
    def _cache_put(key: str, kind: str, value: Any) -> None:
        try:
            from app.db import db_session

            with db_session() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO llm_cache (cache_key, kind, payload_json, created_at) VALUES (?, ?, ?, datetime('now'))",
                    (key, kind, json.dumps(value, ensure_ascii=False)),
                )
        except Exception:
            pass

    async def _call(self, body: dict[str, Any], preferred: tuple[str, ...], timeout: float, kind: str = "text") -> dict[str, Any] | None:
        """POST generateContent across models/keys. Returns the raw response JSON of the first success."""
        for model in await self._models(preferred, kind):
            for key in self._keys():
                try:
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        r = await client.post(
                            f"{self.GEMINI_BASE}/{model}:generateContent",
                            json=body,
                            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                        )
                    self.calls += 1
                    if r.status_code == 200:
                        self.last_model = model
                        return r.json()
                    if r.status_code in (429, 404, 503):
                        self._penalise(kind, model, r.status_code, r.text)
                        break
                except Exception:
                    continue
        return None

    @staticmethod
    def _text_of(data: dict[str, Any]) -> str:
        try:
            parts = data["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError):
            return ""
        return "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()

    def status(self) -> dict[str, Any]:
        return {
            "model": self.last_model,
            "cooling_down": sorted(k for k, t in self._cooldown.items() if t > time.time()),
            "calls": self.calls,
            "cache_hits": self.cache_hits,
        }

    async def _groq_chat(self, prompt: str, system: str | None, json_mode: bool, max_tokens: int, timeout: float) -> str:
        """Groq (OpenAI-compatible) chat completion. Primary text provider; returns '' on failure."""
        key = settings.groq_api_key
        if not key:
            return ""
        messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
        for model in self.GROQ_MODELS:
            if self._cooldown.get(f"groq:{model}", 0) > time.time():
                continue
            body: dict[str, Any] = {"model": model, "messages": messages, "temperature": 0.1, "max_completion_tokens": max(max_tokens, 256) * 3}
            if json_mode:
                body["response_format"] = {"type": "json_object"}
            if model.startswith("openai/gpt-oss"):
                body["reasoning_effort"] = "low"
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    r = await client.post(f"{self.GROQ_BASE}/chat/completions", json=body, headers={"Authorization": f"Bearer {key}"})
                self.calls += 1
                if r.status_code == 200:
                    txt = (r.json()["choices"][0]["message"].get("content") or "").strip()
                    if txt:
                        self.last_model = f"groq:{model}"
                        return txt
                elif r.status_code in (429, 404, 503, 400):
                    self._penalise("groq", model, r.status_code, r.text)
            except Exception:
                continue
        return ""

    async def _groq_whisper(self, audio: bytes, mime: str, language_hint: str = "") -> dict[str, Any]:
        key = settings.groq_api_key
        if not key:
            return {}
        ext = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav"}.get((mime or "").split(";")[0], "webm")
        for model in self.GROQ_WHISPER:
            try:
                data = {"model": model, "response_format": "verbose_json", "temperature": "0"}
                # Whisper has no Konkani code; let it auto-detect rather than force a wrong language.
                if language_hint in ("hi", "mr", "en", "gu", "ta", "te", "kn", "ml", "bn", "pa", "ur"):
                    data["language"] = language_hint
                async with httpx.AsyncClient(timeout=60.0) as client:
                    r = await client.post(
                        f"{self.GROQ_BASE}/audio/transcriptions",
                        headers={"Authorization": f"Bearer {key}"},
                        data=data,
                        files={"file": (f"voice.{ext}", audio, mime or "audio/webm")},
                    )
                self.calls += 1
                if r.status_code == 200:
                    j = r.json()
                    text = (j.get("text") or "").strip()
                    segs = j.get("segments") or []
                    silent = bool(segs) and sum(float(sg.get("no_speech_prob", 0)) for sg in segs) / len(segs) > 0.5
                    stock = text.lower().strip(" .!") in {"thank you", "thanks for watching", "you", "bye", "thank you very much"}
                    if silent or (stock and len(segs) <= 1):
                        return {"no_speech": True}  # Whisper's stock output on silence: never present it as a statement
                    if text:
                        self.last_model = f"groq:{model}"
                        return {"original_text": text, "language": j.get("language") or language_hint, "duration": j.get("duration")}
            except Exception:
                continue
        return {}

    # ---- public API -----------------------------------------------------
    async def ping(self) -> str:
        if settings.groq_api_key:
            return "ok"
        if not self._keys() and not settings.anthropic_api_key:
            return "down"
        models = await self._models(self.PREFERRED)
        # Do not spend free-tier quota on health checks: a reachable model list is "ok".
        return "ok" if models else "degraded"

    async def generate_text(
        self,
        prompt: str,
        system: str | None = None,
        json_mode: bool = False,
        max_tokens: int = 1200,
        timeout: float = 15.0,
        use_cache: bool = True,
    ) -> str:
        ckey = self._cache_key("text", [prompt, system, json_mode, max_tokens])
        if use_cache:
            hit = self._cache_get(ckey)
            if isinstance(hit, str) and hit:
                self.cache_hits += 1
                return hit
        groq_txt = await self._groq_chat(prompt, system, json_mode, max_tokens, timeout)
        if groq_txt:
            self._cache_put(ckey, "text", groq_txt)
            return groq_txt
        body: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": max(max_tokens, 256) * 4},
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"
        data = await self._call(body, self.PREFERRED, timeout)
        txt = self._text_of(data) if data else ""
        if txt:
            self._cache_put(ckey, "text", txt)
            return txt

        # Fallback to Concentrate / Anthropic proxy if configured
        if settings.anthropic_api_key and settings.anthropic_base_url:
            try:
                url = settings.anthropic_base_url.rstrip("/") + "/v1/messages"
                async with httpx.AsyncClient(timeout=timeout) as client:
                    r = await client.post(
                        url,
                        headers={
                            "x-api-key": settings.anthropic_api_key,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json={
                            "model": "claude-sonnet-4-5",
                            "max_tokens": max_tokens,
                            "system": system or "You are an Indian legal research assistant.",
                            "messages": [{"role": "user", "content": prompt}],
                        },
                    )
                    if r.status_code == 200:
                        data = r.json()
                        out = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
                        if out:
                            self._cache_put(ckey, "text", out)
                            return out
            except Exception:
                pass
        raise RuntimeError("No LLM provider succeeded")

    async def generate_grounded(self, prompt: str, timeout: float = 25.0) -> dict[str, Any]:
        """Gemini + Google Search grounding. Returns {text, sources:[{title, url}]} ({} on failure)."""
        ckey = self._cache_key("grounded", prompt)
        hit = self._cache_get(ckey)
        if isinstance(hit, dict) and hit.get("text"):
            self.cache_hits += 1
            return hit
        body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "tools": [{"google_search": {}}]}
        data = await self._call(body, self.PREFERRED, timeout, kind="grounded")
        if not data:
            return {}
        cand = (data.get("candidates") or [{}])[0]
        chunks = (cand.get("groundingMetadata") or {}).get("groundingChunks") or []
        out = {
            "text": self._text_of(data),
            "sources": [
                {"title": c.get("web", {}).get("title", ""), "url": c.get("web", {}).get("uri", "")}
                for c in chunks
                if c.get("web")
            ],
        }
        if out["text"]:
            self._cache_put(ckey, "grounded", out)
        return out

    async def transcribe_audio(self, audio: bytes, mime: str, language_hint: str = "") -> dict[str, Any]:
        """Transcribe + translate a voice note. Returns {original_text, english_translation, language} or {}."""
        if not audio:
            return {}
        ckey = self._cache_key("audio", hashlib.sha256(audio).hexdigest())
        hit = self._cache_get(ckey)
        if isinstance(hit, dict) and hit.get("original_text"):
            self.cache_hits += 1
            return hit
        # 1) Groq Whisper transcription, then LLM translation to English.
        heard = await self._groq_whisper(audio, mime, language_hint)
        if heard.get("no_speech"):
            return {"no_speech": True}
        if heard.get("original_text"):
            lang = (heard.get("language") or language_hint or "").lower()
            english = heard["original_text"]
            if lang not in ("en", "english"):
                try:
                    english = await self.generate_text(
                        "Translate this client statement to plain English for an Indian advocate. Keep names, dates, "
                        "amounts and local land terms (mundkar, bhatkar, comunidade) as-is. bhatkar = landowner; "
                        "mundkar = protected occupant living on the bhatkar's land. Return only the translation.\n\n"
                        + heard["original_text"],
                        max_tokens=600,
                    )
                except Exception:
                    english = ""
            out = {"language": lang or "und", "original_text": heard["original_text"], "english_translation": english,
                   "engine": "whisper-large-v3 (Groq)"}
            self._cache_put(ckey, "audio", out)
            return out
        if not self._keys():
            return {}
        instr = (
            "Transcribe this client voice note verbatim in its original language, then translate it to English. "
            + (f"Expected language code: {language_hint}. " if language_hint else "")
            + 'Return JSON: {"language": "<ISO 639 code>", "original_text": "...", "english_translation": "..."}'
        )
        body = {
            "contents": [
                {"parts": [{"text": instr}, {"inlineData": {"mimeType": mime or "audio/webm", "data": base64.b64encode(audio).decode("ascii")}}]}
            ],
            "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json"},
        }
        data = await self._call(body, self.TRANSCRIBE_PREFERRED, 45.0, kind="audio")
        if not data:
            return {}
        try:
            parsed = json.loads(self._text_of(data))
        except Exception:
            return {}
        if isinstance(parsed, dict) and parsed.get("original_text"):
            parsed["engine"] = f"{self.last_model or 'gemini'} (multimodal)"
            self._cache_put(ckey, "audio", parsed)
            return parsed
        return {}

    async def extract_image_ocr(self, png_bytes: bytes) -> str:
        """OCR fallback for scanned image-only PDFs using Gemini Vision."""
        if not self._keys() or not png_bytes:
            return ""
        b64 = base64.b64encode(png_bytes).decode("ascii")
        body = {
            "contents": [
                {
                    "parts": [
                        {"text": "Transcribe all legal text, dates, party names, and sections from this scanned document accurately. Return plain text only."},
                        {"inlineData": {"mimeType": "image/png", "data": b64}},
                    ]
                }
            ],
            "generationConfig": {"temperature": 0.0},
        }
        data = await self._call(body, self.PREFERRED, 20.0)
        return self._text_of(data) if data else ""

    async def extract_facts(self, matter_id: str, documents: list[dict[str, Any]], case_type: str) -> list[dict[str, Any]]:
        """Extract typed Fact Cards with source spans from parsed matter documents."""
        doc_context = "\n\n".join(
            f"--- DOCUMENT id={d['id']} kind={d['kind']} filename={d['filename']} ---\n{d['extracted_text'][:2800]}"
            for d in documents
        )
        prompt = (
            f"Extract concise, checkable legal fact cards for an Indian {case_type} matter from the documents below.\n"
            "Use Goa land glossary accurately if present (mundkar, bhatkar, comunidade, Form I & XIV).\n"
            "Rules:\n"
            "- Never promote an unverified oral/voice allegation to 'documented'; mark voice-only claims as 'alleged'.\n"
            "- Mark written document facts as 'documented', conflicting claims as 'disputed', missing critical facts (like unknown payment date) as 'unknown'.\n"
            "- Return a JSON array of 4 to 6 objects with keys:\n"
            '  id ("fact_01"...), statement (string), status ("alleged"|"documented"|"disputed"|"unknown"),\n'
            '  source ({document_id, location} or null), original ({language, text, translation_confidence} or null).\n\n'
            f"DOCUMENTS:\n{doc_context}"
        )
        try:
            raw = await self.generate_text(prompt, json_mode=True, max_tokens=1400, timeout=12.0)
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and "facts" in parsed:
                parsed = parsed["facts"]
            if isinstance(parsed, list) and len(parsed) > 0:
                valid_doc_ids = {d["id"] for d in documents}
                cleaned: list[dict[str, Any]] = []
                for idx, item in enumerate(parsed, start=1):
                    src = item.get("source")
                    if isinstance(src, dict) and src.get("document_id") not in valid_doc_ids and documents:
                        src["document_id"] = documents[0]["id"]
                    st = item.get("status", "alleged")
                    if st not in ("alleged", "documented", "disputed", "unknown"):
                        st = "alleged"
                    cleaned.append(
                        {
                            "id": item.get("id") or f"fact_{idx:02d}",
                            "statement": str(item.get("statement", "")).strip(),
                            "status": st,
                            "source": src if isinstance(src, dict) else None,
                            "original": item.get("original") if isinstance(item.get("original"), dict) else None,
                        }
                    )
                cleaned = normalize_fact_cards(cleaned)
                if cleaned:
                    return cleaned
        except Exception:
            pass
        return normalize_fact_cards(self._deterministic_fact_fallback(documents, case_type))

    @staticmethod
    def _deterministic_fact_fallback(documents: list[dict[str, Any]], case_type: str) -> list[dict[str, Any]]:
        facts: list[dict[str, Any]] = []
        idx = 1
        for d in documents:
            txt = d.get("extracted_text", "")
            if d["kind"] == "audio":
                try:
                    payload = json.loads(txt)
                    facts.append(
                        {
                            "id": f"fact_{idx:02d}",
                            "statement": payload.get("english_translation", "Client provided voice statement."),
                            "status": "alleged",
                            "source": {"document_id": d["id"], "location": payload.get("duration_range", "00:00–00:20")},
                            "original": {
                                "language": payload.get("language", "kok"),
                                "text": payload.get("original_text", ""),
                                "translation_confidence": payload.get("translation_confidence", "medium"),
                            },
                        }
                    )
                    idx += 1
                    continue
                except Exception:
                    pass
            lines = [
                ln.strip()
                for ln in txt.splitlines()
                if len(ln.strip()) > 25
                and not ln.strip().startswith("FICTIONAL")
                and not ln.strip().startswith("[Page")
                and not ln.strip().isupper()
            ]
            for l_i, line in enumerate(lines[:3]):
                lower = line.lower()
                status = "documented"
                if "dispute" in lower or "opposite party" in lower:
                    status = "disputed"
                elif "unknown" in lower or "unverified" in lower:
                    status = "unknown"
                facts.append(
                    {
                        "id": f"fact_{idx:02d}",
                        "statement": line[:220],
                        "status": status,
                        "source": {"document_id": d["id"], "location": f"para {l_i + 1}"} if status != "unknown" else None,
                        "original": None,
                    }
                )
                idx += 1
        return facts or [
            {
                "id": "fact_01",
                "statement": f"Matter filed under {case_type} category; awaiting documentary upload.",
                "status": "unknown",
                "source": None,
                "original": None,
            }
        ]

    async def classify_citation_treatment(self, cited_title: str, citing_title: str, citing_snippet: str) -> str:
        """Two-layer treatment classifier (deterministic keywords + LLM verification)."""
        lower = citing_snippet.lower()
        if any(p in lower for p in ("overruled", "no longer good law", "per incuriam", "set aside", "not good law")):
            return "overruled"
        if any(p in lower for p in ("distinguishable", "distinguished on facts", "confined to its facts", "limited")):
            return "distinguished"
        if "followed" in lower or "relied upon" in lower or "reaffirmed" in lower:
            return "followed"
        try:
            prompt = (
                f"Does the citing excerpt from '{citing_title}' overrule, distinguish, limit, or follow '{cited_title}'?\n"
                f"Excerpt: {citing_snippet}\n"
                'Reply with one JSON object: {"treatment": "followed"|"distinguished"|"limited"|"overruled"}'
            )
            raw = await self.generate_text(prompt, json_mode=True, max_tokens=64, timeout=8.0)
            t = json.loads(raw).get("treatment", "followed")
            if t in ("followed", "distinguished", "limited", "overruled"):
                return t
        except Exception:
            pass
        return "followed"

    async def generate_draft_paragraphs(
        self,
        matter: dict[str, Any],
        facts: list[dict[str, Any]],
        proof_items: list[dict[str, Any]],
        corpus_sources: list[dict[str, Any]],
        advice: dict[str, Any],
        draft_type: str | None = None,
        fallback: bool = True,
        offline: bool = False,
        instructions: str = "",
        clock: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Draft body paragraphs bound to stored SourceRefs (Authority Lock).

        offline=True skips the LLM (demo warm-up). With fallback=False an LLM failure returns []
        so the caller can decide; otherwise the deterministic instrument template is used.
        """
        from app import registry
        from app.drafting import LOCKED_CLAIMS, template_paragraphs

        instrument_id = draft_type or "legal_notice"
        inst = registry.instrument(instrument_id) or {}
        if offline:
            return template_paragraphs(matter, facts, corpus_sources, advice, instrument_id, clock)
        facts_txt = "\n".join(f"- [{f['status']}] {f['statement']}" for f in facts[:8])
        sources_txt = "\n".join(
            f"- source_id={s['source_id']} | title={s['title']} | snippet={s['snippet'][:220]}"
            for s in corpus_sources[:10]
        )
        area = registry.area(matter.get("case_type", "property"))
        prompt = (
            f"You draft the numbered body paragraphs of an Indian '{inst.get('label', instrument_id)}' "
            f"({inst.get('title', '')}) for matter '{matter['title']}' ({area.get('label', matter['case_type'])}), "
            f"forum: {matter.get('forum_hint') or area.get('forum', '')}, place: {matter.get('district') or matter.get('state') or ''}.\n"
            "Do NOT write the court heading, cause title, prayer or verification; those are added by the template.\n"
            "Write 4 to 6 short formal paragraphs: facts first (only from the facts list), then legal grounds.\n"
            "Every legal proposition, section or case named MUST cite a source_id from the list. Never invent citations.\n"
            f"Facts:\n{facts_txt}\n\nVerified sources (cite ONLY these source_ids):\n{sources_txt}\n\n"
            f"Strategy recommendation: {advice.get('recommendation', 'mediate')}\n"
            + (f"Advocate's instructions for this version: {instructions.strip()[:600]}\n" if instructions.strip() else "")
            + 'Return JSON {"paragraphs":[{"id":"p1","text":"...","confidence":"high|medium|low","source_ids":["..."]}]}'
        )
        default_locked = LOCKED_CLAIMS.get(matter.get("case_type", ""), "Claimant is entitled to automatic summary relief without documentary corroboration.")
        source_map = {s["source_id"]: s for s in corpus_sources}
        try:
            raw = await self.generate_text(prompt, json_mode=True, max_tokens=1600, timeout=30.0, use_cache=not instructions)
            data = json.loads(raw)
            paras_raw = data.get("paragraphs", []) if isinstance(data, dict) else []
            if len(paras_raw) >= 2:
                locked_paragraphs: list[dict[str, Any]] = []
                for idx, p in enumerate(paras_raw[:7], start=1):
                    requested_ids = p.get("source_ids", []) or []
                    matched_sources = [source_map[sid] for sid in requested_ids if sid in source_map]
                    text = str(p.get("text", "")).strip()
                    conf = p.get("confidence", "medium")
                    if conf not in ("high", "medium", "low"):
                        conf = "medium"
                    # Authority Lock: a legal assertion without a matching stored SourceRef is withheld.
                    has_legal_claim = bool(re.search(r"\b(v\.|vs\.|section|act|supreme court|high court|precedent|held that)\b", text, re.I))
                    if has_legal_claim and not matched_sources:
                        locked_paragraphs.append({"id": f"p{idx}", "text": "No verified authority found.", "confidence": "low", "sources": [], "locked_out_claim": text})
                    else:
                        locked_paragraphs.append({"id": f"p{idx}", "text": text, "confidence": conf if matched_sources else "high", "sources": matched_sources})
                if not any(p.get("locked_out_claim") for p in locked_paragraphs):
                    locked_paragraphs.append({"id": f"p{len(locked_paragraphs) + 1}", "text": "No verified authority found.", "confidence": "low", "sources": [], "locked_out_claim": default_locked})
                return locked_paragraphs
        except Exception:
            pass
        if not fallback:
            return []
        return template_paragraphs(matter, facts, corpus_sources, advice, instrument_id, clock)

    @staticmethod
    def verify_citation_against_corpus(text: str, corpus_sources: list[dict[str, Any]]) -> dict[str, Any]:
        """Strict Authority Lock: only text matching a stored SourceRef in the corpus verifies."""
        norm_input = _normalize_text(text)
        if not norm_input or len(norm_input) < 4:
            return {"verified": False, "source": None, "message": "No verified authority found."}

        for src in corpus_sources:
            title_norm = _normalize_text(src.get("title", ""))
            # Extract lead party / act name before ' v. ' or ' — '
            lead = re.split(r"\s+(?:v|vs|—|-)\s+", title_norm)[0].strip()
            snippet_norm = _normalize_text(src.get("snippet", ""))
            url_id = src.get("source_id", "").replace("src_kanoon_", "")

            title_match = bool(title_norm and title_norm in norm_input)
            lead_match = bool(lead and len(lead) >= 6 and lead in norm_input)
            # Also match when the user pastes a shortened case title (e.g. "Suraj Lamp" or "Navtej Johar")
            lead_tokens = [t for t in lead.split() if len(t) >= 3]
            short_case_match = bool(
                len(norm_input.split()) >= 2
                and len(norm_input) >= 8
                and lead.startswith(norm_input)
            ) or bool(
                len(lead_tokens) >= 2
                and all(tok in norm_input.split() for tok in lead_tokens[:2])
            )
            snippet_overlap = bool(len(norm_input) >= 24 and norm_input in snippet_norm)
            doc_id_match = bool(url_id and url_id in norm_input)

            if title_match or lead_match or short_case_match or snippet_overlap or doc_id_match:
                # F8: naming a real case is not enough — a proposition attributed to it must be
                # supported by (and not negate) the stored paragraph.
                if not snippet_overlap:
                    contradiction = _proposition_conflict(norm_input, title_norm, src.get("snippet", ""))
                    if contradiction:
                        return {"verified": False, "source": None, "message": contradiction}
                return {
                    "verified": True,
                    "source": src,
                    "message": f"Verified against stored paragraph ({src['title']}, para {src.get('paragraph', '—')}).",
                }
        return {
            "verified": False,
            "source": None,
            "message": "No verified authority found.",
        }


llm_client = LLMClient()

