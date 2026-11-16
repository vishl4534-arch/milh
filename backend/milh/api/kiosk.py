from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from milh.announcements.templates import localized, render
from milh.assistant import voice
from milh.auth import Principal, current_principal, farm_for
from milh.db import get_session, utcnow
from milh.kiosk import KioskBundle, build_bundle
from milh.models import Block, Crop, IrrigationPlan, WaterSource

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


def _instruction(session: Session, plan: IrrigationPlan, lang: str) -> str:
    block = session.get(Block, plan.block_id)
    if block is None:
        return ""
    crop = session.get(Crop, block.crop_key)
    crop_name = localized(crop.names, lang) if crop else block.crop_key
    if plan.skip_reason or not plan.steps:
        return render("briefing_block_skipped", lang, {"block": block.name, "crop": crop_name})
    parts: list[str] = []
    prev = ""
    for i, st in enumerate(plan.steps):
        src = session.get(WaterSource, uuid.UUID(str(st["source_id"])))
        tap = (localized(src.tap_label, lang) or src.name) if src else ""
        if i == 0:
            parts.append(render("irrigation_start", lang, {"block": block.name, "crop": crop_name, "tap": tap,
                                                           "minutes": st["minutes"]}))
        else:
            parts.append(render("irrigation_switch_source", lang, {"block": block.name, "prev_tap": prev,
                                                                   "tap": tap, "minutes": st["minutes"]}))
        prev = tap
    return " ".join(parts)


class RunSpeech(BaseModel):
    text: str
    audio_url: str | None = None


@router.get("/kiosk/runs/{plan_id}/speech", response_model=RunSpeech)
def run_speech(
    plan_id: uuid.UUID,
    p: Annotated[Principal, Depends(current_principal)],
    session: Annotated[Session, Depends(get_session)],
    lang: str = "en",
) -> RunSpeech:
    """A block's instruction read aloud on demand (the tablet's speaker button), for when no scheduled
    announcement exists, e.g. the plan was made after the run's start time. The worker hears what to do
    (which taps, how long), built from the same announcement templates, not the agronomy explanation.
    Only template text filled from the plan is spoken, so nothing else can be sent to the voice service."""
    plan = session.get(IrrigationPlan, plan_id)
    if plan is None:
        raise HTTPException(404, "no such plan")
    farm_for(session, p, plan.farm_id)
    text = _instruction(session, plan, lang) or localized(plan.text, lang) or localized(plan.text, "en")
    audio_url = None
    if voice.available(lang) and text:
        try:
            audio_url = f"/api/v1/assistant/audio/{voice.prepare(text, lang)}"
        except voice.VoiceError:
            audio_url = None
    return RunSpeech(text=text, audio_url=audio_url)
