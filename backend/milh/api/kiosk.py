from __future__ import annotations

import logging
import threading
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from milh.announcements.templates import localized, render
from milh.announcements.tts import audio_for, generate_missing_audio, get_tts
from milh.auth import Principal, current_principal, farm_for
from milh.config import get_settings
from milh.db import get_session, session_factory, utcnow
from milh.kiosk import KioskBundle, build_bundle
from milh.models import Announcement, Block, Crop, IrrigationPlan, WaterSource

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["kiosk"])


@router.get("/kiosk/bundle", response_model=KioskBundle)
def get_bundle(
    p: Annotated[Principal, Depends(current_principal)],
    session: Annotated[Session, Depends(get_session)],
    background: BackgroundTasks,
    farm_id: uuid.UUID | None = None,
) -> KioskBundle:
    fid = farm_id or p.farm_scope
    if fid is None:
        raise HTTPException(422, "farm_id is required")
    farm = farm_for(session, p, fid)
    bundle = build_bundle(session, farm, utcnow())
    if get_tts() is not None and any(set(a.text) - set(a.audio) for a in bundle.announcements):
        background.add_task(_fill_audio, farm.id)
    return bundle


_filling = threading.Lock()


def _fill_audio(farm_id: uuid.UUID) -> None:
    """Make the announcer's clips for this farm's coming announcements, so they play (and cache for
    offline) without waiting for the worker. One fill at a time; a tablet that polls meanwhile skips it."""
    if not _filling.acquire(blocking=False):
        return
    try:
        with session_factory()() as session:
            n = generate_missing_audio(session, get_tts(), Path(get_settings().media_dir), utcnow(), farm_id=farm_id)
            session.commit()
            if n:
                log.info("announcer clips made for %s announcement(s)", n)
    except Exception as e:  # never break the tablet over a voice failure
        log.warning("announcer clips failed: %s", e)
    finally:
        _filling.release()


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
    return RunSpeech(text=text, audio_url=_announcer_audio(text, lang))


@router.get("/kiosk/announcements/{announcement_id}/speech", response_model=RunSpeech)
def announcement_speech(
    announcement_id: uuid.UUID,
    p: Annotated[Principal, Depends(current_principal)],
    session: Annotated[Session, Depends(get_session)],
    lang: str = "en",
) -> RunSpeech:
    """An announcement in the announcer's voice, made now if its clip is missing or in an older voice."""
    a = session.get(Announcement, announcement_id)
    if a is None:
        raise HTTPException(404, "no such announcement")
    farm_for(session, p, a.farm_id)
    text = localized(a.text, lang) or localized(a.text, "en")
    url = _announcer_audio(text, lang)
    if url and lang in (a.text or {}):
        a.audio = {**(a.audio or {}), lang: url.removeprefix("/media/")}
        session.commit()
    return RunSpeech(text=text, audio_url=url)


def _announcer_audio(text: str, lang: str) -> str | None:
    """The instruction in the announcer's voice, cached as a file like every announcement (so it also
    plays offline next time). None if there is no voice; the tablet then reads it with its own."""
    tts = get_tts()
    if tts is None or not text:
        return None
    try:
        return f"/media/{audio_for(text, lang, tts, Path(get_settings().media_dir))}"
    except Exception as e:  # any voice failure: the tablet falls back to its own voice
        log.warning("announcer voice failed: %s", e)
        return None
