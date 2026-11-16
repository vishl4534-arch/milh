from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from milh import alerts
from milh.ingestion.service import Provenance, ingest
from milh.models import Alert, Announcement, Device, SoilTest
from milh.schemas.readings import ReadingIn
from tests.factories import bearer, make_config, make_farm, make_user

NOW = datetime(2026, 11, 16, 6, 0, tzinfo=UTC)


def _farm(session):  # type: ignore[no-untyped-def]
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, desal, block, tank = make_config(session, farm, today=date(2026, 11, 16))
    return owner, farm, well, block, tank


def test_alert_dedup(session) -> None:
    _o, farm, *_ = _farm(session)
    a = alerts.raise_alert(session, farm.id, "tank_low", "warning", {"tank": "Main tank", "pct": 20}, subject="t1")
    b = alerts.raise_alert(session, farm.id, "tank_low", "warning", {"tank": "Main tank", "pct": 18}, subject="t1")
    assert a.id == b.id and b.slots["pct"] == 18
    assert len(session.scalars(select(Alert)).all()) == 1


def test_alert_message_rendered_and_worker_announcement(session) -> None:
    _o, farm, *_ = _farm(session)
    a = alerts.raise_alert(session, farm.id, "tank_low", "warning", {"tank": "Main tank", "pct": 20}, subject="t1",
                           now=NOW)
    assert "20" in a.message["en"] and a.message["ur"]
    assert [x.type for x in session.scalars(select(Announcement))] == ["tank_low"]


def test_owner_only_alert_not_announced(session) -> None:
    _o, farm, *_ = _farm(session)
    alerts.raise_alert(session, farm.id, "water_too_salty", "critical", {"block": "Block 3", "crop": "Tomato"},
                       subject="b", now=NOW)
    assert session.scalars(select(Announcement)).all() == []


def test_tank_stale_after_48h(session) -> None:
    owner, farm, _w, _b, tank = _farm(session)
    ingest(session, [ReadingIn(farm_id=farm.id, tank_id=tank.id, metric="tank_level_pct", value=70, unit="%",
                               measured_at=NOW - timedelta(hours=49))], Provenance("manual", owner.id, None), now=NOW)
    raised = alerts.check_staleness(session, farm, NOW)
    assert [a.type for a in raised] == ["data_stale"]


def test_tank_fresh_no_alert(session) -> None:
    owner, farm, _w, _b, tank = _farm(session)
    ingest(session, [ReadingIn(farm_id=farm.id, tank_id=tank.id, metric="tank_level_pct", value=70, unit="%",
                               measured_at=NOW - timedelta(hours=2))], Provenance("manual", owner.id, None), now=NOW)
    assert [a.type for a in alerts.check_staleness(session, farm, NOW)] == []


def test_device_offline(session) -> None:
    _o, farm, *_ = _farm(session)
    session.add(Device(farm_id=farm.id, name="Probe 1", kind="sensor", api_key_hash="x", key_prefix="p",
                       last_seen_at=NOW - timedelta(hours=30)))
    session.flush()
    assert "device_offline" in [a.type for a in alerts.check_staleness(session, farm, NOW)]


def test_soil_overdue_owner_only_no_announcement(session) -> None:
    _o, farm, _w, block, _t = _farm(session)
    session.add(SoilTest(block_id=block.id, tested_on=date(2026, 11, 1), ece=1.0, ph=7.5, source="manual"))
    session.flush()
    raised = alerts.check_staleness(session, farm, NOW)
    assert "soil_test_overdue" in [a.type for a in raised]
    assert "soil_test_overdue" not in [x.type for x in session.scalars(select(Announcement))]


def test_alerts_api_list_and_resolve(client, session) -> None:
    owner, farm, *_ = _farm(session)
    a = alerts.raise_alert(session, farm.id, "tank_low", "warning", {"tank": "Main tank", "pct": 20}, subject="t1")
    session.commit()
    got = client.get(f"/api/v1/farms/{farm.id}/alerts", headers=bearer(owner)).json()
    assert got[0]["id"] == str(a.id)
    assert client.post(f"/api/v1/alerts/{a.id}/resolve", headers=bearer(owner)).status_code == 200
    assert client.get(f"/api/v1/farms/{farm.id}/alerts", headers=bearer(owner)).json() == []
