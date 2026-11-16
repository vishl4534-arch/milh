from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from milh.auth import Principal, current_principal, farm_for
from milh.db import get_session, utcnow
from milh.kiosk import KioskBundle, build_bundle

router = APIRouter(prefix="/api/v1", tags=["kiosk"])


@router.get("/kiosk/bundle", response_model=KioskBundle)
def get_bundle(
    p: Annotated[Principal, Depends(current_principal)],
    session: Annotated[Session, Depends(get_session)],
    farm_id: uuid.UUID | None = None,
) -> KioskBundle:
    fid = farm_id or p.farm_scope
    if fid is None:
        raise HTTPException(422, "farm_id is required")
    farm = farm_for(session, p, fid)
    return build_bundle(session, farm, utcnow())
