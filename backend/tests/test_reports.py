import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from milh.models import IrrigationEvent, IrrigationPlan
from milh.reports import water_report
from tests.factories import bearer, make_config, make_farm, make_user

D1, D2 = date(2026, 11, 15), date(2026, 11, 16)


def _plan(session, farm, block, day, gross, habit, saved_aed=1.0):  # type: ignore[no-untyped-def]
    p = IrrigationPlan(farm_id=farm.id, block_id=block.id, day=day, minutes=44, steps=[], gross_l=gross,
                       fractions={}, habit_l=habit, saved_l=habit - gross, saved_aed=saved_aed, explanation={},
                       text={}, fallbacks=[])
    session.add(p)
    session.flush()
    return p


def _setup(session):  # type: ignore[no-untyped-def]
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, block, _t = make_config(session, farm)
    return owner, farm, block


def test_report_sums_planned_vs_habit(session) -> None:
    _o, farm, block = _setup(session)
    _plan(session, farm, block, D1, 10000, 15000)
    _plan(session, farm, block, D2, 11000, 15000)
    r = water_report(session, farm.id, D1, D2)
    assert [d.day for d in r.days] == [D1, D2]
    assert r.totals.planned_l == 21000 and r.totals.habit_l == 30000 and r.totals.saved_l == 9000
    assert r.totals.saved_aed == pytest.approx(2.0)


def test_adherence_none_without_events(session) -> None:
    _o, farm, block = _setup(session)
    _plan(session, farm, block, D1, 10000, 15000)
    r = water_report(session, farm.id, D1, D1)
    assert r.days[0].actual_l is None and r.days[0].adherence_pct is None


def test_actual_from_events(session) -> None:
    _o, farm, block = _setup(session)
    p = _plan(session, farm, block, D1, 11000, 15000)
    session.add(IrrigationEvent(id=uuid.uuid4(), plan_id=p.id, block_id=block.id,
                                started_at=datetime(2026, 11, 15, 1, 0, tzinfo=UTC), minutes=44, method="tap"))
    session.flush()
    r = water_report(session, farm.id, D1, D1)
    assert r.days[0].actual_l == 11000  # 44 min x 15000 L/h
    assert r.days[0].adherence_pct == 100


def test_csv_header_and_rows(client, session) -> None:
    owner, farm, block = _setup(session)
    _plan(session, farm, block, D1, 10000, 15000)
    session.commit()
    r = client.get(f"/api/v1/farms/{farm.id}/reports/water.csv?start={D1}&end={D1 + timedelta(days=0)}",
                   headers=bearer(owner))
    lines = r.text.strip().splitlines()
    assert lines[0] == "day,planned_l,actual_l,habit_l,saved_l,saved_aed,adherence_pct,aquifer_saved_l"
    assert lines[1].startswith("2026-11-15,10000")
