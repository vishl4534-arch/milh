"""Announcement audio via ElevenLabs, generated once on the server and cached as files.

The kiosk downloads these files ahead of time, so announcements play with no connection.
API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id} (header xi-api-key).
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from milh.config import get_settings
from milh.models import Announcement

log = logging.getLogger(__name__)
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


class TtsClient(Protocol):
    def voice_key(self, lang: str) -> str: ...

    def synthesize(self, text: str, lang: str) -> bytes: ...


class ElevenLabsTts:
    def __init__(self, api_key: str, model_id: str, voice_ids: dict[str, str], http: httpx.Client) -> None:
        self.api_key = api_key
        self.model_id = model_id
        self.voice_ids = voice_ids
        self.http = http

    def voice_key(self, lang: str) -> str:
        return f"{self.model_id}:{self.voice_ids[lang]}"

    def synthesize(self, text: str, lang: str) -> bytes:
        voice = self.voice_ids[lang]
        if not voice:
            raise KeyError(f"no ElevenLabs voice configured for {lang!r}")
        r = self.http.post(
            ELEVENLABS_URL.format(voice_id=voice),
            headers={"xi-api-key": self.api_key, "Accept": "audio/mpeg"},
            json={"text": text, "model_id": self.model_id},
            timeout=60,
        )
        r.raise_for_status()
        return r.content


def audio_for(text: str, lang: str, tts: TtsClient, media_dir: Path) -> str:
    """Return the media-relative path of the clip, generating it only if it does not exist yet."""
    digest = hashlib.sha256(f"{lang}|{tts.voice_key(lang)}|{text}".encode()).hexdigest()[:32]
    rel = f"audio/{digest}.mp3"
    path = media_dir / rel
    if not path.exists():
        data = tts.synthesize(text, lang)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(path)
    return rel


def attach_audio(session: Session, a: Announcement, tts: TtsClient | None, media_dir: Path) -> int:
    """Fill a.audio for each language that has text. Failures leave that language without audio;
    the kiosk then shows the text with a chime."""
    if tts is None:
        return 0
    added = 0
    audio = dict(a.audio or {})
    for lang, text in (a.text or {}).items():
        if lang in audio:
            continue
        try:
            audio[lang] = audio_for(text, lang, tts, media_dir)
            added += 1
        except Exception as e:  # network, quota, missing voice
            log.warning("TTS failed for announcement %s (%s): %s", a.id, lang, e)
    if added:
        a.audio = audio
        flag_modified(a, "audio")
        session.flush()
    return added


def generate_missing_audio(session: Session, tts: TtsClient | None, media_dir: Path, now: datetime,
                           horizon: timedelta = timedelta(hours=36)) -> int:
    if tts is None:
        return 0
    q = select(Announcement).where(Announcement.status == "scheduled",
                                   Announcement.scheduled_at >= now - timedelta(hours=1),
                                   Announcement.scheduled_at <= now + horizon)
    done = 0
    for a in session.scalars(q):
        if set(a.text or {}) - set(a.audio or {}) and attach_audio(session, a, tts, media_dir):
            done += 1
    return done


@lru_cache
def get_tts() -> ElevenLabsTts | None:
    s = get_settings()
    if not s.elevenlabs_api_key or not any(s.elevenlabs_voice_ids.values()):
        return None
    return ElevenLabsTts(s.elevenlabs_api_key, s.elevenlabs_model_id, s.elevenlabs_voice_ids,
                         httpx.Client(headers={"User-Agent": "milh-farm-platform/0.1"}))
