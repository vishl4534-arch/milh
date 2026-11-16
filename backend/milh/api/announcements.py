from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from milh.auth import Principal, current_principal, farm_for, owned_farm, require_role
from milh.db import get_session, utcnow
from milh.farm_config import get_farm_settings
from milh.models import Announcement, Block, IrrigationEvent, IrrigationPlan

router = APIRouter(prefix="/api/v1", tags=["announcements"])
DB = Annotated[Session, Depends(get_session)]
Member = Annotated[Principal, Depends(current_principal)]


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    type: str
    scheduled_at: datetime
    text: dict[str, str]
    audio: dict[str, str]
    status: str
    plan_id: uuid.UUID | None
    custom: bool
    untranslated: list[str]


class CustomIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    lang: Literal["en", "ur", "ar", "hi"] = "en"
    scheduled_at: AwareDatetime | None = None


class EventIn(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID | None = None
    block_id: uuid.UUID
    source_id: uuid.UUID | None = None
    started_at: AwareDatetime
    minutes: int = Field(ge=0, le=1440)
    method: Literal["tap", "voice", "sensor"] = "tap"


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    plan_id: uuid.UUID | None
    block_id: uuid.UUID
    source_id: uuid.UUID | None
    started_at: datetime
    minutes: int
    method: str


def translate_custom(text: str, src: str, langs: Sequence[str]) -> tuple[dict[str, str], list[str]]:
    """Owner-written text in other farm languages. Gemini fills this in (Task 16); without it the
    original text is used and the language is marked untranslated."""
    from milh.ai.gemini import get_gemini

    out, untranslated = {src: text}, []
    gem = get_gemini()
    for lang in langs:
        if lang == src:
            continue
        t = gem.translate(text, lang) if gem else None
        if t is None:
            out[lang] = text
            untranslated.append(lang)
        else:
            out[lang] = t
    return out, untranslated


@router.get("/farms/{farm_id}/announcements", response_model=list[AnnouncementOut])
def list_announcements(farm_id: uuid.UUID, p: Member, session: DB, day: date | None = None) -> list[Announcement]:
    farm = farm_for(session, p, farm_id)
    tz = ZoneInfo(farm.timezone)
    day = day or utcnow().astimezone(tz).date()
    lo = datetime.combine(day, time(0, 0), tzinfo=tz)
    q = (select(Announcement).where(Announcement.farm_id == farm_id, Announcement.scheduled_at >= lo,
                                    Announcement.scheduled_at < lo + timedelta(days=1),
                                    Announcement.status != "cancelled")
         .order_by(Announcement.scheduled_at))
    return list(session.scalars(q))


@router.post("/farms/{farm_id}/announcements", response_model=AnnouncementOut, status_code=201)
def create_custom(farm_id: uuid.UUID, body: CustomIn,
                  p: Annotated[Principal, Depends(require_role("owner", "admin"))], session: DB) -> Announcement:
    farm = owned_farm(session, p, farm_id)
    text, untranslated = translate_custom(body.text, body.lang, get_farm_settings(farm).languages)
    a = Announcement(farm_id=farm_id, type="custom", scheduled_at=body.scheduled_at or utcnow(),
                     template_key=None, slots={"text": body.text, "lang": body.lang}, text=text, audio={},
                     status="scheduled", custom=True, untranslated=untranslated)
    session.add(a)
    session.commit()
    return a


@router.post("/announcements/{ann_id}/played", response_model=AnnouncementOut)
def mark_played(ann_id: uuid.UUID, p: Member, session: DB) -> Announcement:
    a = session.get(Announcement, ann_id)
    if a is None:
        raise HTTPException(404, "Announcement not found")
    farm_for(session, p, a.farm_id)
    if a.status == "scheduled":
        a.status = "played"
    session.commit()
    return a


@router.post("/irrigation-events", response_model=EventOut, status_code=201)
def post_event(body: EventIn, p: Member, session: DB) -> IrrigationEvent:
    existing = session.get(IrrigationEvent, body.id)
    if existing is not None:
        return existing
    block = session.get(Block, body.block_id)
    if block is None:
        raise HTTPException(404, "Block not found")
    farm_for(session, p, block.farm_id)
    if body.plan_id is not None:
        plan = session.get(IrrigationPlan, body.plan_id)
        if plan is None or plan.block_id != block.id:
            raise HTTPException(422, "plan_id does not belong to this block")
    ev = IrrigationEvent(id=body.id, plan_id=body.plan_id, block_id=block.id, source_id=body.source_id,
                         started_at=body.started_at, minutes=body.minutes, method=body.method,
                         confirmed_by_user_id=p.user.id)
    session.add(ev)
    if body.plan_id is not None:
        session.execute(
            update(Announcement)
            .where(Announcement.plan_id == body.plan_id,
                   Announcement.type.in_(["irrigation_start", "irrigation_switch_source", "irrigation_stop"]),
                   Announcement.status.in_(["scheduled", "played"]))
            .values(status="acknowledged")
        )
    session.commit()
    return ev
