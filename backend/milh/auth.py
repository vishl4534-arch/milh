"""Password/PIN/API-key hashing, JWTs, and FastAPI dependencies for roles and farm scoping."""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.config import get_settings
from milh.db import get_session, utcnow
from milh.models import Device, Farm, FarmMember, User

_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)
ALGO = "HS256"


def hash_secret(s: str) -> str:
    return _hasher.hash(s)


def verify_secret(s: str, h: str | None) -> bool:
    if not h:
        return False
    try:
        return _hasher.verify(h, s)
    except (VerifyMismatchError, InvalidHashError):
        return False


def issue_token(user: User, farm_id: uuid.UUID | None, ttl: timedelta) -> str:
    now = utcnow()
    claims = {
        "sub": str(user.id),
        "role": user.role,
        "farm_id": str(farm_id) if farm_id else None,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(claims, get_settings().jwt_secret, algorithm=ALGO)


def new_api_key() -> tuple[str, str]:
    """Return (full key shown once, lookup prefix). Format: '<prefix>.<secret>'."""
    prefix = secrets.token_hex(4)
    return f"{prefix}.{secrets.token_urlsafe(24)}", prefix


@dataclass
class Principal:
    user: User
    farm_scope: uuid.UUID | None  # set for kiosk/worker tokens: only this farm


def _unauthorized() -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated",
                         headers={"WWW-Authenticate": "Bearer"})


def current_principal(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> Principal:
    if creds is None:
        raise _unauthorized()
    try:
        claims = jwt.decode(creds.credentials, get_settings().jwt_secret, algorithms=[ALGO])
        user = session.get(User, uuid.UUID(claims["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError) as e:
        raise _unauthorized() from e
    if user is None:
        raise _unauthorized()
    scope = claims.get("farm_id")
    return Principal(user, uuid.UUID(scope) if scope and user.role == "worker" else None)


def current_user(p: Annotated[Principal, Depends(current_principal)]) -> User:
    return p.user


def require_role(*roles: str) -> Callable[[Principal], Principal]:
    def dep(p: Annotated[Principal, Depends(current_principal)]) -> Principal:
        if p.user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for this role")
        return p

    return dep


def farm_for(session: Session, p: Principal, farm_id: uuid.UUID) -> Farm:
    """Load a farm the principal may see; 404 otherwise (do not reveal other farms exist)."""
    farm = session.get(Farm, farm_id)
    if farm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Farm not found")
    if p.user.role == "admin":
        return farm
    if p.farm_scope is not None and p.farm_scope != farm_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Farm not found")
    if farm.owner_id == p.user.id:
        return farm
    member = session.get(FarmMember, (farm_id, p.user.id))
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Farm not found")
    return farm


def owned_farm(session: Session, p: Principal, farm_id: uuid.UUID) -> Farm:
    """Like farm_for, but only the owner (or an admin) may change it."""
    farm = farm_for(session, p, farm_id)
    if p.user.role != "admin" and farm.owner_id != p.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the farm owner can do this")
    return farm


def device_from_key(session: Session, key: str) -> Device | None:
    prefix, _, _ = key.partition(".")
    for dev in session.scalars(select(Device).where(Device.key_prefix == prefix)):
        if verify_secret(key, dev.api_key_hash):
            dev.last_seen_at = utcnow()
            return dev
    return None


def optional_device(
    session: Annotated[Session, Depends(get_session)],
    x_api_key: Annotated[str | None, Header()] = None,
) -> Device | None:
    if x_api_key is None:
        return None
    dev = device_from_key(session, x_api_key)
    if dev is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown API key")
    return dev


def optional_principal(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> Principal | None:
    if creds is None:
        return None
    return current_principal(creds, session)
