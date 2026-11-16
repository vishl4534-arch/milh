from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
import respx

from milh.assistant import voice

STT = "https://api.elevenlabs.io/v1/speech-to-text"


@pytest.fixture
def settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):  # type: ignore[no-untyped-def]
    s = SimpleNamespace(assistant_enabled=True, elevenlabs_api_key="el-key",
                        elevenlabs_voice_ids={"en": "V_EN", "ur": "V_UR"},
                        elevenlabs_stt_model="scribe_v3", elevenlabs_tts_model_assistant="eleven_v4_turbo",
                        media_dir=tmp_path)
    monkeypatch.setattr(voice, "get_settings", lambda: s)
    return s


def test_available_needs_key_and_voice(settings) -> None:  # type: ignore[no-untyped-def]
    assert voice.available("ur")
    settings.elevenlabs_voice_ids = {"en": "V_EN"}
    assert not voice.available("ur")
    settings.elevenlabs_api_key = None
    assert not voice.available("en")


@respx.mock
def test_transcribe_request_shape(settings) -> None:  # type: ignore[no-untyped-def]
    route = respx.post(STT).mock(return_value=httpx.Response(200, json={"text": "(wind) Block 3 kitne minute?"}))
    text = voice.transcribe(b"webm-bytes", "q.webm", "audio/webm", "ur", ["Block 3"])
    assert text == "Block 3 kitne minute?"
    req = route.calls.last.request
    assert req.headers["xi-api-key"] == "el-key"
    body = req.content.decode("utf-8", "ignore")
    assert "scribe_v3" in body and "urd" in body and "tag_audio_events" in body and "Block 3" in body


@respx.mock
def test_transcribe_http_error_raises(settings) -> None:  # type: ignore[no-untyped-def]
    respx.post(STT).mock(return_value=httpx.Response(500, text="boom"))
    with pytest.raises(voice.VoiceError):
        voice.transcribe(b"x", "q.webm", "audio/webm", "en")


def test_sound_tags_removed() -> None:
    assert voice.without_sound_tags("(engine noise) [wind]  ") == ""
    assert voice.without_sound_tags("open (pause) the tap") == "open the tap"


def test_is_echo() -> None:
    line = "Block 3, tomato: 20 minutes on the blue tap"
    assert voice.is_echo("", line)
    assert voice.is_echo("blue tap 20 minutes", line)
    assert not voice.is_echo("what about block 1", line)


def test_audio_path_rejects_bad_id(settings) -> None:  # type: ignore[no-untyped-def]
    assert voice.audio_path("../../etc/passwd") is None
    assert voice.audio_path("0" * 24) is None  # valid shape, not cached


def test_prepare_cached_skips_fetch(settings, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    aid = voice.audio_id("Okay.", "en")
    path = settings.media_dir / "assistant" / f"{aid}.mp3"
    path.parent.mkdir(parents=True)
    path.write_bytes(b"ID3")
    started = []
    monkeypatch.setattr(voice._Fetch, "start", lambda self: started.append(self) or self)
    assert voice.prepare("Okay.", "en") == aid
    assert started == []
    assert voice.audio_path(aid) == path
