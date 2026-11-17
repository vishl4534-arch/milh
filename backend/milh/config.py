"""Application settings, loaded from environment / .env."""

from __future__ import annotations

import logging
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # SQLite by default so the platform runs on a laptop without Docker; Postgres in compose/CI.
    database_url: str = "sqlite:///./milh.db"
    jwt_secret: str = ""  # empty -> a random per-process secret (dev only); set in .env
    elevenlabs_api_key: str | None = None
    elevenlabs_model_id: str = "eleven_v4_turbo"  # speaks Urdu; multilingual_v2 does not
    elevenlabs_voice_ids: dict[str, str] = {}
    # The announcer (scheduled announcements and the tablet's speaker buttons): a male voice, apart from the
    # assistant's. Amjid, an Urdu documentary narrator from the ElevenLabs voice library, chosen because
    # speech-to-text understood his Urdu best ("sabz nal") and his English is clear. Empty values fall back
    # to ELEVENLABS_VOICE_IDS.
    elevenlabs_announce_voice_ids: dict[str, str] = {"en": "vH5LP38dcYJ3CIbC2rKX", "ur": "vH5LP38dcYJ3CIbC2rKX"}
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash-lite"  # 2.5-flash is retired for new accounts
    media_dir: Path = Path("./media")
    # Voice assistant on the farm tablet (docs/2026-11-16-voice-assistant-design.md)
    assistant_enabled: bool = True
    assistant_model: str = "gemini-3.5-flash-lite"
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    groq_reasoning_effort: str = "low"
    llm_providers: list[str] = ["gemini", "groq"]
    llm_timeout_seconds: float = 4.0
    llm_hedge_seconds: float = 1.5
    elevenlabs_stt_model: str = "scribe_v3"
    elevenlabs_tts_model_assistant: str = "eleven_v4_turbo"
    mqtt_url: str = "mqtt://localhost:1883"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Demo mode: the sign-in pages list ready-made demo accounts (from `milh.cli seed-demo`) that a
    # judge can click to fill in. Never enable it on a farm with real users.
    demo_mode: bool = False
    demo_accounts_file: Path = Path("./demo_accounts.json")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if len(s.jwt_secret) < 32:
        logging.getLogger(__name__).warning(
            "JWT_SECRET missing or shorter than 32 chars; using a random secret for this process. "
            "Logins will not survive a restart. Set JWT_SECRET in .env."
        )
        s.jwt_secret = secrets.token_urlsafe(48)
    return s
