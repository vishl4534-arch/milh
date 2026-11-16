from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.auth import (
    Principal,
    current_principal,
    device_from_key,
    hash_secret,
    issue_token,
    new_api_key,
    owned_farm,
    require_role,
    verify_secret,
)
from milh.db import get_session, utcnow
from milh.models import Device, FarmMember, User

router = APIRouter(prefix="/api/v1", tags=["auth"])

OWNER_TTL = timedelta(hours=12)
KIOSK_TTL = timedelta(hours=18)
PIN_MAX_FAILURES = 5
PIN_LOCKOUT = timedelta(minutes=5)
_pin_failures: dict[uuid.UUID, tuple[int, datetime | None]] = {}  # per device: (failures, locked until)


def _pin_locked(device_id: uuid.UUID) -> bool:
    _n, until = _pin_failures.get(device_id, (0, None))
    return until is not None and utcnow() < until


def _pin_failed(device_id: uuid.UUID) -> None:
    n, _until = _pin_failures.get(device_id, (0, None))
    n += 1
    _pin_failures[device_id] = (0, utcnow() + PIN_LOCKOUT) if n >= PIN_MAX_FAILURES else (n, None)


class LoginIn(BaseModel):
    email: str
    password: str


class KioskLoginIn(BaseModel):
    device_key: str
    pin: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeOut(BaseModel):
    id: uuid.UUID
    name: str
    role: str
    language: str
    farm_id: uuid.UUID | None


class DeviceIn(BaseModel):
    name: str
    kind: Literal["kiosk", "sensor", "gateway"]


class DeviceCreated(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    api_key: str


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, session: Annotated[Session, Depends(get_session)]) -> TokenOut:
    user = session.scalars(select(User).where(User.email == body.email.strip().lower())).first()
    if user is None or not verify_secret(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return TokenOut(access_token=issue_token(user, None, OWNER_TTL))


@router.post("/auth/kiosk", response_model=TokenOut)
def kiosk_login(body: KioskLoginIn, session: Annotated[Session, Depends(get_session)]) -> TokenOut:
    dev = device_from_key(session, body.device_key)
    if dev is None or dev.kind != "kiosk":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown kiosk")
    if _pin_locked(dev.id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many wrong PINs. Wait 5 minutes.")
    workers = session.scalars(
        select(User).join(FarmMember, FarmMember.user_id == User.id)
        .where(FarmMember.farm_id == dev.farm_id, User.role == "worker")
    )
    for w in workers:
        if verify_secret(body.pin, w.pin_hash):
            session.commit()
            _pin_failures.pop(dev.id, None)
            return TokenOut(access_token=issue_token(w, dev.farm_id, KIOSK_TTL))
    session.commit()
    _pin_failed(dev.id)
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong PIN")


@router.get("/me", response_model=MeOut)
def me(p: Annotated[Principal, Depends(current_principal)]) -> MeOut:
    return MeOut(id=p.user.id, name=p.user.name, role=p.user.role, language=p.user.language,
                 farm_id=p.farm_scope)


@router.post("/farms/{farm_id}/devices", response_model=DeviceCreated, status_code=201)
def create_device(
    farm_id: uuid.UUID,
    body: DeviceIn,
    p: Annotated[Principal, Depends(require_role("owner", "admin"))],
    session: Annotated[Session, Depends(get_session)],
) -> DeviceCreated:
    owned_farm(session, p, farm_id)
    key, prefix = new_api_key()
    dev = Device(farm_id=farm_id, name=body.name, kind=body.kind, api_key_hash=hash_secret(key),
                 key_prefix=prefix)
    session.add(dev)
    session.commit()
    return DeviceCreated(id=dev.id, name=dev.name, kind=dev.kind, api_key=key)
