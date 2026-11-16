from datetime import UTC, datetime

from sqlalchemy import func, select

from milh import jobs
from milh.models import IrrigationPlan
from tests.planning.test_planner import _setup

# Dubai is UTC+4: 22:59 UTC = 02:59 local, 23:01 UTC = 03:01 local on 2026-11-16.
BEFORE = datetime(2026, 11, 15, 22, 59, tzinfo=UTC)
AFTER = datetime(2026, 11, 15, 23, 1, tzinfo=UTC)


def _plans(session) -> int:  # type: ignore[no-untyped-def]
    return session.scalar(select(func.count()).select_from(IrrigationPlan))


def test_daily_plan_job_runs_at_local_3am(session) -> None:
    _owner, farm, *_ = _setup(session)
    farm.needs_replan = False
    assert jobs.run_daily_plans(session, BEFORE) == 0 and _plans(session) == 0
    assert jobs.run_daily_plans(session, AFTER) == 1 and _plans(session) == 1
    assert jobs.run_daily_plans(session, AFTER) == 0  # already planned today


def test_replan_dirty_clears_flag(session) -> None:
    _owner, farm, *_ = _setup(session)
    farm.needs_replan = True
    assert jobs.replan_dirty(session, AFTER) == 1
    assert farm.needs_replan is False and _plans(session) == 1
    assert jobs.replan_dirty(session, AFTER) == 0


def test_job_errors_do_not_stop_other_farms(session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _o1, farm1, *_ = _setup(session)
    _o2, farm2, *_ = _setup(session)
    calls = []

    def flaky(s, farm_id, day, now):  # type: ignore[no-untyped-def]
        calls.append(farm_id)
        if farm_id == farm1.id:
            raise RuntimeError("boom")
        return []

    monkeypatch.setattr(jobs, "plan_farm_day", flaky)
    farm1.needs_replan = farm2.needs_replan = True
    jobs.replan_dirty(session, AFTER)
    assert set(calls) == {farm1.id, farm2.id}
