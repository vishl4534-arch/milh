from dataclasses import replace

import pytest

from milh.agronomy.blend import SourceOption
from milh.planning.core import BlockInputs, DayWeather, PlanSettings, SourceState, plan_block
from tests.agronomy.fixtures import TOMATO

WELL = SourceOption("well", 3.6, 0.5)
DESAL = SourceOption("desal", 0.4, 5.0)
COSTS = {"well": 0.5, "desal": 5.0}
WX = DayWeather(et0_mm=6.1, rain_mm=0.0, age_h=1.0)
BASE = BlockInputs(
    block_id="b3", crop=TOMATO, days_after_planting=80, area_m2=1000, flow_l_per_h=15000, efficiency=0.9,
    habit_minutes=60, habit_source_id="well",
    sources=[SourceState(WELL, 1.0, False), SourceState(DESAL, 1.0, False)],
    tap_order=["well", "desal"], latest_ece=None, flush_due=False,
)


def test_plan_block_happy_path() -> None:
    p = plan_block(BASE, WX, PlanSettings(), COSTS)
    assert p.steps == [("well", 33), ("desal", 11)] and p.minutes == 44
    assert p.gross_l == pytest.approx(10957.3, rel=1e-3)
    assert p.saved_l == pytest.approx(15000 - 10957.3, rel=1e-3)
    assert p.saved_aed == pytest.approx(7.5 - 17.81, abs=0.02)
    # The habit applies 13.5 mm (after efficiency) for a 7.0 mm need: LF 0.48 leaches the root zone
    # to ECe 2.22 < 2.5, so the habit loses no yield to salt. It wastes water instead.
    assert p.explanation["habit_lf"] == pytest.approx(0.480, abs=1e-3)
    assert p.explanation["habit_ece"] == pytest.approx(2.22, abs=0.01)
    assert p.habit_yield_pct == pytest.approx(100.0) and p.plan_yield_pct == 100.0
    assert p.explanation["habit_deficit"] is False
    assert p.fallbacks == ["no_soil_test"] and p.skip_reason is None
    assert p.explanation["kc"] == pytest.approx(1.15) and p.explanation["stage"] == "mid"
    assert p.explanation["lr_cheapest_alone"] == pytest.approx(0.4045, abs=1e-3)


def test_plan_block_no_water_ec_uses_habit() -> None:
    p = plan_block(replace(BASE, sources=[]), WX, PlanSettings(), COSTS)
    assert p.minutes == 60 and p.steps == [("well", 60)] and "no_water_ec" in p.fallbacks
    assert p.saved_l == 0 and p.saved_aed == 0


def test_plan_block_no_forecast_uses_habit() -> None:
    p = plan_block(BASE, None, PlanSettings(), COSTS)
    assert "no_forecast" in p.fallbacks and p.minutes == 60


def test_plan_block_rain_skips() -> None:
    p = plan_block(BASE, DayWeather(6.1, 12.0, 1.0), PlanSettings(), COSTS)
    assert p.minutes == 0 and p.steps == [] and p.skip_reason == "rain"
    assert p.saved_l == 15000


def test_plan_block_no_need_skips() -> None:
    p = plan_block(BASE, DayWeather(0.0, 0.0, 1.0), PlanSettings(), COSTS)
    assert p.skip_reason == "no_need" and p.minutes == 0


def test_plan_block_flush_adds_water() -> None:
    p = plan_block(replace(BASE, flush_due=True), WX, PlanSettings(), COSTS)
    assert p.flush and p.minutes > 44


def test_plan_block_flush_adds_extra_once() -> None:
    base = plan_block(BASE, WX, PlanSettings(), COSTS)
    flush = plan_block(replace(BASE, flush_due=True), WX, PlanSettings(), COSTS)
    # 20 mm over 1000 m2 at 90 % efficiency = 22 222 L, not inflated again by the leaching requirement.
    assert flush.gross_l - base.gross_l == pytest.approx(20 * 1000 / 0.9, rel=1e-6)
    assert flush.explanation["flush_l"] == round(20 * 1000 / 0.9)


def test_plan_block_flush_still_runs_on_rain_day() -> None:
    p = plan_block(replace(BASE, flush_due=True), DayWeather(6.1, 12.0, 1.0), PlanSettings(), COSTS)
    assert p.minutes > 0 and p.skip_reason is None


def test_plan_block_stale_ec_flagged() -> None:
    stale = replace(BASE, sources=[SourceState(WELL, 20.0, False), SourceState(DESAL, 1.0, False)])
    assert "water_ec_stale:well" in plan_block(stale, WX, PlanSettings(), COSTS).fallbacks


def test_plan_block_declared_ec_flagged() -> None:
    declared = replace(BASE, sources=[SourceState(WELL, None, True), SourceState(DESAL, 1.0, False)])
    assert "water_ec_stale:well" in plan_block(declared, WX, PlanSettings(), COSTS).fallbacks


def test_plan_block_aquifer_saved_counts_only_wells() -> None:
    p = plan_block(replace(BASE, groundwater_ids=frozenset({"well"})), WX, PlanSettings(), COSTS)
    plan_well = p.gross_l * p.fractions["well"]
    assert p.aquifer_saved_l == pytest.approx(15000 - plan_well, rel=1e-3)
    assert p.explanation["habit_well_l"] == 15000
    assert p.explanation["plan_well_l"] == round(plan_well)
    # Without groundwater sources nothing counts as aquifer water.
    assert plan_block(BASE, WX, PlanSettings(), COSTS).aquifer_saved_l == 0


def test_plan_block_under_watering_habit_is_flagged_and_salty() -> None:
    # 10 minutes = 2500 L -> 2.25 mm reaches the soil, the crop needs 7.0 mm: almost nothing drains.
    p = plan_block(replace(BASE, habit_minutes=10), WX, PlanSettings(), COSTS)
    assert p.explanation["habit_deficit"] is True
    assert p.explanation["habit_lf"] == pytest.approx(0.05)
    assert p.habit_yield_pct is not None and p.habit_yield_pct < p.plan_yield_pct  # type: ignore[operator]


def test_plan_block_cap_exceeded_raises_alert_reason() -> None:
    salty = replace(BASE, sources=[SourceState(SourceOption("well", 14.0, 0.5), 1.0, False),
                                   SourceState(SourceOption("desal", 13.0, 5.0), 1.0, False)])
    p = plan_block(salty, WX, PlanSettings(), COSTS)
    assert p.cap_exceeded and p.plan_yield_pct is not None and p.plan_yield_pct < 100
    assert p.minutes > 0
