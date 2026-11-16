"""Application settings, loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # SQLite by default so the platform runs on a laptop without Docker; Postgres in compose/CI.
    database_url: str = "sqlite:///./milh.db"
    jwt_secret: str = "change-me-in-env"
    elevenlabs_api_key: str | None = None
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    elevenlabs_voice_ids: dict[str, str] = {}
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    media_dir: Path = Path("./media")
    mqtt_url: str = "mqtt://localhost:1883"
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
