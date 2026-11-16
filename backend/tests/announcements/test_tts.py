import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
import respx

from milh.announcements.service import announce_now
from milh.announcements.tts import ElevenLabsTts, attach_audio, audio_for, generate_missing_audio
from tests.factories import make_farm, make_user

NOW = datetime(2026, 11, 16, 1, 0, tzinfo=UTC)


class FakeTts:
    def __init__(self, fail: bool = False) -> None:
        self.calls = 0
        self.fail = fail

    def voice_key(self, lang: str) -> str:
        return f"voice-{lang}"

    def synthesize(self, text: str, lang: str) -> bytes:
        self.calls += 1
        if self.fail:
            raise RuntimeError("quota")
        return b"ID3fake-mp3-" + text.encode()


def test_audio_for_caches(tmp_path: Path) -> None:
    tts = FakeTts()
    a = audio_for("Open the blue tap", "en", tts, tmp_path)
    b = audio_for("Open the blue tap", "en", tts, tmp_path)
    assert a == b and a.startswith("audio/") and a.endswith(".mp3")
    assert tts.calls == 1
    assert (tmp_path / a).read_bytes().startswith(b"ID3")


def test_audio_differs_by_language(tmp_path: Path) -> None:
    tts = FakeTts()
    assert audio_for("x", "en", tts, tmp_path) != audio_for("x", "ur", tts, tmp_path)


@respx.mock
def test_elevenlabs_request_shape() -> None:
    route = respx.post("https://api.elevenlabs.io/v1/text-to-speech/VOICE_UR").mock(
        return_value=httpx.Response(200, content=b"ID3audio"))
    with httpx.Client() as http:
        tts = ElevenLabsTts("key-123", "eleven_multilingual_v2", {"ur": "VOICE_UR"}, http)
        assert tts.synthesize("سلام", "ur") == b"ID3audio"
    req = route.calls.last.request
    assert req.headers["xi-api-key"] == "key-123"
    assert json.loads(req.content) == {"text": "سلام", "model_id": "eleven_multilingual_v2"}


def test_elevenlabs_missing_voice_raises() -> None:
    with httpx.Client() as http, pytest.raises(KeyError):
        ElevenLabsTts("k", "m", {"en": "V"}, http).synthesize("hi", "ur")


def test_attach_audio_tolerates_failure(session, tmp_path: Path) -> None:
    farm = make_farm(session, make_user(session))
    a = announce_now(session, farm.id, "tank_low", {"tank": "Main tank", "pct": 20}, NOW)
    attach_audio(session, a, FakeTts(fail=True), tmp_path)
    assert a.audio == {}
    attach_audio(session, a, FakeTts(), tmp_path)
    assert set(a.audio) == {"en", "ur"}


def test_generate_missing_audio_only_upcoming(session, tmp_path: Path) -> None:
    farm = make_farm(session, make_user(session))
    soon = announce_now(session, farm.id, "midday_break_end", {}, NOW + timedelta(hours=2))
    old = announce_now(session, farm.id, "midday_break_end", {}, NOW - timedelta(days=2))
    n = generate_missing_audio(session, FakeTts(), tmp_path, NOW)
    assert n == 1 and soon.audio and not old.audio
