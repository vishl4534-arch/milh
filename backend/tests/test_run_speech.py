"""The tablet's speaker button reads a block's own instruction when no announcement exists."""
import uuid

import milh.api.kiosk as kiosk_api
from tests.assistant.test_api import farm_worker  # noqa: F401  (pytest fixture)
from tests.factories import bearer


def _plan_id(client, farm, worker) -> str:  # type: ignore[no-untyped-def]
    bundle = client.get("/api/v1/kiosk/bundle", headers=bearer(worker, farm.id)).json()
    return next(r["plan_id"] for r in bundle["runs"] if r["steps"])


def test_speech_reads_the_plan_text(client, farm_worker) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, worker = farm_worker
    pid = _plan_id(client, farm, worker)
    r = client.get(f"/api/v1/kiosk/runs/{pid}/speech?lang=en", headers=bearer(worker, farm.id))
    assert r.status_code == 200
    body = r.json()
    assert "open the" in body["text"] and "minutes" in body["text"]  # what to do, not the agronomy
    assert "dS/m" not in body["text"] and "Kc" not in body["text"]
    assert body["audio_url"] is None  # no voice keys in tests: the tablet reads it with its own voice


def test_speech_uses_the_announcer_voice_when_available(client, farm_worker, monkeypatch) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, worker = farm_worker
    spoken: list[tuple[str, str]] = []
    monkeypatch.setattr(kiosk_api, "get_tts", lambda: object())

    def fake_audio(text: str, lang: str, tts: object, media: object) -> str:
        spoken.append((text, lang))
        return "audio/b.mp3"

    monkeypatch.setattr(kiosk_api, "audio_for", fake_audio)
    pid = _plan_id(client, farm, worker)
    body = client.get(f"/api/v1/kiosk/runs/{pid}/speech?lang=ur", headers=bearer(worker, farm.id)).json()
    assert body["audio_url"] == "/media/audio/b.mp3"  # the announcer's cached clip, like any announcement
    assert spoken and spoken[0] == (body["text"], "ur")


def test_speech_unknown_plan_is_404(client, farm_worker) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, worker = farm_worker
    r = client.get(f"/api/v1/kiosk/runs/{uuid.uuid4()}/speech", headers=bearer(worker, farm.id))
    assert r.status_code == 404
