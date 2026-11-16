"""Gemini for language only: rewording explanations and translating owner messages.

Gemini never produces a number used in a decision. A rewording that drops the engine's minute
values is discarded and the template sentence is kept.
"""

from __future__ import annotations

import logging
from datetime import date
from functools import lru_cache
from typing import Any

from pydantic import BaseModel

from milh.config import get_settings

log = logging.getLogger(__name__)

LANG_NAMES = {"en": "English", "ur": "Urdu", "ar": "Arabic", "hi": "Hindi"}
MAX_REPHRASE_CHARS = 300


class LabSample(BaseModel):
    label: str
    ece: float | None = None
    ec_1to5: float | None = None
    ph: float | None = None
    moisture_vwc: float | None = None


class LabWater(BaseModel):
    label: str
    ec: float | None = None


class LabReportExtract(BaseModel):
    tested_on: date | None = None
    lab: str | None = None
    samples: list[LabSample] = []
    water: list[LabWater] = []


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

    def extract_lab_report(self, data: bytes, mime_type: str) -> LabReportExtract | None:
        """Read soil/water values off a lab report photo or PDF. A person confirms them before saving."""
        if self.client is None:
            return None
        try:
            from google.genai import types

            resp = self.client.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_bytes(data=data, mime_type=mime_type),
                    "Extract the soil and irrigation-water test results from this laboratory report. "
                    "Use null for anything not printed on the report; never guess. ECe and EC are in dS/m "
                    "(convert from mS/cm 1:1 or µS/cm /1000 only if the report states the unit).",
                ],
                config=types.GenerateContentConfig(response_mime_type="application/json",
                                                   response_schema=LabReportExtract),
            )
            parsed = getattr(resp, "parsed", None)
            if isinstance(parsed, LabReportExtract):
                return parsed
            text = getattr(resp, "text", None)
            return LabReportExtract.model_validate_json(text) if text else None
        except Exception as e:
            log.warning("Gemini lab-report extraction failed: %s", e)
            return None

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
