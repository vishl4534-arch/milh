"""Announcements always play in the current announcer voice: old-voice clips are replaced, and a missing clip
is made on demand instead of leaving the tablet to read it with its own voice."""
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

import milh.api.kiosk as kiosk_api
import milh.kiosk as kiosk_mod
from milh.announcements.tts import attach_audio, clip_rel, current_audio, stale_langs
from milh.models import Announcement
from tests.assistant.test_api import NOW, farm_worker  # noqa: F401  (pytest fixture)
from tests.factories import bearer


class FakeTts:
    def __init__(self, voice: str) -> None:
        self.voice = voice
        self.calls: list[tuple[str, str]] = []

    def voice_key(self, lang: str) -> str:
        return f"model:{self.voice}:v2"

    def synthesize(self, text: str, lang: str) -> bytes:
        self.calls.append((text, lang))
        return b"mp3"


def _ann(session, farm) -> Announcement:  # type: ignore[no-untyped-def]
    a = Announcement(farm_id=farm.id, type="custom", scheduled_at=NOW + timedelta(hours=5),
                     text={"en": "Close the blue tap", "ur": "نیلا نل بند کریں"}, audio={}, custom=True)
    session.add(a)
    session.commit()
    return a


def test_old_voice_clips_are_replaced(session, farm_worker, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, _ = farm_worker
    a = _ann(session, farm)
    old, new = FakeTts("old"), FakeTts("amjid")
    attach_audio(session, a, old, tmp_path)
    assert stale_langs(a, old) == [] and set(stale_langs(a, new)) == {"en", "ur"}
    assert current_audio(a, new) == {}  # the tablet is never handed the old voice
    assert attach_audio(session, a, new, tmp_path) == 2
    assert a.audio == {lang: clip_rel(a.text[lang], lang, new) for lang in ("en", "ur")}
    assert len(new.calls) == 2


def test_announcement_speech_makes_the_clip_now(client, session, farm_worker, monkeypatch, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, worker = farm_worker
    a = _ann(session, farm)
    tts = FakeTts("amjid")
    monkeypatch.setattr(kiosk_api, "get_tts", lambda: tts)
    monkeypatch.setattr(kiosk_api, "get_settings", lambda: type("S", (), {"media_dir": str(tmp_path)})())
    body = client.get(f"/api/v1/kiosk/announcements/{a.id}/speech?lang=ur", headers=bearer(worker, farm.id)).json()
    assert body["audio_url"] == f"/media/{clip_rel(a.text['ur'], 'ur', tts)}"
    assert tts.calls == [(a.text["ur"], "ur")]
    session.expire_all()
    stored = session.scalars(select(Announcement).where(Announcement.id == a.id)).one()
    assert stored.audio["ur"] == clip_rel(a.text["ur"], "ur", tts)  # kept, so it caches for offline


def test_bundle_hides_old_voice_clips(client, session, farm_worker, monkeypatch) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, worker = farm_worker
    a = _ann(session, farm)
    a.audio = {"en": "audio/old-voice.mp3"}
    session.commit()
    monkeypatch.setattr(kiosk_mod, "get_tts", lambda: FakeTts("amjid"))
    monkeypatch.setattr(kiosk_api, "_fill_audio", lambda farm_id: None)
    bundle = client.get("/api/v1/kiosk/bundle", headers=bearer(worker, farm.id)).json()
    mine = next(x for x in bundle["announcements"] if x["id"] == str(a.id))
    assert mine["audio"] == {}  # so the tablet asks for a clip in the new voice


def test_announcement_speech_other_farm_is_refused(client, session, farm_worker) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    farm, worker = farm_worker
    a = _ann(session, farm)
    r = client.get(f"/api/v1/kiosk/announcements/{a.id}/speech?lang=en")
    assert r.status_code in (401, 403)
