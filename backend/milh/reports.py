"""Water report: Milh's plan vs. what was confirmed done vs. the grower's habit, per day."""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.models import Block, IrrigationEvent, IrrigationPlan


@dataclass
class DayRow:
    day: date
    planned_l: float = 0.0
    actual_l: float | None = None
    habit_l: float = 0.0
    saved_l: float = 0.0
    saved_aed: float = 0.0
    adherence_pct: int | None = None


@dataclass
class Totals:
    planned_l: float = 0.0
    actual_l: float | None = None
    habit_l: float = 0.0
    saved_l: float = 0.0
    saved_aed: float = 0.0


@dataclass
class WaterReport:
    start: date
    end: date
    days: list[DayRow] = field(default_factory=list)
    totals: Totals = field(default_factory=Totals)


def water_report(session: Session, farm_id: uuid.UUID, start: date, end: date) -> WaterReport:
    plans = list(session.scalars(select(IrrigationPlan).where(
        IrrigationPlan.farm_id == farm_id, IrrigationPlan.day >= start, IrrigationPlan.day <= end)))
    flows = {b.id: b.flow_l_per_h for b in session.scalars(select(Block).where(Block.farm_id == farm_id))}
    events_by_plan: dict[uuid.UUID, float] = defaultdict(float)
    if plans:
        for ev in session.scalars(select(IrrigationEvent).where(IrrigationEvent.plan_id.in_([p.id for p in plans]))):
            assert ev.plan_id is not None
            events_by_plan[ev.plan_id] += ev.minutes * flows.get(ev.block_id, 0.0) / 60.0

    rows: dict[date, DayRow] = {}
    for p in plans:
        r = rows.setdefault(p.day, DayRow(p.day))
        r.planned_l += p.gross_l
        r.habit_l += p.habit_l
        r.saved_l += p.saved_l
        r.saved_aed += p.saved_aed
        if p.id in events_by_plan:
            r.actual_l = (r.actual_l or 0.0) + events_by_plan[p.id]
    report = WaterReport(start, end, sorted(rows.values(), key=lambda r: r.day))
    t = report.totals
    for r in report.days:
        r.planned_l, r.habit_l, r.saved_l = round(r.planned_l), round(r.habit_l), round(r.saved_l)
        r.saved_aed = round(r.saved_aed, 2)
        if r.actual_l is not None:
            r.actual_l = round(r.actual_l)
            r.adherence_pct = round(r.actual_l / r.planned_l * 100) if r.planned_l else None
            t.actual_l = (t.actual_l or 0.0) + r.actual_l
        t.planned_l += r.planned_l
        t.habit_l += r.habit_l
        t.saved_l += r.saved_l
        t.saved_aed = round(t.saved_aed + r.saved_aed, 2)
    return report
