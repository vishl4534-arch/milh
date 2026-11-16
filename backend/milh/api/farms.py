from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from milh.auth import Principal, current_principal, farm_for, owned_farm, require_role
from milh.db import get_session
from milh.farm_config import get_farm_settings
from milh.models import Block, Crop, Farm, FarmMember, Tank, WaterSource
from milh.schemas.farms import (
    BlockIn,
    BlockOut,
    BlockPatch,
    CropOut,
    FarmIn,
    FarmOut,
    FarmPatch,
    FarmSettings,
    SourceIn,
    SourceOut,
    SourcePatch,
    TankIn,
    TankOut,
)

router = APIRouter(prefix="/api/v1", tags=["farms"])
DB = Annotated[Session, Depends(get_session)]
Anyone = Annotated[Principal, Depends(current_principal)]
Owner = Annotated[Principal, Depends(require_role("owner", "admin"))]


def _out(f: Farm) -> FarmOut:
    return FarmOut(id=f.id, owner_id=f.owner_id, name=f.name, lat=f.lat, lon=f.lon, timezone=f.timezone,
                   settings=get_farm_settings(f), example_label=f.example_label)


def _unprocessable(msg: str) -> HTTPException:
    return HTTPException(422, msg)


@router.get("/crops", response_model=list[CropOut])
def list_crops(_: Anyone, session: DB) -> list[Crop]:
    return list(session.scalars(select(Crop).order_by(Crop.key)))


@router.get("/farms", response_model=list[FarmOut])
def list_farms(p: Anyone, session: DB) -> list[FarmOut]:
    q = select(Farm).order_by(Farm.name)
    if p.farm_scope is not None:
        q = q.where(Farm.id == p.farm_scope)
    elif p.user.role != "admin":
        member_ids = select(FarmMember.farm_id).where(FarmMember.user_id == p.user.id)
        q = q.where(or_(Farm.owner_id == p.user.id, Farm.id.in_(member_ids)))
    return [_out(f) for f in session.scalars(q)]


@router.post("/farms", response_model=FarmOut, status_code=201)
def create_farm(body: FarmIn, p: Owner, session: DB) -> FarmOut:
    farm = Farm(owner_id=p.user.id, name=body.name, lat=body.lat, lon=body.lon, timezone=body.timezone,
                settings=body.settings.model_dump())
    session.add(farm)
    session.flush()
    session.add(FarmMember(farm_id=farm.id, user_id=p.user.id))
    session.commit()
    return _out(farm)


@router.get("/farms/{farm_id}", response_model=FarmOut)
def get_farm(farm_id: uuid.UUID, p: Anyone, session: DB) -> FarmOut:
    return _out(farm_for(session, p, farm_id))


@router.patch("/farms/{farm_id}", response_model=FarmOut)
def patch_farm(farm_id: uuid.UUID, body: FarmPatch, p: Owner, session: DB) -> FarmOut:
    farm = owned_farm(session, p, farm_id)
    for field in ("name", "lat", "lon", "timezone"):
        v = getattr(body, field)
        if v is not None:
            setattr(farm, field, v)
    if body.settings is not None:
        try:
            merged = FarmSettings(**{**get_farm_settings(farm).model_dump(), **body.settings})
        except ValidationError as e:
            raise HTTPException(422, e.errors(include_url=False)) from e
        farm.settings = merged.model_dump()
        farm.needs_replan = True
    session.commit()
    return _out(farm)


# --- water sources -------------------------------------------------------------------------------


@router.get("/farms/{farm_id}/sources", response_model=list[SourceOut])
def list_sources(farm_id: uuid.UUID, p: Anyone, session: DB) -> list[WaterSource]:
    farm_for(session, p, farm_id)
    q = select(WaterSource).where(WaterSource.farm_id == farm_id).order_by(WaterSource.position)
    return list(session.scalars(q))


@router.post("/farms/{farm_id}/sources", response_model=SourceOut, status_code=201)
def create_source(farm_id: uuid.UUID, body: SourceIn, p: Owner, session: DB) -> WaterSource:
    owned_farm(session, p, farm_id)
    ws = WaterSource(farm_id=farm_id, **body.model_dump())
    session.add(ws)
    session.commit()
    return ws


@router.patch("/farms/{farm_id}/sources/{source_id}", response_model=SourceOut)
def patch_source(farm_id: uuid.UUID, source_id: uuid.UUID, body: SourcePatch, p: Owner, session: DB) -> WaterSource:
    farm = owned_farm(session, p, farm_id)
    ws = session.get(WaterSource, source_id)
    if ws is None or ws.farm_id != farm_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(ws, k, v)
    farm.needs_replan = True
    session.commit()
    return ws


# --- blocks --------------------------------------------------------------------------------------


def _check_block_refs(session: Session, farm_id: uuid.UUID, crop_key: str | None,
                      habit_source_id: uuid.UUID | None) -> None:
    if crop_key is not None and session.get(Crop, crop_key) is None:
        raise _unprocessable(f"Unknown crop {crop_key!r}")
    if habit_source_id is not None:
        src = session.get(WaterSource, habit_source_id)
        if src is None or src.farm_id != farm_id:
            raise _unprocessable("habit_source_id must be a water source of this farm")


@router.get("/farms/{farm_id}/blocks", response_model=list[BlockOut])
def list_blocks(farm_id: uuid.UUID, p: Anyone, session: DB) -> list[Block]:
    farm_for(session, p, farm_id)
    return list(session.scalars(select(Block).where(Block.farm_id == farm_id).order_by(Block.position, Block.name)))


@router.post("/farms/{farm_id}/blocks", response_model=BlockOut, status_code=201)
def create_block(farm_id: uuid.UUID, body: BlockIn, p: Owner, session: DB) -> Block:
    farm = owned_farm(session, p, farm_id)
    _check_block_refs(session, farm_id, body.crop_key, body.habit_source_id)
    b = Block(farm_id=farm_id, **body.model_dump())
    session.add(b)
    farm.needs_replan = True
    session.commit()
    return b


@router.patch("/farms/{farm_id}/blocks/{block_id}", response_model=BlockOut)
def patch_block(farm_id: uuid.UUID, block_id: uuid.UUID, body: BlockPatch, p: Owner, session: DB) -> Block:
    farm = owned_farm(session, p, farm_id)
    b = session.get(Block, block_id)
    if b is None or b.farm_id != farm_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Block not found")
    _check_block_refs(session, farm_id, body.crop_key, body.habit_source_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    farm.needs_replan = True
    session.commit()
    return b


# --- tanks ---------------------------------------------------------------------------------------


@router.get("/farms/{farm_id}/tanks", response_model=list[TankOut])
def list_tanks(farm_id: uuid.UUID, p: Anyone, session: DB) -> list[Tank]:
    farm_for(session, p, farm_id)
    return list(session.scalars(select(Tank).where(Tank.farm_id == farm_id).order_by(Tank.name)))


@router.post("/farms/{farm_id}/tanks", response_model=TankOut, status_code=201)
def create_tank(farm_id: uuid.UUID, body: TankIn, p: Owner, session: DB) -> Tank:
    owned_farm(session, p, farm_id)
    if body.source_id is not None:
        src = session.get(WaterSource, body.source_id)
        if src is None or src.farm_id != farm_id:
            raise _unprocessable("source_id must be a water source of this farm")
    t = Tank(farm_id=farm_id, **body.model_dump())
    session.add(t)
    session.commit()
    return t
