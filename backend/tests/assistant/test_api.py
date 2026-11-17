import json
from datetime import timedelta

import pytest

import milh.api.assistant as api_mod
from milh.planning.planner import plan_farm_day
from tests.factories import add_member, bearer, make_user
from tests.planning.test_planner import DAY, NOW, _setup


def _tool(name: str, **args: object) -> dict:
    return {"role": "assistant", "content": None, "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}


@pytest.fixture
def farm_worker(session, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    # The plan is for DAY; the tablet and the assistant ask for "today", so their clock is pinned to that
    # morning (otherwise these tests only pass on DAY itself).
    import milh.api.kiosk as kiosk_api
    morning = NOW + timedelta(hours=4)  # 07:00 in Dubai on DAY
    monkeypatch.setattr(api_mod, "utcnow", lambda: morning)
    monkeypatch.setattr(kiosk_api, "utcnow", lambda: morning)
    _owner, farm, *_rest = _setup(session)
    plan_farm_day(session, farm.id, DAY, NOW)
    worker = make_user(session, role="worker")
    add_member(session, farm, worker)
    session.commit()
    return farm, worker


@pytest.fixture
def voice_on(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(api_mod.voice, "available", lambda lang=None: True)
    monkeypatch.setattr(api_mod.llm, "available", lambda: True)
    monkeypatch.setattr(api_mod.voice, "prepare", lambda text, lang: "a" * 24)
    heard: dict[str, str] = {"text": ""}
    monkeypatch.setattr(api_mod.voice, "transcribe", lambda *a, **k: heard["text"])
    return heard


def test_status_unavailable_without_keys(client, farm_worker, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    farm, worker = farm_worker
    monkeypatch.setattr(api_mod.llm, "available", lambda: False)
    r = client.get("/api/v1/assistant/status?lang=ur", headers=bearer(worker, farm.id)).json()
    assert r["available"] is False


def test_text_turn(client, farm_worker, voice_on, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    farm, worker = farm_worker
    monkeypatch.setattr(api_mod.llm, "complete", lambda m, t: (_tool("today_plan", block="3"), "fake"))
    r = client.post("/api/v1/assistant/text", json={"question": "block 3 kitna?", "lang": "en"},
                    headers=bearer(worker, farm.id))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "Block 3" in body["reply"] and body["audio_url"] == "/api/v1/assistant/audio/" + "a" * 24


def test_empty_transcript_says_not_heard(client, farm_worker, voice_on) -> None:  # type: ignore[no-untyped-def]
    farm, worker = farm_worker
    voice_on["text"] = ""
    r = client.post("/api/v1/assistant/ask", data={"lang": "en"}, files={"audio": ("q.webm", b"x", "audio/webm")},
                    headers=bearer(worker, farm.id)).json()
    assert "didn't catch" in r["reply"]


def test_echo_resumes(client, farm_worker, voice_on) -> None:  # type: ignore[no-untyped-def]
    farm, worker = farm_worker
    voice_on["text"] = "blue tap minutes"
    r = client.post("/api/v1/assistant/ask",
                    data={"lang": "en", "interrupted": "Block 3: 20 minutes on the blue tap"},
                    files={"audio": ("q.webm", b"x", "audio/webm")}, headers=bearer(worker, farm.id)).json()
    assert r["resume"] is True


def test_ask_requires_token(client) -> None:  # type: ignore[no-untyped-def]
    r = client.post("/api/v1/assistant/ask", data={"lang": "en"}, files={"audio": ("q.webm", b"x", "audio/webm")})
    assert r.status_code == 401


def test_audio_bad_id_404(client) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/api/v1/assistant/audio/not-an-id").status_code == 404


def test_lines_have_texts(client, farm_worker, voice_on) -> None:  # type: ignore[no-untyped-def]
    farm, worker = farm_worker
    r = client.get("/api/v1/assistant/lines?lang=ur", headers=bearer(worker, farm.id)).json()
    assert set(r["lines"]) == {"greeting", "ok", "wait", "not_heard"}
    assert r["lines"]["ok"]["text"]
