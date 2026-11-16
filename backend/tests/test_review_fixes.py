"""Regression tests for the final-review findings."""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from milh import alerts
from milh.announcements.service import rebuild_day
from milh.ingestion.service import Provenance, ingest
from milh.models import Alert, Announcement, IrrigationEvent, IrrigationPlan
from milh.schemas.readings import ReadingIn
from tests.factories import add_member, bearer, make_config, make_farm, make_user

DAY = date(2026, 11, 16)


def _plan(session, farm, block, well, start_utc):  # type: ignore[no-untyped-def]
    p = IrrigationPlan(farm_id=farm.id, block_id=block.id, day=DAY, slot="morning", start_at=start_utc,
                       end_at=start_utc + timedelta(minutes=44), minutes=44,
                       steps=[{"source_id": str(well.id), "minutes": 44}], gross_l=1, fractions={}, habit_l=1,
                       saved_l=0, saved_aed=0, explanation={}, text={}, fallbacks=[])
    session.add(p)
    session.flush()
    return p


def test_rebuild_does_not_replay_past_or_done(session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, _d, block, _t = make_config(session, farm, today=DAY)
    plan = _plan(session, farm, block, well, datetime(2026, 11, 16, 2, 0, tzinfo=UTC))  # 06:00 Dubai
    rebuild_day(session, farm.id, DAY, datetime(2026, 11, 15, 23, 0, tzinfo=UTC))  # 03:00 local
    briefing = session.scalars(select(Announcement).where(Announcement.type == "daily_briefing")).one()
    briefing.status = "played"
    session.add(IrrigationEvent(id=uuid.uuid4(), plan_id=plan.id, block_id=block.id,
                                started_at=plan.start_at, minutes=44, method="tap"))
    session.flush()
    later = datetime(2026, 11, 16, 1, 30, tzinfo=UTC)  # 05:30 local: briefing is past, run not started
    created = rebuild_day(session, farm.id, DAY, later)
    live = [a for a in session.scalars(select(Announcement)) if a.status != "cancelled"]
    assert [a.type for a in live].count("daily_briefing") == 1
    assert not any(a.type.startswith("irrigation_") and a.status == "scheduled" for a in live)
    assert all(a.scheduled_at >= later for a in created)


def test_alert_resolves_when_condition_clears_and_fires_again(session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, _b, tank = make_config(session, farm)
    now = datetime(2026, 11, 16, 6, 0, tzinfo=UTC)
    prov = Provenance("manual", owner.id, None)

    def level(v: float, mins: int) -> None:
        ingest(session, [ReadingIn(farm_id=farm.id, tank_id=tank.id, metric="tank_level_pct", value=v, unit="%",
                                   measured_at=now + timedelta(minutes=mins))], prov, now=now + timedelta(hours=1))

    level(20, 0)
    level(80, 10)
    assert session.scalars(select(Alert)).one().resolved_at is not None
    level(15, 20)
    tank_alerts = session.scalars(select(Alert).where(Alert.type == "tank_low")).all()
    assert len(tank_alerts) == 2
    assert [a.type for a in session.scalars(select(Announcement))].count("tank_low") == 2


def test_water_too_salty_resolves_when_plan_is_fine(session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, block, _t = make_config(session, farm)
    alerts.raise_alert(session, farm.id, "water_too_salty", "critical", {"block": "B", "crop": "T"},
                       subject=str(block.id))
    alerts.resolve_alerts(session, farm.id, "water_too_salty", str(block.id))
    assert session.scalars(select(Alert)).one().resolved_at is not None


def test_habit_minutes_must_be_positive(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, _d, block, _t = make_config(session, farm)
    session.commit()
    r = client.patch(f"/api/v1/farms/{farm.id}/blocks/{block.id}", json={"habit_minutes": 0}, headers=bearer(owner))
    assert r.status_code == 422


def test_kiosk_pin_locks_after_repeated_failures(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    worker = make_user(session, role="worker", password=None, pin="4321")
    add_member(session, farm, worker)
    session.commit()
    key = client.post(f"/api/v1/farms/{farm.id}/devices", json={"name": "K", "kind": "kiosk"},
                      headers=bearer(owner)).json()["api_key"]
    for _ in range(5):
        assert client.post("/api/v1/auth/kiosk", json={"device_key": key, "pin": "0000"}).status_code == 401
    assert client.post("/api/v1/auth/kiosk", json={"device_key": key, "pin": "4321"}).status_code == 429
