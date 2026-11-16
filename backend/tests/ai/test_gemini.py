from types import SimpleNamespace
from typing import Any

import pytest

import milh.ai.gemini as gemini_mod
from milh.ai.gemini import GeminiService
from tests.factories import bearer, make_farm, make_user

EXPL = {"minutes": 44, "habit_minutes": 60}


class FakeModels:
    def __init__(self, reply: str | None = None, fail: bool = False) -> None:
        self.reply, self.fail, self.prompts = reply, fail, []  # type: ignore[var-annotated]

    def generate_content(self, model: str, contents: str) -> Any:
        self.prompts.append(contents)
        if self.fail:
            raise RuntimeError("quota exceeded")
        return SimpleNamespace(text=self.reply)


def _svc(reply: str | None = None, fail: bool = False) -> GeminiService:
    return GeminiService(None, "gemini-test", client=SimpleNamespace(models=FakeModels(reply, fail)))


def test_rephrase_rejects_output_missing_numbers() -> None:
    assert _svc("Water block 3 for a while today.").rephrase(EXPL, "44 min instead of 60 ...", "en") is None


def test_rephrase_accepts_valid() -> None:
    out = _svc("Today give Block 3 44 minutes, not the usual 60.").rephrase(EXPL, "44 min instead of 60", "en")
    assert out == "Today give Block 3 44 minutes, not the usual 60."


def test_rephrase_rejects_too_long() -> None:
    assert _svc("44 60 " + "x" * 400).rephrase(EXPL, "t", "en") is None


def test_no_key_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    assert GeminiService(None, "m").rephrase(EXPL, "t", "en") is None
    monkeypatch.setattr(gemini_mod, "get_settings", lambda: SimpleNamespace(gemini_api_key=None, gemini_model="m"))
    gemini_mod.get_gemini.cache_clear()
    assert gemini_mod.get_gemini() is None
    gemini_mod.get_gemini.cache_clear()


def test_api_error_returns_none() -> None:
    assert _svc(fail=True).translate("hello", "ur") is None


def test_translate_failure_falls_back_untranslated(client, session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gemini_mod, "get_gemini", lambda: _svc(fail=True))
    owner = make_user(session)
    farm = make_farm(session, owner)
    session.commit()
    r = client.post(f"/api/v1/farms/{farm.id}/announcements", json={"text": "Truck at 10", "lang": "en"},
                    headers=bearer(owner)).json()
    assert r["text"] == {"en": "Truck at 10", "ur": "Truck at 10"} and r["untranslated"] == ["ur"]


def test_translate_success(client, session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gemini_mod, "get_gemini", lambda: _svc("ٹرک 10 بجے"))
    owner = make_user(session)
    farm = make_farm(session, owner)
    session.commit()
    r = client.post(f"/api/v1/farms/{farm.id}/announcements", json={"text": "Truck at 10", "lang": "en"},
                    headers=bearer(owner)).json()
    assert r["text"]["ur"] == "ٹرک 10 بجے" and r["untranslated"] == []


def test_planner_uses_rephrase_when_valid(session, monkeypatch: pytest.MonkeyPatch) -> None:
    from tests.planning.test_planner import DAY, NOW, _setup

    _owner, farm, *_ = _setup(session)
    from milh.planning.planner import plan_farm_day

    minutes = plan_farm_day(session, farm.id, DAY, NOW)[0].minutes
    monkeypatch.setattr(gemini_mod, "get_gemini", lambda: _svc(f"Give {minutes} minutes today instead of 60."))
    p = plan_farm_day(session, farm.id, DAY, NOW)[0]
    assert p.text["en"] == f"Give {minutes} minutes today instead of 60."
    assert p.explanation["text_source"]["en"] == "gemini"
