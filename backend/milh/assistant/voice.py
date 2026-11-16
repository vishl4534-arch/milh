"""Voice for the assistant: ElevenLabs Scribe speech-to-text and streamed text-to-speech.

Ported from the team's sea-safe project. The voice never decides anything: speech-to-text only turns the
worker's question into text, and text-to-speech only reads the answer templates filled by code.
Spoken audio is cached by its exact text, so repeating an answer costs no extra credits.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import threading
from collections.abc import Iterator
from functools import partial
from pathlib import Path

import httpx

from milh.config import get_settings

log = logging.getLogger("milh.assistant.voice")
API = "https://api.elevenlabs.io/v1"
AUDIO_ID = re.compile(r"^[0-9a-f]{24}$")
LANG_CODES = {"en": {"stt": "eng", "tts": "en"}, "ur": {"stt": "urd", "tts": "ur"},
              "ar": {"stt": "ara", "tts": "ar"}, "hi": {"stt": "hin", "tts": "hi"}}
OUTPUT_FORMAT = "mp3_44100_64"
MAX_SPOKEN_CHARS = 1500
TIMEOUT = 20.0
_HTTP = httpx.Client(timeout=TIMEOUT, headers={"User-Agent": "milh-farm-platform/0.1"})


class VoiceError(Exception):
    pass


def _key() -> str:
    return (get_settings().elevenlabs_api_key or "").strip()


def _voice(lang: str) -> str:
    return (get_settings().elevenlabs_voice_ids.get(lang) or "").strip()


def audio_dir() -> Path:
    return Path(get_settings().media_dir) / "assistant"


def available(lang: str | None = None) -> bool:
    """Voice works only if it is switched on, a key is set, and (if given) the language has a voice."""
    if not get_settings().assistant_enabled or not _key():
        return False
    return lang is None or (lang in LANG_CODES and bool(_voice(lang)))


def transcribe(audio: bytes, filename: str, content_type: str, lang: str, keyterms: list[str] | None = None) -> str:
    """The question as text, in the language chosen on the tablet (more accurate than guessing).
    Key terms (block, crop and tap names) help Scribe hear them right."""
    if not available(lang):
        raise VoiceError("voice not available")
    if not audio:
        return ""
    s = get_settings()
    data: dict[str, str | list[str]] = {"model_id": s.elevenlabs_stt_model,
                                        "language_code": LANG_CODES[lang]["stt"],
                                        "tag_audio_events": "false"}  # pumps and wind are not words
    if keyterms:
        data["keyterms"] = keyterms
    try:
        r = _HTTP.post(f"{API}/speech-to-text", headers={"xi-api-key": _key()}, data=data,
                       files={"file": (filename or "question.webm", audio, content_type or "audio/webm")})
    except httpx.HTTPError as e:
        raise VoiceError(f"speech-to-text failed: {e}") from e
    if r.status_code != 200:
        raise VoiceError(f"speech-to-text HTTP {r.status_code}: {r.text[:200]}")
    return without_sound_tags(str(r.json().get("text") or ""))


_SOUND_TAG = re.compile(r"\([^()]*\)|\[[^\[\]]*\]")


def without_sound_tags(text: str) -> str:
    return re.sub(r"\s+", " ", _SOUND_TAG.sub(" ", text or "")).strip()


def is_echo(heard: str, her_line: str) -> bool:
    """Was what the mic heard while the tablet spoke only noise, or its own words coming back?"""
    words = re.findall(r"\w+", (heard or "").lower())
    if not words:
        return True
    hers = set(re.findall(r"\w+", (her_line or "").lower()))
    return sum(w in hers for w in words) / len(words) >= 0.6


def audio_id(text: str, lang: str) -> str:
    s = get_settings()
    raw = "|".join([s.elevenlabs_tts_model_assistant, _voice(lang), OUTPUT_FORMAT, lang, text])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]


def audio_path(aid: str) -> Path | None:
    """The cached file for an audio id, or None. Ids are checked so no other file can be served."""
    if not AUDIO_ID.match(aid or ""):
        return None
    path = audio_dir() / f"{aid}.mp3"
    return path if path.exists() else None


# ---- streaming: the answer starts playing about 1 s after the request ------------------------------------
_pending: dict[str, tuple[str, str]] = {}
_fetches: dict[str, _Fetch] = {}
MAX_PENDING = 200


def prepare(text: str, lang: str, start: bool = True) -> str:
    """Register text to be spoken and return its audio id at once; the fetch starts in the background."""
    if not available(lang):
        raise VoiceError("voice not available")
    if not text or len(text) > MAX_SPOKEN_CHARS:
        raise VoiceError(f"text length {len(text or '')} outside the allowed range")
    aid = audio_id(text, lang)
    if not audio_path(aid):
        _pending[aid] = (text, lang)
        while len(_pending) > MAX_PENDING:
            _pending.pop(next(iter(_pending)))
        if start and aid not in _fetches:
            _Fetch(aid, text, lang).start()
    return aid


class _Fetch:
    """One spoken answer arriving from ElevenLabs in a background thread; readers get chunks as they come,
    and the complete file is cached at the end."""

    def __init__(self, aid: str, text: str, lang: str) -> None:
        self.aid, self.text, self.lang = aid, text, lang
        self.chunks: list[bytes] = []
        self.done = False
        self.error: VoiceError | None = None
        self.cv = threading.Condition()

    def start(self) -> _Fetch:
        _fetches[self.aid] = self
        threading.Thread(target=self._run, daemon=True).start()
        return self

    def _run(self) -> None:
        s = get_settings()
        try:
            with _HTTP.stream("POST", f"{API}/text-to-speech/{_voice(self.lang)}/stream",
                              params={"output_format": OUTPUT_FORMAT},
                              headers={"xi-api-key": _key(), "Content-Type": "application/json"},
                              json={"text": self.text, "model_id": s.elevenlabs_tts_model_assistant,
                                    "language_code": LANG_CODES[self.lang]["tts"]}) as r:
                if r.status_code != 200:
                    raise VoiceError(f"text-to-speech HTTP {r.status_code}: {r.read()[:200]!r}")
                for chunk in r.iter_bytes():
                    with self.cv:
                        self.chunks.append(chunk)
                        self.cv.notify_all()
            d = audio_dir()
            d.mkdir(parents=True, exist_ok=True)
            part = d / f"{self.aid}.{os.getpid()}.{id(self)}.part"
            part.write_bytes(b"".join(self.chunks))
            os.replace(part, d / f"{self.aid}.mp3")
            _pending.pop(self.aid, None)
        except Exception as e:  # any failure becomes a clean voice error
            self.error = e if isinstance(e, VoiceError) else VoiceError(f"text-to-speech failed: {e}")
            log.warning("%s", self.error)
        finally:
            with self.cv:
                self.done = True
                self.cv.notify_all()
            if _fetches.get(self.aid) is self:
                _fetches.pop(self.aid)

    def wait_first(self) -> None:
        with self.cv:
            self.cv.wait_for(lambda: bool(self.chunks) or self.done, timeout=TIMEOUT)
        if not self.chunks:
            raise self.error or VoiceError("text-to-speech returned no audio")

    def _ready(self, n: int) -> bool:
        return n < len(self.chunks) or self.done

    def read(self) -> Iterator[bytes]:
        i = 0
        while True:
            with self.cv:
                self.cv.wait_for(partial(self._ready, i), timeout=TIMEOUT)
                if i >= len(self.chunks):
                    return
                chunk = self.chunks[i]
            i += 1
            yield chunk


def open_stream(aid: str) -> Iterator[bytes]:
    """Stream a prepared answer: join the running fetch, or start it. Raises VoiceError before any audio."""
    fetch = _fetches.get(aid)
    if fetch is None:
        if aid not in _pending:
            raise VoiceError("unknown audio id")
        fetch = _Fetch(aid, *_pending[aid]).start()
    fetch.wait_first()
    return fetch.read()
