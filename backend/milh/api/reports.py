from __future__ import annotations

import csv
import io
import uuid
from dataclasses import asdict
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from milh.auth import Principal, current_principal, farm_for
from milh.db import get_session
from milh.reports import water_report

router = APIRouter(prefix="/api/v1", tags=["reports"])
DB = Annotated[Session, Depends(get_session)]
Member = Annotated[Principal, Depends(current_principal)]
MAX_DAYS = 400


def _check(start: date, end: date) -> None:
    if end < start or (end - start).days > MAX_DAYS:
        raise HTTPException(422, f"end must be on/after start and within {MAX_DAYS} days")


@router.get("/farms/{farm_id}/reports/water")
def get_water_report(farm_id: uuid.UUID, start: date, end: date, p: Member, session: DB) -> dict[str, Any]:
    farm_for(session, p, farm_id)
    _check(start, end)
    return asdict(water_report(session, farm_id, start, end))


@router.get("/farms/{farm_id}/reports/water.csv", response_class=PlainTextResponse)
def get_water_csv(farm_id: uuid.UUID, start: date, end: date, p: Member, session: DB) -> PlainTextResponse:
    farm_for(session, p, farm_id)
    _check(start, end)
    rep = water_report(session, farm_id, start, end)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["day", "planned_l", "actual_l", "habit_l", "saved_l", "saved_aed", "adherence_pct"])
    for r in rep.days:
        w.writerow([r.day.isoformat(), r.planned_l, "" if r.actual_l is None else r.actual_l, r.habit_l, r.saved_l,
                    r.saved_aed, "" if r.adherence_pct is None else r.adherence_pct])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="water_{start}_{end}.csv"'})
