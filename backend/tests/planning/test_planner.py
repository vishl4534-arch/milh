import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

from milh.ingestion.service import Provenance, ingest
from milh.models import Alert, IrrigationPlan, WeatherSnapshot
from milh.planning.planner import plan_farm_day
from milh.schemas.readings import ReadingIn
from tests.factories import add_member, bearer, make_config, make_farm, make_user

FIXTURE = json.loads((Path(__file__).parents[1] / "fixtures" / "open_meteo_forecast.json").read_text())
DAY = date(2026, 11, 16)
NOW = datetime(2026, 11, 15, 23, 0, tzinfo=UTC)  # 03:00 in Dubai on DAY


def _weather(session, farm) -> None:  # type: ignore[no-untyped-def]
    session.add(WeatherSnapshot(farm_id=farm.id, fetched_at=NOW - timedelta(hours=1), current=FIXTURE["current"],
                                daily=FIXTURE["daily"], hourly={}))
    session.flush()


def _ec(session, owner, farm, source, value) -> None:  # type: ignore[no-untyped-def]
    ingest(session, [ReadingIn(farm_id=farm.id, source_id=source.id, metric="water_ec", value=value, unit="dS/m",
                               measured_at=NOW - timedelta(days=1))], Provenance("manual", owner.id, None), now=NOW)


def _setup(session, ec_well=3.6, ec_desal=0.4, weather=True):  # type: ignore[no-untyped-def]
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, desal, block, tank = make_config(session, farm, today=DAY)
    if weather:
        _weather(session, farm)
    if ec_well is not None:
        _ec(session, owner, farm, well, ec_well)
        _ec(session, owner, farm, desal, ec_desal)
    session.commit()
    return owner, farm, well, desal, block


def test_plan_farm_day_upserts_one_per_block(session) -> None:
    _owner, farm, *_ = _setup(session)
    plan_farm_day(session, farm.id, DAY, NOW)
    plans = plan_farm_day(session, farm.id, DAY, NOW)
    assert len(plans) == 1
    assert session.scalar(select(func.count()).select_from(IrrigationPlan)) == 1
    p = plans[0]
    assert p.minutes > 0 and [s["minutes"] for s in p.steps] and sum(s["minutes"] for s in p.steps) == p.minutes
    assert p.start_at is not None and p.start_at.astimezone(farm_tz(farm)).strftime("%H:%M") >= "05:00"
    assert farm.needs_replan is False


def farm_tz(farm):  # type: ignore[no-untyped-def]
    from zoneinfo import ZoneInfo

    return ZoneInfo(farm.timezone)


def test_plan_uses_declared_ec_when_no_reading(session) -> None:
    _owner, farm, well, desal, _block = _setup(session, ec_well=None)
    well.declared_ec, desal.declared_ec = 3.6, 0.4
    session.commit()
    p = plan_farm_day(session, farm.id, DAY, NOW)[0]
    assert f"water_ec_stale:{well.id}" in p.fallbacks
    assert "no_water_ec" not in p.fallbacks


def test_no_water_ec_uses_habit_minutes(session) -> None:
    _owner, farm, *_ = _setup(session, ec_well=None)
    p = plan_farm_day(session, farm.id, DAY, NOW)[0]
    assert p.minutes == 60 and "no_water_ec" in p.fallbacks


def test_no_forecast_uses_habit_minutes(session) -> None:
    _owner, farm, *_ = _setup(session, weather=False)
    p = plan_farm_day(session, farm.id, DAY, NOW)[0]
    assert p.minutes == 60 and "no_forecast" in p.fallbacks


def test_cap_exceeded_creates_alert(session) -> None:
    _owner, farm, *_ = _setup(session, ec_well=14.0, ec_desal=13.0)
    plan_farm_day(session, farm.id, DAY, NOW)
    assert "water_too_salty" in [a.type for a in session.scalars(select(Alert))]


def test_explanation_text_has_en_and_ur(session) -> None:
    _owner, farm, *_ = _setup(session)
    p = plan_farm_day(session, farm.id, DAY, NOW)[0]
    assert str(p.minutes) in p.text["en"] and str(p.minutes) in p.text["ur"]
    assert "60" in p.text["en"]


def test_recompute_endpoint_owner_only(client, session) -> None:
    owner, farm, *_ = _setup(session)
    worker = make_user(session, role="worker")
    add_member(session, farm, worker)
    session.commit()
    url = f"/api/v1/farms/{farm.id}/plans/recompute?day={DAY.isoformat()}"
    assert client.post(url, headers=bearer(worker, farm.id)).status_code == 403
    r = client.post(url, headers=bearer(owner))
    assert r.status_code == 200, r.text
    got = client.get(f"/api/v1/farms/{farm.id}/plans?day={DAY.isoformat()}", headers=bearer(worker, farm.id)).json()
    assert got[0]["block_name"] == "Block 3" and got[0]["text"]["en"]
