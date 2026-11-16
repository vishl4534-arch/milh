"""The daily decision for one block: minutes per water source, with every input and fallback recorded.

Pure: no database, no network. planner.py gathers the inputs and stores the result.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from milh.agronomy.blend import SourceOption, choose_blend, split_minutes
from milh.agronomy.crops import CropParams, kc_for_day
from milh.agronomy.salt_clock import yield_pct
from milh.agronomy.water import (
    crop_et_mm,
    ece_from_lf,
    effective_rain_mm,
    leaching_fraction,
    net_irrigation_mm,
    runtime_minutes,
)


@dataclass(frozen=True)
class SourceState:
    option: SourceOption
    ec_age_days: float | None  # None when the EC comes from the owner's declared value
    from_declared: bool


@dataclass(frozen=True)
class BlockInputs:
    block_id: str
    crop: CropParams
    days_after_planting: int
    area_m2: float
    flow_l_per_h: float
    efficiency: float
    habit_minutes: int
    habit_source_id: str
    sources: list[SourceState]  # only sources with a known EC (measured or declared)
    tap_order: list[str]
    latest_ece: float | None
    flush_due: bool
    groundwater_ids: frozenset[str] = frozenset()  # sources pumped from the aquifer (wells)


@dataclass(frozen=True)
class DayWeather:
    et0_mm: float
    rain_mm: float
    age_h: float


@dataclass(frozen=True)
class PlanSettings:
    lr_cap: float = 0.3
    rain_threshold_mm: float = 5.0
    flush_extra_mm: float = 20.0
    stale_ec_days: int = 14


@dataclass(frozen=True)
class BlockPlan:
    block_id: str
    minutes: int
    steps: list[tuple[str, int]]
    gross_l: float
    fractions: dict[str, float]
    ecw: float | None
    lr: float | None
    cap_exceeded: bool
    flush: bool
    habit_l: float
    saved_l: float
    saved_aed: float
    habit_yield_pct: float | None
    plan_yield_pct: float | None
    explanation: dict[str, Any] = field(default_factory=dict)
    fallbacks: list[str] = field(default_factory=list)
    skip_reason: Literal["rain", "no_need"] | None = None
    aquifer_saved_l: float = 0.0  # groundwater the habit pumps minus what the plan pumps


def _habit_plan(inp: BlockInputs, reason: str, fallbacks: list[str], wx: DayWeather | None) -> BlockPlan:
    habit_l = inp.habit_minutes * inp.flow_l_per_h / 60.0
    steps = [(inp.habit_source_id, inp.habit_minutes)] if inp.habit_minutes > 0 else []
    well_l = habit_l if inp.habit_source_id in inp.groundwater_ids else 0.0
    return BlockPlan(
        block_id=inp.block_id, minutes=inp.habit_minutes, steps=steps, gross_l=habit_l,
        fractions={inp.habit_source_id: 1.0}, ecw=None, lr=None, cap_exceeded=False, flush=False,
        habit_l=habit_l, saved_l=0.0, saved_aed=0.0, habit_yield_pct=None, plan_yield_pct=None,
        explanation={"habit_fallback": True, "reason": reason, "minutes": inp.habit_minutes,
                     "habit_minutes": inp.habit_minutes, "habit_well_l": round(well_l),
                     "plan_well_l": round(well_l), "aquifer_saved_l": 0,
                     "weather_age_h": wx.age_h if wx else None},
        fallbacks=[reason, *fallbacks],
    )


def plan_block(
    inp: BlockInputs, wx: DayWeather | None, s: PlanSettings, source_costs: dict[str, float]
) -> BlockPlan:
    fallbacks: list[str] = []
    for st in inp.sources:
        if st.from_declared or (st.ec_age_days is not None and st.ec_age_days > s.stale_ec_days):
            fallbacks.append(f"water_ec_stale:{st.option.source_id}")
    if inp.latest_ece is None:
        fallbacks.append("no_soil_test")

    if wx is None:
        return _habit_plan(inp, "no_forecast", fallbacks, wx)
    if not inp.sources:
        return _habit_plan(inp, "no_water_ec", fallbacks, wx)

    kc, stage = kc_for_day(inp.crop, inp.days_after_planting)
    etc = crop_et_mm(wx.et0_mm, kc)
    rain_eff = effective_rain_mm(wx.rain_mm, s.rain_threshold_mm)
    extra = s.flush_extra_mm if inp.flush_due else 0.0
    crop_net = net_irrigation_mm(etc, rain_eff)
    net = crop_net + extra

    # The leaching requirement scales the crop's water; a flush is itself leaching water, so it is added
    # after (only divided by application efficiency), not inflated by the LR a second time.
    blend = choose_blend([st.option for st in inp.sources], crop_net, inp.area_m2, inp.crop.salt_a,
                         inp.efficiency, s.lr_cap)
    flush_l = extra * inp.area_m2 / inp.efficiency if extra > 0 else 0.0
    unit_cost = sum(f * source_costs.get(sid, 0.0) for sid, f in blend.fractions.items())
    gross_l = blend.gross_l + flush_l
    plan_cost = blend.cost_aed + flush_l / 1000.0 * unit_cost
    minutes_f = runtime_minutes(gross_l, inp.flow_l_per_h)
    steps = split_minutes(minutes_f, blend.fractions, inp.tap_order)
    minutes = sum(m for _, m in steps)

    habit_l = inp.habit_minutes * inp.flow_l_per_h / 60.0
    habit_cost = habit_l / 1000.0 * source_costs.get(inp.habit_source_id, 0.0)
    habit_ec = next((st.option.ec for st in inp.sources if st.option.source_id == inp.habit_source_id), None)
    # The habit's own leaching: what it applies against what the crop uses (no flush; the habit has none).
    need_mm = max(0.0, etc - rain_eff)
    habit_lf = leaching_fraction(habit_l, need_mm, inp.area_m2, inp.efficiency)
    habit_deficit = habit_l * inp.efficiency / inp.area_m2 < need_mm if inp.area_m2 > 0 else False
    habit_ece = ece_from_lf(habit_ec, habit_lf) if habit_ec is not None else None
    habit_yield = (yield_pct(habit_ece, inp.crop.salt_a, inp.crop.salt_b)
                   if habit_ece is not None else None)
    plan_ece = ece_from_lf(blend.ecw, blend.lr) if blend.lr > 0 else blend.ecw
    plan_yield = (yield_pct(plan_ece, inp.crop.salt_a, inp.crop.salt_b) if blend.cap_exceeded else 100.0)

    habit_well_l = habit_l if inp.habit_source_id in inp.groundwater_ids else 0.0
    plan_well_l = gross_l * sum(f for sid, f in blend.fractions.items() if sid in inp.groundwater_ids)
    if net <= 0:
        plan_well_l = 0.0
    aquifer_saved = habit_well_l - plan_well_l

    skip: Literal["rain", "no_need"] | None = None
    if net <= 0:
        skip = "rain" if rain_eff > 0 else "no_need"

    explanation: dict[str, Any] = {
        "et0": round(wx.et0_mm, 2), "rain": round(wx.rain_mm, 1), "rain_eff": round(rain_eff, 1),
        "kc": round(kc, 3), "stage": stage, "etc": round(etc, 2), "net_mm": round(net, 2),
        "ecw": round(blend.ecw, 2), "lr": round(blend.lr, 4),
        "lr_cheapest_alone": round(blend.lr_cheapest_alone, 4) if blend.lr_cheapest_alone is not None else None,
        "lr_cap": s.lr_cap, "fractions": {k: round(v, 3) for k, v in blend.fractions.items()},
        "gross_l": round(gross_l), "flush_l": round(flush_l), "minutes": minutes,
        "habit_minutes": inp.habit_minutes,
        "saved_l": round(habit_l - gross_l), "saved_aed": round(habit_cost - plan_cost, 2),
        "habit_yield_pct": round(habit_yield, 1) if habit_yield is not None else None,
        "plan_yield_pct": round(plan_yield, 1),
        "yield_note": "estimate (FAO-29 Maas-Hoffman; root-zone ECe from each option's own leaching fraction)",
        "habit_lf": round(habit_lf, 3), "habit_ece": round(habit_ece, 2) if habit_ece is not None else None,
        "habit_deficit": habit_deficit, "plan_ece": round(plan_ece, 2),
        "habit_well_l": round(habit_well_l), "plan_well_l": round(plan_well_l),
        "aquifer_saved_l": round(aquifer_saved),
        "flush": inp.flush_due, "cap_exceeded": blend.cap_exceeded, "weather_age_h": round(wx.age_h, 1),
    }
    return BlockPlan(
        block_id=inp.block_id, minutes=minutes, steps=steps, gross_l=gross_l, fractions=blend.fractions,
        ecw=blend.ecw, lr=blend.lr, cap_exceeded=blend.cap_exceeded, flush=inp.flush_due, habit_l=habit_l,
        saved_l=habit_l - gross_l, saved_aed=habit_cost - plan_cost, habit_yield_pct=habit_yield,
        plan_yield_pct=plan_yield, explanation=explanation, fallbacks=fallbacks, skip_reason=skip,
        aquifer_saved_l=aquifer_saved,
    )
