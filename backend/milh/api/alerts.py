from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.auth import Principal, current_principal, farm_for, owned_farm, require_role
from milh.db import get_session, utcnow
from milh.models import Alert

router = APIRouter(prefix="/api/v1", tags=["alerts"])
DB = Annotated[Session, Depends(get_session)]


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    severity: str
    type: str
    subject: str | None
    slots: dict[str, Any]
    message: dict[str, str]
    created_at: datetime
    resolved_at: datetime | None


@router.get("/farms/{farm_id}/alerts", response_model=list[AlertOut])
def list_alerts(farm_id: uuid.UUID, p: Annotated[Principal, Depends(current_principal)], session: DB,
                include_resolved: bool = False) -> list[Alert]:
    farm_for(session, p, farm_id)
    q = select(Alert).where(Alert.farm_id == farm_id)
    if not include_resolved:
        q = q.where(Alert.resolved_at.is_(None))
    return list(session.scalars(q.order_by(Alert.created_at.desc()).limit(200)))


@router.post("/alerts/{alert_id}/resolve", response_model=AlertOut)
def resolve(alert_id: uuid.UUID, p: Annotated[Principal, Depends(require_role("owner", "admin"))],
            session: DB) -> Alert:
    a = session.get(Alert, alert_id)
    if a is None:
        raise HTTPException(404, "Alert not found")
    owned_farm(session, p, a.farm_id)
    a.resolved_at = a.resolved_at or utcnow()
    session.commit()
    return a
