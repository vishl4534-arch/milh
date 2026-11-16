"""Gemini for language only: rewording explanations and translating owner messages.

Gemini never produces a number used in a decision. A rewording that drops the engine's minute
values is discarded and the template sentence is kept.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from milh.config import get_settings

log = logging.getLogger(__name__)

LANG_NAMES = {"en": "English", "ur": "Urdu", "ar": "Arabic", "hi": "Hindi"}
MAX_REPHRASE_CHARS = 300


class GeminiService:
    def __init__(self, api_key: str | None, model: str, client: Any | None = None) -> None:
        self.model = model
        self.client = client
        if self.client is None and api_key:
            from google import genai

            self.client = genai.Client(api_key=api_key)

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def _generate(self, prompt: str) -> str | None:
        if self.client is None:
            return None
        try:
            resp = self.client.models.generate_content(model=self.model, contents=prompt)
            text = getattr(resp, "text", None)
            return text.strip() if text else None
        except Exception as e:  # network, quota, safety block: fall back to templates
            log.warning("Gemini call failed: %s", e)
            return None

    def rephrase(self, explanation: dict[str, Any], template_text: str, lang: str) -> str | None:
        prompt = (
            f"Rewrite this farm irrigation instruction as one short, friendly sentence in "
            f"{LANG_NAMES.get(lang, lang)} for a farm worker. Keep every number exactly as written. "
            f"Do not add advice or new numbers. Reply with the sentence only.\n\n{template_text}"
        )
        out = self._generate(prompt)
        if out is None or len(out) > MAX_REPHRASE_CHARS:
            return None
        required = [str(explanation["minutes"]), str(explanation["habit_minutes"])]
        if not all(n in out for n in required):
            log.info("Gemini rewording dropped a number; keeping template text")
            return None
        return out

    def translate(self, text: str, target_lang: str) -> str | None:
        prompt = (
            f"Translate this message for a farm worker into {LANG_NAMES.get(target_lang, target_lang)}. "
            f"Keep numbers and times exactly. Reply with the translation only.\n\n{text}"
        )
        return self._generate(prompt)


@lru_cache
def get_gemini() -> GeminiService | None:
    s = get_settings()
    if not s.gemini_api_key:
        return None
    return GeminiService(s.gemini_api_key, s.gemini_model)
