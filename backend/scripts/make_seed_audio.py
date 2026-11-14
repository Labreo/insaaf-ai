"""Generate a spoken audio file beside every seeded voice-note transcript (macOS `say`, synthetic voices).
The demo's seeded voice notes are stored as pre-transcribed JSON; the app serves the sibling .wav as the recording.
python3 backend/scripts/make_seed_audio.py"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VOICE = {"kok": "Lekha", "mr": "Lekha", "hi": "Lekha", "kn": "Soumya", "ta": "Vani", "te": "Geeta"}
files = [ROOT / "demo/matters/mat_001/client_voice_note_kok.json", *sorted((ROOT / "demo/seed/docs").glob("*_client_voice_note.json"))]
for j in files:
    d = json.loads(j.read_text(encoding="utf-8"))
    text, lang = d.get("original_text") or "", d.get("language") or "hi"
    aiff, wav = j.with_suffix(".aiff"), j.with_suffix(".wav")
    subprocess.run(["say", "-v", VOICE.get(lang, "Lekha"), "-r", "160", "-o", str(aiff), text], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(aiff), "-ac", "1", "-ar", "16000", str(wav)], check=True)
    aiff.unlink()
    print(wav.relative_to(ROOT), lang, VOICE.get(lang))
