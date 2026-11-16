from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.agronomy.crops import crop_from_row
from milh.agronomy.salt_clock import salt_clock
from milh.auth import Principal, current_principal, farm_for, owned_farm, require_role
from milh.db import get_session, utcnow
from milh.models import Block, Crop, IrrigationPlan, Reading, WaterSource
from milh.planning.planner import plan_farm_day

router = APIRouter(prefix="/api/v1", tags=["plans"])
DB = Annotated[Session, Depends(get_session)]


class StepOut(BaseModel):
    source_id: str
    minutes: int


class PlanOut(BaseModel):
    id: uuid.UUID
    block_id: uuid.UUID
    block_name: str
    crop_key: str
    day: date
    slot: str | None
    start_at: datetime | None
    end_at: datetime | None
    minutes: int
    steps: list[StepOut]
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
    explanation: dict[str, Any]
    text: dict[str, str]
    fallbacks: list[str]
    skip_reason: str | None
    computed_at: datetime


class SaltPoint(BaseModel):
    day: date
    ec: float
    source: str
    note: str | None


class SaltClockOut(BaseModel):
    source_id: uuid.UUID
    crop_key: str
    status: str
    n_readings: int
    span_days: int
    slope_per_year: float | None
    residual_sd: float | None
    current_ecw: float | None
    current_yield_pct: float | None
    date_loss_10: date | None
    date_loss_25: date | None
    suggested_crops: list[str]
    as_of: date | None
    stale: bool
    data_age_days: int | None
    points: list[SaltPoint]


def plan_out(session: Session, plans: list[IrrigationPlan]) -> list[PlanOut]:
    out = []
    for p in plans:
        b = session.get(Block, p.block_id)
        assert b is not None
        out.append(PlanOut(
            id=p.id, block_id=p.block_id, block_name=b.name, crop_key=b.crop_key, day=p.day, slot=p.slot,
            start_at=p.start_at, end_at=p.end_at, minutes=p.minutes, steps=[StepOut(**s) for s in p.steps],
            gross_l=p.gross_l, fractions=p.fractions, ecw=p.ecw, lr=p.lr, cap_exceeded=p.cap_exceeded,
            flush=p.flush, habit_l=p.habit_l, saved_l=p.saved_l, saved_aed=p.saved_aed,
            habit_yield_pct=p.habit_yield_pct, plan_yield_pct=p.plan_yield_pct, explanation=p.explanation,
            text=p.text, fallbacks=p.fallbacks, skip_reason=p.skip_reason, computed_at=p.computed_at,
        ))
    out.sort(key=lambda x: (x.start_at is None, x.start_at or datetime.max.replace(tzinfo=ZoneInfo("UTC"))))
    return out


def _local_today(tz: str) -> date:
    return utcnow().astimezone(ZoneInfo(tz)).date()


@router.get("/farms/{farm_id}/plans", response_model=list[PlanOut])
def get_plans(farm_id: uuid.UUID, p: Annotated[Principal, Depends(current_principal)], session: DB,
              day: date | None = None) -> list[PlanOut]:
    farm = farm_for(session, p, farm_id)
    day = day or _local_today(farm.timezone)
    rows = list(session.scalars(select(IrrigationPlan).where(IrrigationPlan.farm_id == farm_id,
                                                             IrrigationPlan.day == day)))
    return plan_out(session, rows)


@router.post("/farms/{farm_id}/plans/recompute", response_model=list[PlanOut])
def recompute(farm_id: uuid.UUID, p: Annotated[Principal, Depends(require_role("owner", "admin"))], session: DB,
              day: date | None = None) -> list[PlanOut]:
    farm = owned_farm(session, p, farm_id)
    day = day or _local_today(farm.timezone)
    plans = plan_farm_day(session, farm_id, day, utcnow())
    session.commit()
    return plan_out(session, plans)


@router.get("/farms/{farm_id}/salt-clock", response_model=SaltClockOut)
def get_salt_clock(farm_id: uuid.UUID, source_id: uuid.UUID, p: Annotated[Principal, Depends(current_principal)],
                   session: DB) -> SaltClockOut:
    farm = farm_for(session, p, farm_id)
    src = session.get(WaterSource, source_id)
    if src is None or src.farm_id != farm_id:
        raise HTTPException(404, "Source not found")
    blocks = list(session.scalars(select(Block).where(Block.farm_id == farm_id).order_by(Block.position)))
    block = next((b for b in blocks if b.habit_source_id == source_id), blocks[0] if blocks else None)
    if block is None:
        raise HTTPException(422, "Add a block first")
    crop_row = session.get(Crop, block.crop_key)
    assert crop_row is not None
    library = {c.key: crop_from_row(c) for c in session.scalars(select(Crop))}
    tz = ZoneInfo(farm.timezone)
    readings = list(session.scalars(select(Reading).where(Reading.source_id == source_id,
                                                          Reading.metric == "water_ec").order_by(Reading.measured_at)))
    pts = [(r.measured_at.astimezone(tz).date(), r.value) for r in readings]
    c = salt_clock(pts, crop_from_row(crop_row), library, _local_today(farm.timezone))
    return SaltClockOut(
        source_id=source_id, crop_key=crop_row.key, status=c.status, n_readings=c.n_readings, span_days=c.span_days,
        slope_per_year=c.slope_per_day * 365 if c.slope_per_day is not None else None, residual_sd=c.residual_sd,
        current_ecw=c.current_ecw, current_yield_pct=c.current_yield_pct, date_loss_10=c.date_loss_10,
        date_loss_25=c.date_loss_25, suggested_crops=c.suggested_crops, as_of=c.as_of, stale=c.stale,
        data_age_days=c.data_age_days,
        points=[SaltPoint(day=r.measured_at.astimezone(tz).date(), ec=r.value, source=r.source, note=r.note)
                for r in readings],
    )
