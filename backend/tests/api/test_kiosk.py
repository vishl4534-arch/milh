from datetime import UTC, date, datetime, timedelta

from milh.announcements.service import announce_now
from milh.ingestion.service import Provenance, ingest
from milh.kiosk import build_bundle
from milh.models import SoilTest
from milh.schemas.readings import ReadingIn
from tests.factories import add_member, bearer, make_config, make_farm, make_user
from tests.planning.test_planner import DAY, NOW, _setup


def test_bundle_day_uses_farm_timezone(session) -> None:
    farm = make_farm(session, make_user(session))
    b = build_bundle(session, farm, datetime(2026, 11, 16, 21, 30, tzinfo=UTC))
    assert b.day == date(2026, 11, 17)


def test_bundle_empty_states(session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    make_config(session, farm)
    b = build_bundle(session, farm, NOW)
    assert b.weather is None and b.sun is None
    assert b.tanks[0].level_pct is None and b.tanks[0].measured_at is None
    assert b.sources[0].ec is None
    assert b.blocks[0].soil.status == "none" and b.blocks[0].next_test_due is None
    assert b.runs == []


def test_bundle_with_plan_and_readings(session) -> None:
    owner, farm, well, desal, block = _setup(session)
    from milh.planning.planner import plan_farm_day

    plan_farm_day(session, farm.id, DAY, NOW)
    session.add(SoilTest(block_id=block.id, tested_on=DAY - timedelta(days=1), ece=2.2, ph=7.8, source="manual"))
    session.flush()
    b = build_bundle(session, farm, NOW + timedelta(hours=1))
    assert b.weather is not None and b.sun is not None
    assert b.runs and b.runs[0].steps[0].tap_label["en"] == "blue tap"
    assert b.sources[0].ec == 3.6
    soil = b.blocks[0]
    assert soil.soil.status == "warn" and soil.next_test_due == DAY - timedelta(days=1) + timedelta(days=7)
    assert any(a.type == "irrigation_start" for a in b.announcements)


def test_bundle_tank_level_and_alert(session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, _b, tank = make_config(session, farm)
    ingest(session, [ReadingIn(farm_id=farm.id, tank_id=tank.id, metric="tank_level_pct", value=20, unit="%",
                               measured_at=NOW - timedelta(hours=1))], Provenance("manual", owner.id, None), now=NOW)
    b = build_bundle(session, farm, NOW)
    assert b.tanks[0].level_pct == 20
    assert b.alerts[0].type == "tank_low" and "20" in b.alerts[0].message["en"]


def test_bundle_includes_audio_urls(session) -> None:
    farm = make_farm(session, make_user(session))
    a = announce_now(session, farm.id, "midday_break_end", {}, NOW)
    a.audio = {"en": "audio/abc.mp3"}
    session.flush()
    b = build_bundle(session, farm, NOW)
    assert b.announcements[0].audio == {"en": "/media/audio/abc.mp3"}


def test_worker_token_cannot_fetch_other_farm(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    other = make_farm(session, owner, name="Other")
    worker = make_user(session, role="worker")
    add_member(session, farm, worker)
    session.commit()
    assert client.get("/api/v1/kiosk/bundle", headers=bearer(worker, farm.id)).status_code == 200
    r = client.get(f"/api/v1/kiosk/bundle?farm_id={other.id}", headers=bearer(worker, farm.id))
    assert r.status_code == 404


def test_owner_needs_farm_id(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    session.commit()
    assert client.get("/api/v1/kiosk/bundle", headers=bearer(owner)).status_code == 422
    assert client.get(f"/api/v1/kiosk/bundle?farm_id={farm.id}", headers=bearer(owner)).status_code == 200
