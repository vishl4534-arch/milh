import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from milh.announcements.service import announce_now, rebuild_day
from milh.models import Announcement, IrrigationPlan
from tests.factories import add_member, bearer, make_config, make_farm, make_user

DAY = date(2026, 11, 16)
NOW = datetime(2026, 11, 15, 23, 0, tzinfo=UTC)


def _plan(session, farm, block, well):  # type: ignore[no-untyped-def]
    p = IrrigationPlan(farm_id=farm.id, block_id=block.id, day=DAY, slot="morning",
                       start_at=datetime(2026, 11, 16, 1, 3, tzinfo=UTC),
                       end_at=datetime(2026, 11, 16, 1, 47, tzinfo=UTC),
                       minutes=44, steps=[{"source_id": str(well.id), "minutes": 44}], gross_l=1, fractions={},
                       habit_l=1, saved_l=0, saved_aed=0, explanation={}, text={}, fallbacks=[])
    session.add(p)
    session.flush()
    return p


def test_rebuild_day_cancels_unplayed_only(session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, _d, block, _t = make_config(session, farm, today=DAY)
    _plan(session, farm, block, well)
    first = rebuild_day(session, farm.id, DAY, NOW)
    played = next(a for a in first if a.type == "daily_briefing")
    played.status = "played"
    alert_ann = announce_now(session, farm.id, "tank_low", {"tank": "Main tank", "pct": 20}, NOW)
    second = rebuild_day(session, farm.id, DAY, NOW)
    statuses = {a.id: a.status for a in session.scalars(select(Announcement))}
    assert statuses[played.id] == "played"
    assert statuses[alert_ann.id] == "scheduled"
    assert all(statuses[a.id] == "cancelled" for a in first if a.id != played.id)
    assert all(statuses[a.id] == "scheduled" for a in second)
    start = next(a for a in second if a.type == "irrigation_start")
    assert "blue tap" in start.text["en"] and "نیلا نل" in start.text["ur"]


def test_rebuild_day_cancels_run_that_spilled_past_midnight(session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, _d, block, _t = make_config(session, farm, today=DAY)
    p = _plan(session, farm, block, well)
    # A long run that ended after midnight: its stop announcement is dated the next day.
    p.end_at = datetime(2026, 11, 16, 21, 30, tzinfo=UTC)
    p.minutes = 1227
    p.steps = [{"source_id": str(well.id), "minutes": 1227}]
    first = rebuild_day(session, farm.id, DAY, NOW)
    tz = ZoneInfo(farm.timezone)
    def local_day(a: Announcement) -> date:
        return a.scheduled_at.replace(tzinfo=a.scheduled_at.tzinfo or UTC).astimezone(tz).date()

    late = [a for a in first if a.plan_id == p.id and local_day(a) > DAY]
    assert late, "the long run should have an announcement after midnight"
    p.end_at, p.minutes, p.steps = datetime(2026, 11, 16, 1, 47, tzinfo=UTC), 44, [{"source_id": str(well.id),
                                                                                     "minutes": 44}]
    rebuild_day(session, farm.id, DAY, NOW)
    statuses = {a.id: a.status for a in session.scalars(select(Announcement))}
    assert all(statuses[a.id] == "cancelled" for a in late)


def test_irrigation_event_idempotent_and_acknowledges(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, _d, block, _t = make_config(session, farm, today=DAY)
    worker = make_user(session, role="worker")
    add_member(session, farm, worker)
    plan = _plan(session, farm, block, well)
    rebuild_day(session, farm.id, DAY, NOW)
    session.commit()
    body = {"id": str(uuid.uuid4()), "plan_id": str(plan.id), "block_id": str(block.id), "source_id": str(well.id),
            "started_at": "2026-11-16T05:03:00+04:00", "minutes": 44, "method": "tap"}
    for _ in range(2):
        r = client.post("/api/v1/irrigation-events", json=body, headers=bearer(worker, farm.id))
        assert r.status_code == 201, r.text
    from milh.models import IrrigationEvent

    assert len(session.scalars(select(IrrigationEvent)).all()) == 1
    start = session.scalars(select(Announcement).where(Announcement.type == "irrigation_start")).one()
    assert start.status == "acknowledged"


def test_custom_announcement_and_played(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    session.commit()
    r = client.post(f"/api/v1/farms/{farm.id}/announcements", json={"text": "Truck arrives at 10", "lang": "en"},
                    headers=bearer(owner))
    assert r.status_code == 201, r.text
    ann = r.json()
    assert ann["text"]["en"] == "Truck arrives at 10"
    assert client.post(f"/api/v1/announcements/{ann['id']}/played", headers=bearer(owner)).status_code == 200
    assert session.get(Announcement, uuid.UUID(ann["id"])).status == "played"
