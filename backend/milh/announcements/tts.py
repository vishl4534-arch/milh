"""Announcement audio via ElevenLabs, generated once on the server and cached as files.

The kiosk downloads these files ahead of time, so announcements play with no connection.
API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id} (header xi-api-key).
"""

from __future__ import annotations

import hashlib
import logging
import uuid
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
# A warm, expressive read rather than a flat one: lower stability lets pitch rise and fall with the
# punctuation of the templates; a little style adds natural emphasis without sounding acted.
VOICE_SETTINGS = {"stability": 0.38, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": True, "speed": 0.95}
# Bump when VOICE_SETTINGS change, so cached clips are regenerated with the new delivery.
VOICE_STYLE_VERSION = "v2"


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
        return f"{self.model_id}:{self.voice_ids[lang]}:{VOICE_STYLE_VERSION}"

    def synthesize(self, text: str, lang: str) -> bytes:
        voice = self.voice_ids[lang]
        if not voice:
            raise KeyError(f"no ElevenLabs voice configured for {lang!r}")
        r = self.http.post(
            ELEVENLABS_URL.format(voice_id=voice),
            headers={"xi-api-key": self.api_key, "Accept": "audio/mpeg"},
            json={"text": text, "model_id": self.model_id, "voice_settings": VOICE_SETTINGS},
            timeout=60,
        )
        r.raise_for_status()
        return r.content


def clip_rel(text: str, lang: str, tts: TtsClient) -> str:
    """Where the clip for this text lives in the current voice. Changing the voice changes the path."""
    digest = hashlib.sha256(f"{lang}|{tts.voice_key(lang)}|{text}".encode()).hexdigest()[:32]
    return f"audio/{digest}.mp3"


def audio_for(text: str, lang: str, tts: TtsClient, media_dir: Path) -> str:
    """Return the media-relative path of the clip, generating it only if it does not exist yet."""
    rel = clip_rel(text, lang, tts)
    path = media_dir / rel
    if not path.exists():
        data = tts.synthesize(text, lang)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(path)
    return rel


def stale_langs(a: Announcement, tts: TtsClient) -> list[str]:
    """Languages whose clip is missing or was made in an older voice."""
    have = a.audio or {}
    return [lang for lang, text in (a.text or {}).items() if text and have.get(lang) != clip_rel(text, lang, tts)]


def current_audio(a: Announcement, tts: TtsClient | None) -> dict[str, str]:
    """The announcement's clips, leaving out any made in an older voice (the tablet then asks for a new one)."""
    if tts is None:
        return dict(a.audio or {})
    stale = set(stale_langs(a, tts))
    return {lang: rel for lang, rel in (a.audio or {}).items() if lang in (a.text or {}) and lang not in stale}


def attach_audio(session: Session, a: Announcement, tts: TtsClient | None, media_dir: Path) -> int:
    """Fill a.audio for each language that has text, in the current voice (older clips are replaced).
    Failures leave that language without audio; the kiosk then shows the text with a chime."""
    if tts is None:
        return 0
    added = 0
    audio = dict(a.audio or {})
    for lang in stale_langs(a, tts):
        text = a.text[lang]
        audio.pop(lang, None)
        try:
            audio[lang] = audio_for(text, lang, tts, media_dir)
            added += 1
        except Exception as e:  # network, quota, missing voice
            log.warning("TTS failed for announcement %s (%s): %s", a.id, lang, e)
    if added or audio != (a.audio or {}):
        a.audio = audio
        flag_modified(a, "audio")
        session.flush()
    return added


def generate_missing_audio(session: Session, tts: TtsClient | None, media_dir: Path, now: datetime,
                           horizon: timedelta = timedelta(hours=36), farm_id: uuid.UUID | None = None) -> int:
    if tts is None:
        return 0
    q = select(Announcement).where(Announcement.status == "scheduled",
                                   Announcement.scheduled_at >= now - timedelta(hours=1),
                                   Announcement.scheduled_at <= now + horizon)
    if farm_id is not None:
        q = q.where(Announcement.farm_id == farm_id)
    done = 0
    for a in list(session.scalars(q)):
        if stale_langs(a, tts) and attach_audio(session, a, tts, media_dir):
            done += 1
    return done


@lru_cache
def get_tts() -> ElevenLabsTts | None:
    s = get_settings()
    voices = {**s.elevenlabs_voice_ids, **{k: v for k, v in s.elevenlabs_announce_voice_ids.items() if v}}
    if not s.elevenlabs_api_key or not any(voices.values()):
        return None
    return ElevenLabsTts(s.elevenlabs_api_key, s.elevenlabs_model_id, voices,
                         httpx.Client(headers={"User-Agent": "milh-farm-platform/0.1"}))
