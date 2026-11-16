"""Store, render and rebuild announcements."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.announcements.build import BUILD_TYPES, AnnouncementDraft, RunForAnnounce, build_day
from milh.announcements.templates import format_time, localized, render
from milh.farm_config import get_farm_settings
from milh.models import Announcement, Block, Crop, Farm, IrrigationPlan, WaterSource
from milh.planning.soil_due import soil_due_for_block
from milh.sources.open_meteo import latest_day_weather


def _resolve(value: Any, lang: str, tz: ZoneInfo) -> Any:
    if isinstance(value, dict):
        if "_time" in value:
            return format_time(datetime.fromisoformat(value["_time"]).astimezone(tz), lang)
        return localized(value, lang)
    return value


def render_slots(key: str, slots: dict[str, Any], lang: str, tz: ZoneInfo) -> str:
    if "main" in slots:
        main = render(key, lang, {k: _resolve(v, lang, tz) for k, v in slots["main"].items()})
        lines = [render(line["key"], lang, {k: _resolve(v, lang, tz) for k, v in line["slots"].items()})
                 for line in slots.get("lines", [])]
        return " ".join([main, *lines])
    return render(key, lang, {k: _resolve(v, lang, tz) for k, v in slots.items() if k != "step"})


def render_all(farm: Farm, key: str, slots: dict[str, Any]) -> dict[str, str]:
    tz = ZoneInfo(farm.timezone)
    return {lang: render_slots(key, slots, lang, tz) for lang in get_farm_settings(farm).languages}


def _store(session: Session, farm: Farm, d: AnnouncementDraft) -> Announcement:
    a = Announcement(farm_id=farm.id, type=d.type, scheduled_at=d.scheduled_at, template_key=d.template_key,
                     slots=d.slots, text=render_all(farm, d.template_key, d.slots), audio={}, status="scheduled",
                     plan_id=d.plan_id, custom=False, untranslated=[])
    session.add(a)
    return a


def _day_bounds(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time(0, 0), tzinfo=tz)
    return start, start + timedelta(days=1)


def rebuild_day(session: Session, farm_id: uuid.UUID, day: date, now: datetime) -> list[Announcement]:
    """Cancel the day's still-scheduled generated announcements and create fresh ones from the plans.
    Played/acknowledged history, custom messages and alert announcements are left alone."""
    farm = session.get(Farm, farm_id)
    assert farm is not None
    s = get_farm_settings(farm)
    tz = ZoneInfo(farm.timezone)
    lo, hi = _day_bounds(day, tz)
    for old in session.scalars(select(Announcement).where(
        Announcement.farm_id == farm_id, Announcement.scheduled_at >= lo, Announcement.scheduled_at < hi,
        Announcement.status == "scheduled", Announcement.custom.is_(False), Announcement.type.in_(BUILD_TYPES),
    )):
        old.status = "cancelled"

    sources = {str(ws.id): ws for ws in session.scalars(select(WaterSource).where(WaterSource.farm_id == farm_id))}
    blocks = list(session.scalars(select(Block).where(Block.farm_id == farm_id).order_by(Block.position, Block.name)))
    plans = {p.block_id: p for p in session.scalars(
        select(IrrigationPlan).where(IrrigationPlan.farm_id == farm_id, IrrigationPlan.day == day))}
    runs: list[RunForAnnounce] = []
    soil_due: list[tuple[str, date]] = []
    for b in blocks:
        crop = session.get(Crop, b.crop_key)
        assert crop is not None
        due = soil_due_for_block(session, b, s)
        if due is not None:
            soil_due.append((b.name, due[0]))
        p = plans.get(b.id)
        if p is None:
            continue
        steps = [(sources[st["source_id"]].tap_label or {"en": sources[st["source_id"]].name}, int(st["minutes"]))
                 for st in p.steps if st["source_id"] in sources]
        runs.append(RunForAnnounce(plan_id=p.id, block_name=b.name, crop_name=crop.names, start=p.start_at,
                                   steps=steps, flush=p.flush, skipped=p.skip_reason))

    wx = latest_day_weather(session, farm_id, day, now)
    sunrise = wx[0].sunrise if wx else None
    sunset = wx[0].sunset if wx else None
    tmax = wx[0].tmax_c if wx else None
    created = [_store(session, farm, d) for d in build_day(day, tz, runs, sunrise, sunset, tmax, soil_due, s)]
    session.flush()
    return created


def announce_now(session: Session, farm_id: uuid.UUID, type: str, slots: dict[str, Any],
                 now: datetime) -> Announcement:
    farm = session.get(Farm, farm_id)
    assert farm is not None
    a = _store(session, farm, AnnouncementDraft(type, now, type, slots))
    session.flush()
    return a
