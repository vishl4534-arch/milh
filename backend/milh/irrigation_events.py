"""Recording that a block's watering was done: one path for the DONE button and the voice assistant."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from milh.models import Announcement, IrrigationEvent

ACKNOWLEDGED_TYPES = ["irrigation_start", "irrigation_switch_source", "irrigation_stop"]


def record_done(
    session: Session,
    *,
    event_id: uuid.UUID,
    plan_id: uuid.UUID | None,
    block_id: uuid.UUID,
    source_id: uuid.UUID | None,
    started_at: datetime,
    minutes: int,
    method: str,
    user_id: uuid.UUID | None,
) -> IrrigationEvent:
    """Store the event and mark that run's tap instructions as acknowledged. The caller checks scope."""
    ev = IrrigationEvent(id=event_id, plan_id=plan_id, block_id=block_id, source_id=source_id, started_at=started_at,
                         minutes=minutes, method=method, confirmed_by_user_id=user_id)
    session.add(ev)
    if plan_id is not None:
        session.execute(
            update(Announcement)
            .where(Announcement.plan_id == plan_id, Announcement.type.in_(ACKNOWLEDGED_TYPES),
                   Announcement.status.in_(["scheduled", "played"]))
            .values(status="acknowledged")
        )
    session.flush()
    return ev
