"""Everything the farm kiosk needs for today in one payload, so it can be cached and used offline.

Missing data is sent as null and shown as an empty state; nothing is filled in.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.announcements.service import render_all
from milh.farm_config import get_farm_settings
from milh.models import Alert, Announcement, Block, Crop, Farm, IrrigationPlan, Reading, SoilTest, Tank, WaterSource
from milh.planning.soil_due import soil_due_for_block
from milh.sources.open_meteo import latest_snapshot, parse_daily, snapshot_age_h

WEATHER_STALE_H = 6.0


class KFarm(BaseModel):
    id: uuid.UUID
    name: str
    timezone: str
    languages: list[str]
    example_label: str | None


class KDaily(BaseModel):
    day: date
    et0_mm: float
    rain_mm: float
    tmax_c: float
    tmin_c: float | None
    rain_chance_pct: float | None


class KWeather(BaseModel):
    current: dict[str, float | int | str | None]
    daily: list[KDaily]
    fetched_at: datetime
    age_h: float
    source: str


class KSun(BaseModel):
    sunrise: datetime | None
    sunset: datetime | None


class KStep(BaseModel):
    source_id: str
    tap_label: dict[str, str]
    tap_color: str
    minutes: int


class KRun(BaseModel):
    plan_id: uuid.UUID
    block_id: uuid.UUID
    block_name: str
    crop_names: dict[str, str]
    slot: str | None
    start: datetime | None
    end: datetime | None
    minutes: int
    steps: list[KStep]
    flush: bool
    skip_reason: str | None
    text: dict[str, str]
    fallbacks: list[str]
    habit_minutes: int
    saved_l: float
    done: bool


class KAnnouncement(BaseModel):
    id: uuid.UUID
    type: str
    scheduled_at: datetime
    text: dict[str, str]
    audio: dict[str, str]
    status: str
    plan_id: uuid.UUID | None


class KTank(BaseModel):
    id: uuid.UUID
    name: str
    capacity_l: float
    level_pct: float | None
    volume_l: float | None
    measured_at: datetime | None
    source: str | None


class KSource(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    tap_label: dict[str, str]
    tap_color: str
    ec: float | None
    ec_measured_at: datetime | None
    ec_source: str | None
    declared_ec: float | None
    trend: Literal["up", "down", "flat"] | None
    stale: bool


class KSoil(BaseModel):
    ece: float | None
    ph: float | None
    moisture_vwc: float | None
    tested_on: date | None
    status: Literal["ok", "warn", "high", "none"]
    source: str | None


class KBlock(BaseModel):
    id: uuid.UUID
    name: str
    crop_key: str
    crop_names: dict[str, str]
    salt_threshold: float
    soil: KSoil
    next_test_due: date | None
    next_test_reasons: list[str]


class KAlert(BaseModel):
    id: uuid.UUID
    severity: str
    type: str
    message: dict[str, str]
    created_at: datetime


class KFresh(BaseModel):
    item: str
    age_h: float | None
    stale: bool


class KioskBundle(BaseModel):
    farm: KFarm
    day: date
    generated_at: datetime
    weather: KWeather | None
    sun: KSun | None
    runs: list[KRun]
    announcements: list[KAnnouncement]
    tanks: list[KTank]
    sources: list[KSource]
    blocks: list[KBlock]
    alerts: list[KAlert]
    freshness: list[KFresh]


def _age_h(now: datetime, t: datetime | None) -> float | None:
    return None if t is None else round((now - t).total_seconds() / 3600.0, 2)


def _latest(session: Session, *conds: object) -> list[Reading]:
    return list(session.scalars(select(Reading).where(*conds).order_by(Reading.measured_at.desc()).limit(3)))  # type: ignore[arg-type]


def _media(rel: dict[str, str]) -> dict[str, str]:
    return {lang: f"/media/{path}" for lang, path in rel.items()}


def build_bundle(session: Session, farm: Farm, now: datetime) -> KioskBundle:
    s = get_farm_settings(farm)
    tz = ZoneInfo(farm.timezone)
    day = now.astimezone(tz).date()
    fresh: list[KFresh] = []

    snap = latest_snapshot(session, farm.id)
    weather = sun = None
    if snap is not None:
        daily = parse_daily(snap.daily, farm.timezone)
        age = snapshot_age_h(snap, now)
        weather = KWeather(current=snap.current, fetched_at=snap.fetched_at, age_h=round(age, 2),
                           source="api:open-meteo",
                           daily=[KDaily(day=d.day, et0_mm=d.et0_mm, rain_mm=d.rain_mm, tmax_c=d.tmax_c,
                                         tmin_c=d.tmin_c, rain_chance_pct=d.rain_chance_pct) for d in daily])
        today = next((d for d in daily if d.day == day), None)
        if today is not None:
            sun = KSun(sunrise=today.sunrise, sunset=today.sunset)
        fresh.append(KFresh(item="weather", age_h=round(age, 2), stale=age > WEATHER_STALE_H))
    else:
        fresh.append(KFresh(item="weather", age_h=None, stale=True))

    sources = list(session.scalars(select(WaterSource).where(WaterSource.farm_id == farm.id)
                                   .order_by(WaterSource.position, WaterSource.name)))
    src_by_id = {str(w.id): w for w in sources}
    k_sources: list[KSource] = []
    for w in sources:
        rs = _latest(session, Reading.source_id == w.id, Reading.metric == "water_ec", Reading.measured_at <= now)
        latest = rs[0] if rs else None
        trend: Literal["up", "down", "flat"] | None = None
        if len(rs) >= 2 and rs[-1].value > 0:
            change = (rs[0].value - rs[-1].value) / rs[-1].value
            trend = "up" if change > 0.05 else "down" if change < -0.05 else "flat"
        src_age = _age_h(now, latest.measured_at) if latest else None
        stale = latest is None or (src_age is not None and src_age > s.stale_ec_days * 24)
        k_sources.append(KSource(id=w.id, name=w.name, kind=w.kind, tap_label=w.tap_label, tap_color=w.tap_color,
                                 ec=latest.value if latest else None,
                                 ec_measured_at=latest.measured_at if latest else None,
                                 ec_source=latest.source if latest else None, declared_ec=w.declared_ec,
                                 trend=trend, stale=stale))
        fresh.append(KFresh(item=f"water_ec:{w.name}", age_h=src_age, stale=stale))

    k_tanks: list[KTank] = []
    for t in session.scalars(select(Tank).where(Tank.farm_id == farm.id).order_by(Tank.name)):
        lvl = _latest(session, Reading.tank_id == t.id, Reading.metric.in_(["tank_level_pct", "tank_volume_l"]),
                      Reading.measured_at <= now)
        r = lvl[0] if lvl else None
        pct: float | None = None
        vol: float | None = None
        if r is not None:
            pct = r.value if r.metric == "tank_level_pct" else round(r.value / t.capacity_l * 100, 1)
            vol = r.value if r.metric == "tank_volume_l" else round(r.value / 100 * t.capacity_l)
        tank_age = _age_h(now, r.measured_at) if r else None
        k_tanks.append(KTank(id=t.id, name=t.name, capacity_l=t.capacity_l, level_pct=pct, volume_l=vol,
                             measured_at=r.measured_at if r else None, source=r.source if r else None))
        fresh.append(KFresh(item=f"tank:{t.name}", age_h=tank_age,
                            stale=tank_age is None or tank_age > s.tank_stale_h))

    blocks = list(session.scalars(select(Block).where(Block.farm_id == farm.id).order_by(Block.position, Block.name)))
    k_blocks: list[KBlock] = []
    for b in blocks:
        crop = session.get(Crop, b.crop_key)
        assert crop is not None
        test = session.scalars(select(SoilTest).where(SoilTest.block_id == b.id, SoilTest.tested_on <= day)
                               .order_by(SoilTest.tested_on.desc(), SoilTest.created_at.desc()).limit(1)).first()
        moist = _latest(session, Reading.block_id == b.id, Reading.metric == "soil_moisture_vwc",
                        Reading.measured_at <= now)
        status: Literal["ok", "warn", "high", "none"] = "none"
        if test is not None:
            status = ("high" if test.ece > crop.salt_a else
                      "warn" if test.ece >= s.soil_near_ratio * crop.salt_a else "ok")
        due = soil_due_for_block(session, b, s)
        k_blocks.append(KBlock(
            id=b.id, name=b.name, crop_key=b.crop_key, crop_names=crop.names, salt_threshold=crop.salt_a,
            soil=KSoil(ece=test.ece if test else None, ph=test.ph if test else None,
                       moisture_vwc=moist[0].value if moist else (test.moisture_vwc if test else None),
                       tested_on=test.tested_on if test else None, status=status,
                       source=test.source if test else None),
            next_test_due=due[0] if due else None, next_test_reasons=due[1] if due else [],
        ))

    block_by_id = {b.id: b for b in blocks}
    plans = list(session.scalars(select(IrrigationPlan).where(IrrigationPlan.farm_id == farm.id,
                                                              IrrigationPlan.day == day)))
    done_plans = set()
    if plans:
        from milh.models import IrrigationEvent

        done_plans = set(session.scalars(select(IrrigationEvent.plan_id).where(
            IrrigationEvent.plan_id.in_([p.id for p in plans]))))
    k_runs: list[KRun] = []
    for p in sorted(plans, key=lambda x: (x.start_at is None, x.start_at or now)):
        b = block_by_id[p.block_id]
        crop = session.get(Crop, b.crop_key)
        assert crop is not None
        steps = [KStep(source_id=st["source_id"], minutes=int(st["minutes"]),
                       tap_label=src_by_id[st["source_id"]].tap_label if st["source_id"] in src_by_id else {},
                       tap_color=src_by_id[st["source_id"]].tap_color if st["source_id"] in src_by_id else "#64748b")
                 for st in p.steps]
        k_runs.append(KRun(plan_id=p.id, block_id=b.id, block_name=b.name, crop_names=crop.names, slot=p.slot,
                           start=p.start_at, end=p.end_at, minutes=p.minutes, steps=steps, flush=p.flush,
                           skip_reason=p.skip_reason, text=p.text, fallbacks=p.fallbacks,
                           habit_minutes=b.habit_minutes, saved_l=p.saved_l, done=p.id in done_plans))

    lo = datetime.combine(day, time(0, 0), tzinfo=tz)
    anns = session.scalars(select(Announcement).where(
        Announcement.farm_id == farm.id, Announcement.scheduled_at >= lo,
        Announcement.scheduled_at < lo + timedelta(days=2), Announcement.status != "cancelled",
    ).order_by(Announcement.scheduled_at))
    k_anns = [KAnnouncement(id=a.id, type=a.type, scheduled_at=a.scheduled_at, text=a.text, audio=_media(a.audio),
                            status=a.status, plan_id=a.plan_id) for a in anns]

    k_alerts: list[KAlert] = []
    for al in session.scalars(select(Alert).where(Alert.farm_id == farm.id, Alert.resolved_at.is_(None))
                              .order_by(Alert.created_at.desc())):
        message = al.message or _alert_text(farm, al)
        k_alerts.append(KAlert(id=al.id, severity=al.severity, type=al.type, message=message, created_at=al.created_at))

    return KioskBundle(
        farm=KFarm(id=farm.id, name=farm.name, timezone=farm.timezone, languages=list(s.languages),
                   example_label=farm.example_label),
        day=day, generated_at=now, weather=weather, sun=sun, runs=k_runs, announcements=k_anns, tanks=k_tanks,
        sources=k_sources, blocks=k_blocks, alerts=k_alerts, freshness=fresh,
    )


def _alert_text(farm: Farm, al: Alert) -> dict[str, str]:
    try:
        return render_all(farm, al.type, al.slots)
    except KeyError:
        return {"en": al.type.replace("_", " ")}
