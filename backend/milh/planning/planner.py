"""Gather each block's inputs from the database, run the decision, schedule it, and store it."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from milh import alerts
from milh.agronomy.blend import SourceOption
from milh.agronomy.crops import crop_from_row
from milh.agronomy.timing import BlockRun, schedule_runs
from milh.ai import gemini as gemini_mod
from milh.announcements.templates import localized
from milh.farm_config import get_farm_settings
from milh.models import Block, Crop, Farm, IrrigationPlan, Reading, SoilTest, WaterSource
from milh.planning.core import BlockInputs, BlockPlan, DayWeather, PlanSettings, SourceState, plan_block
from milh.planning.explain import render_explanation
from milh.sources.open_meteo import latest_day_weather

FALLBACK_SUNRISE = time(6, 0)
FALLBACK_SUNSET = time(18, 0)


def _hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def source_states(session: Session, farm_id: uuid.UUID, now: datetime) -> list[SourceState]:
    out: list[SourceState] = []
    sources = session.scalars(select(WaterSource).where(WaterSource.farm_id == farm_id).order_by(WaterSource.position))
    for ws in sources:
        latest = session.scalars(
            select(Reading).where(Reading.source_id == ws.id, Reading.metric == "water_ec",
                                  Reading.measured_at <= now)
            .order_by(Reading.measured_at.desc()).limit(1)
        ).first()
        if latest is not None:
            age = (now - latest.measured_at).total_seconds() / 86400.0
            out.append(SourceState(SourceOption(str(ws.id), latest.value, ws.cost_per_m3), age, False))
        elif ws.declared_ec is not None:
            out.append(SourceState(SourceOption(str(ws.id), ws.declared_ec, ws.cost_per_m3), None, True))
    return out


def latest_soil_test(session: Session, block_id: uuid.UUID, day: date) -> SoilTest | None:
    return session.scalars(
        select(SoilTest).where(SoilTest.block_id == block_id, SoilTest.tested_on <= day)
        .order_by(SoilTest.tested_on.desc(), SoilTest.created_at.desc()).limit(1)
    ).first()


def _flush_recent(session: Session, block_id: uuid.UUID, day: date) -> bool:
    q = select(IrrigationPlan.id).where(
        IrrigationPlan.block_id == block_id, IrrigationPlan.flush.is_(True),
        IrrigationPlan.day >= day - timedelta(days=7), IrrigationPlan.day < day,
    )
    return session.scalars(q).first() is not None


def plan_farm_day(session: Session, farm_id: uuid.UUID, day: date, now: datetime) -> list[IrrigationPlan]:
    farm = session.get(Farm, farm_id)
    if farm is None:
        raise ValueError("unknown farm")
    s = get_farm_settings(farm)
    tz = ZoneInfo(farm.timezone)
    settings = PlanSettings(lr_cap=s.lr_cap, rain_threshold_mm=s.rain_threshold_mm,
                            flush_extra_mm=s.flush_extra_mm, stale_ec_days=s.stale_ec_days)

    sources = {ws.id: ws for ws in session.scalars(select(WaterSource).where(WaterSource.farm_id == farm_id))}
    states = source_states(session, farm_id, now)
    costs = {str(sid): ws.cost_per_m3 for sid, ws in sources.items()}
    tap_order = [str(ws.id) for ws in sorted(sources.values(), key=lambda w: (w.position, w.name))]
    groundwater = frozenset(str(sid) for sid, ws in sources.items() if ws.kind == "well")

    wx_row = latest_day_weather(session, farm_id, day, now)
    wx = DayWeather(wx_row[0].et0_mm, wx_row[0].rain_mm, wx_row[1]) if wx_row else None
    sunrise = (wx_row[0].sunrise if wx_row and wx_row[0].sunrise else datetime.combine(day, FALLBACK_SUNRISE, tz))
    sunset = (wx_row[0].sunset if wx_row and wx_row[0].sunset else datetime.combine(day, FALLBACK_SUNSET, tz))

    blocks = list(session.scalars(select(Block).where(Block.farm_id == farm_id).order_by(Block.position, Block.name)))
    results: list[tuple[Block, BlockPlan]] = []
    for b in blocks:
        crop_row = session.get(Crop, b.crop_key)
        assert crop_row is not None
        soil = latest_soil_test(session, b.id, day)
        crop = crop_from_row(crop_row)
        soil_stale = soil is not None and (day - soil.tested_on).days > s.stale_soil_days
        flush_due = (soil is not None and not soil_stale and soil.ece > crop.salt_a
                     and not _flush_recent(session, b.id, day))
        inp = BlockInputs(
            block_id=str(b.id), crop=crop, days_after_planting=(day - b.planting_date).days, area_m2=b.area_m2,
            flow_l_per_h=b.flow_l_per_h, efficiency=b.efficiency, habit_minutes=b.habit_minutes,
            habit_source_id=str(b.habit_source_id), sources=states, tap_order=tap_order,
            latest_ece=soil.ece if soil else None, flush_due=flush_due, groundwater_ids=groundwater,
        )
        bp = plan_block(inp, wx, settings, costs)
        if not wx_row:
            bp.fallbacks.append("no_sun_times")
        if soil_stale:
            bp.fallbacks.append("soil_test_stale")
        results.append((b, bp))

    runs = schedule_runs([BlockRun(str(b.id), bp.minutes) for b, bp in results], sunrise, sunset,
                         _hhmm(s.earliest_start), timedelta(minutes=s.morning_overrun_min),
                         timedelta(minutes=s.evening_offset_min))
    by_block = {r.block_id: r for r in runs}

    stored: list[IrrigationPlan] = []
    for b, bp in results:
        crop_row = session.get(Crop, b.crop_key)
        assert crop_row is not None
        run = by_block.get(str(b.id))
        text: dict[str, str] = {}
        text_source: dict[str, str] = {}
        gem = gemini_mod.get_gemini()
        for lang in s.languages:
            names = {str(sid): localized(ws.tap_label, lang) or ws.name for sid, ws in sources.items()}
            text[lang] = render_explanation(bp, localized(crop_row.names, lang), names, lang)
            text_source[lang] = "template"
            if gem is not None:
                reworded = gem.rephrase(bp.explanation, text[lang], lang)
                if reworded is not None:
                    text[lang], text_source[lang] = reworded, "gemini"
        row = session.scalars(
            select(IrrigationPlan).where(IrrigationPlan.block_id == b.id, IrrigationPlan.day == day)
        ).first()
        if row is None:
            row = IrrigationPlan(farm_id=farm_id, block_id=b.id, day=day)
            session.add(row)
        row.slot = run.slot if run else None
        row.start_at = run.start if run else None
        row.end_at = run.end if run else None
        row.minutes = bp.minutes
        row.steps = [{"source_id": sid, "minutes": m} for sid, m in bp.steps]
        row.gross_l = bp.gross_l
        row.fractions = bp.fractions
        row.ecw = bp.ecw
        row.lr = bp.lr
        row.cap_exceeded = bp.cap_exceeded
        row.flush = bp.flush
        row.habit_l = bp.habit_l
        row.saved_l = bp.saved_l
        row.saved_aed = bp.saved_aed
        row.habit_yield_pct = bp.habit_yield_pct
        row.plan_yield_pct = bp.plan_yield_pct
        row.explanation = {**bp.explanation, "text_source": text_source}
        row.text = text
        row.fallbacks = list(bp.fallbacks)
        row.skip_reason = bp.skip_reason
        row.computed_at = now
        if bp.cap_exceeded:
            alerts.raise_alert(session, farm_id, "water_too_salty", "critical",
                               {"block": b.name, "crop": localized(crop_row.names, "en")}, subject=str(b.id))
        elif not bp.fallbacks or bp.ecw is not None:
            alerts.resolve_alerts(session, farm_id, "water_too_salty", str(b.id), now)
        stored.append(row)
    farm.needs_replan = False
    session.flush()

    from milh.announcements.service import rebuild_day

    rebuild_day(session, farm_id, day, now)
    return stored
