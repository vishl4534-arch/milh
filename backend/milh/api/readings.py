from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.auth import Principal, current_principal, farm_for, optional_device, optional_principal
from milh.db import get_session
from milh.ingestion.service import IngestResult, Provenance, ingest
from milh.ingestion.soil import record_soil_test
from milh.ingestion.validation import IngestError
from milh.models import Device, Reading, SoilTest
from milh.schemas.readings import Metric, ReadingBatchIn, ReadingIn, ReadingOut
from milh.schemas.soil import SoilTestIn, SoilTestOut

router = APIRouter(prefix="/api/v1", tags=["data"])
DB = Annotated[Session, Depends(get_session)]


class IngestResultOut(BaseModel):
    reading_id: uuid.UUID | None
    status: str
    error: str | None
    message: str | None
    flags: list[str]


class IngestResponse(BaseModel):
    results: list[IngestResultOut]


def _out(results: list[IngestResult]) -> IngestResponse:
    return IngestResponse(results=[IngestResultOut(**r.__dict__) for r in results])


def _require_credentials(
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    if not authorization and not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Send a Bearer token or X-Api-Key")


@router.post("/readings", response_model=IngestResponse, dependencies=[Depends(_require_credentials)])
def post_readings(
    body: ReadingBatchIn | ReadingIn,
    session: DB,
    device: Annotated[Device | None, Depends(optional_device)],
    principal: Annotated[Principal | None, Depends(optional_principal)],
) -> IngestResponse:
    readings = body.readings if isinstance(body, ReadingBatchIn) else [body]
    if device is not None:
        prov = Provenance(f"device:{device.id}", None, device.id, device_farm_id=device.farm_id)
    elif principal is not None:
        for farm_id in {r.farm_id for r in readings}:
            farm_for(session, principal, farm_id)
        prov = Provenance("manual", principal.user.id, None)
    else:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Send a Bearer token or X-Api-Key")
    results = ingest(session, readings, prov)
    session.commit()
    return _out(results)


@router.get("/farms/{farm_id}/readings", response_model=list[ReadingOut])
def list_readings(
    farm_id: uuid.UUID,
    p: Annotated[Principal, Depends(current_principal)],
    session: DB,
    metric: Metric | None = None,
    source_id: uuid.UUID | None = None,
    tank_id: uuid.UUID | None = None,
    block_id: uuid.UUID | None = None,
    since: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
) -> list[Reading]:
    farm_for(session, p, farm_id)
    q = select(Reading).where(Reading.farm_id == farm_id)
    if metric:
        q = q.where(Reading.metric == metric)
    if source_id:
        q = q.where(Reading.source_id == source_id)
    if tank_id:
        q = q.where(Reading.tank_id == tank_id)
    if block_id:
        q = q.where(Reading.block_id == block_id)
    if since:
        q = q.where(Reading.measured_at >= since)
    return list(session.scalars(q.order_by(Reading.measured_at.desc()).limit(limit)))


@router.post("/farms/{farm_id}/soil-tests", response_model=SoilTestOut, status_code=201)
def post_soil_test(
    farm_id: uuid.UUID, body: SoilTestIn, p: Annotated[Principal, Depends(current_principal)], session: DB,
    via: Literal["form", "lab_report"] = "form",
) -> SoilTest:
    """`via=lab_report` records values the owner confirmed from a Gemini-read lab report."""
    farm = farm_for(session, p, farm_id)
    source, confirmed = ("gemini_extract", p.user.id) if via == "lab_report" else ("manual", None)
    try:
        test, _created = record_soil_test(session, farm, body, source, p.user.id, confirmed_by=confirmed)
    except IngestError as e:
        raise HTTPException(422, {"code": e.code, "message": e.message}) from e
    session.commit()
    return test


@router.get("/farms/{farm_id}/soil-tests", response_model=list[SoilTestOut])
def list_soil_tests(
    farm_id: uuid.UUID,
    p: Annotated[Principal, Depends(current_principal)],
    session: DB,
    block_id: uuid.UUID | None = None,
) -> list[SoilTest]:
    from milh.models import Block

    farm_for(session, p, farm_id)
    q = select(SoilTest).join(Block, Block.id == SoilTest.block_id).where(Block.farm_id == farm_id)
    if block_id:
        q = q.where(SoilTest.block_id == block_id)
    return list(session.scalars(q.order_by(SoilTest.tested_on.desc())))
