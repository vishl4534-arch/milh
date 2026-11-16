"""Answering in the language the worker used: Urdu, Arabic or English."""
import json
import re

import httpx
import pytest
import respx

import milh.api.assistant as api_mod
from milh.assistant import voice
from milh.assistant.chat import yes_no
from milh.assistant.tools import TEMPLATE_DIR, detect_language
from tests.assistant.test_api import _tool, farm_worker, voice_on  # noqa: F401  (pytest fixtures)
from tests.factories import bearer

STT = "https://api.elevenlabs.io/v1/speech-to-text"


@pytest.mark.parametrize(("text", "lang"), [
    ("How long do I water block 2?", "en"),
    ("بلاک 2 کو آج کتنی دیر پانی دینا ہے؟", "ur"),
    ("كم دقيقة أسقي القطعة الثانية اليوم؟", "ar"),
    ("ब्लॉक 2 को कितना पानी", "ur"),  # Urdu heard and written in Hindi letters
    ("block 2 ko aaj kitna pani", "ur"),  # Roman Urdu
    ("", "ur"),
])
def test_detect_language(text: str, lang: str) -> None:
    assert detect_language(text, "ur") == lang


def test_arabic_templates_cover_every_line() -> None:
    en = json.loads((TEMPLATE_DIR / "en.json").read_text(encoding="utf-8"))
    ar = json.loads((TEMPLATE_DIR / "ar.json").read_text(encoding="utf-8"))
    assert set(ar) == set(en)
    slots = lambda s: set(re.findall(r"\{(\w+)\}", s))  # noqa: E731
    for key, text in en.items():  # the same slots, so code can fill both
        assert slots(ar[key]) == slots(text), key


def test_arabic_yes_no() -> None:
    assert yes_no("نعم") == "yes"
    assert yes_no("لا شكرا") == "no"


@pytest.fixture
def settings():  # type: ignore[no-untyped-def]
    from milh.config import get_settings
    s = get_settings()
    old = (s.elevenlabs_api_key, dict(s.elevenlabs_voice_ids), s.assistant_enabled)
    s.elevenlabs_api_key, s.elevenlabs_voice_ids, s.assistant_enabled = "el-key", {"en": "V_EN", "ur": "V_UR"}, True
    yield s
    s.elevenlabs_api_key, s.elevenlabs_voice_ids, s.assistant_enabled = old


def test_arabic_borrows_the_urdu_voice(settings) -> None:  # type: ignore[no-untyped-def]
    assert voice.available("ar")
    assert voice._voice("ar") == "V_UR"


@respx.mock
def test_transcribe_auto_detects_language(settings) -> None:  # type: ignore[no-untyped-def]
    route = respx.post(STT).mock(return_value=httpx.Response(200, json={"text": "बलॉक 2", "language_code": "hin"}))
    assert voice.transcribe_auto(b"x", "q.webm", "audio/webm") == ("बलॉक 2", "ur")
    assert "language_code" not in route.calls.last.request.content.decode("utf-8", "ignore")


def test_auto_text_answers_in_arabic(client, farm_worker, voice_on, monkeypatch) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, worker = farm_worker
    monkeypatch.setattr(api_mod.llm, "complete", lambda m, t: (_tool("water_status"), "fake"))
    r = client.post("/api/v1/assistant/text", headers=bearer(worker, farm.id),
                    json={"question": "كم الماء في الخزان؟", "lang": "auto", "fallback": "en"}).json()
    assert r["lang"] == "ar"
    assert any("؀" <= c <= "ۿ" for c in r["reply"])


def test_auto_audio_follows_spoken_language(client, farm_worker, voice_on, monkeypatch) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, worker = farm_worker
    monkeypatch.setattr(api_mod.voice, "transcribe_auto", lambda *a, **k: ("ٹینک میں کتنا پانی ہے", "ur"))
    monkeypatch.setattr(api_mod.llm, "complete", lambda m, t: (_tool("water_status"), "fake"))
    r = client.post("/api/v1/assistant/ask", headers=bearer(worker, farm.id),
                    files={"audio": ("q.webm", b"x", "audio/webm")}, data={"lang": "auto", "fallback": "en"}).json()
    assert r["lang"] == "ur"
