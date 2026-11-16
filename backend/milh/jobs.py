"""Background jobs. Each takes a session and `now` so it can be tested; worker.py runs them on a timer.

One failing farm never stops the others: errors are logged and that farm is retried next tick.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from milh import alerts
from milh.announcements.tts import TtsClient, generate_missing_audio
from milh.farm_config import get_farm_settings
from milh.models import Farm, IrrigationPlan
from milh.planning.planner import plan_farm_day
from milh.sources.open_meteo import WeatherUnavailable, refresh_weather
from milh.sources.soilgrids import SoilUnavailable, refresh_soil_profile

log = logging.getLogger(__name__)


def _each_farm(session: Session, farms: list[Farm], fn: Callable[[Farm], bool]) -> int:
    done = 0
    for farm in farms:
        try:
            if fn(farm):
                done += 1
            session.commit()
        except Exception:
            log.exception("job failed for farm %s", farm.id)
            session.rollback()
    return done


def _hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def run_daily_plans(session: Session, now: datetime) -> int:
    """At each farm's local plan time (default 03:00), compute today's plan once."""

    def one(farm: Farm) -> bool:
        tz = ZoneInfo(farm.timezone)
        local = now.astimezone(tz)
        plan_at = datetime.combine(local.date(), _hhmm(get_farm_settings(farm).daily_plan_time), tzinfo=tz)
        if local < plan_at:
            return False
        last = session.scalar(select(func.max(IrrigationPlan.computed_at)).where(
            IrrigationPlan.farm_id == farm.id, IrrigationPlan.day == local.date()))
        if last is not None and last >= plan_at:
            return False
        plan_farm_day(session, farm.id, local.date(), now)
        return True

    return _each_farm(session, list(session.scalars(select(Farm))), one)


def replan_dirty(session: Session, now: datetime) -> int:
    """Recompute today's plan for farms whose inputs changed (new reading, soil test, settings)."""

    def one(farm: Farm) -> bool:
        plan_farm_day(session, farm.id, now.astimezone(ZoneInfo(farm.timezone)).date(), now)
        farm.needs_replan = False
        return True

    return _each_farm(session, list(session.scalars(select(Farm).where(Farm.needs_replan.is_(True)))), one)


def refresh_all_weather(session: Session, http: httpx.Client) -> int:
    def one(farm: Farm) -> bool:
        try:
            refresh_weather(session, farm, http)
        except WeatherUnavailable as e:
            log.warning("weather refresh failed for %s: %s", farm.id, e)
            return False
        farm.needs_replan = True
        return True

    return _each_farm(session, list(session.scalars(select(Farm))), one)


def refresh_all_soil(session: Session, http: httpx.Client) -> int:
    def one(farm: Farm) -> bool:
        try:
            refresh_soil_profile(session, farm, http)
        except SoilUnavailable as e:
            log.warning("SoilGrids refresh failed for %s: %s", farm.id, e)
            return False
        return True

    return _each_farm(session, list(session.scalars(select(Farm))), one)


def staleness(session: Session, now: datetime) -> int:
    return _each_farm(session, list(session.scalars(select(Farm))),
                      lambda farm: bool(alerts.check_staleness(session, farm, now)))


def audio(session: Session, tts: TtsClient | None, media_dir: Path, now: datetime) -> int:
    n = generate_missing_audio(session, tts, media_dir, now)
    session.commit()
    return n
