"""Voice assistant endpoints for the farm tablet: spoken (or typed) question in, spoken answer out."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from milh.assistant import chat as chat_mod
from milh.assistant import llm, voice
from milh.assistant.tools import languages, t
from milh.auth import Principal, current_principal, farm_for
from milh.db import get_session, utcnow
from milh.kiosk import build_bundle
from milh.models import Farm

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])
log = logging.getLogger("milh.assistant.api")
DB = Annotated[Session, Depends(get_session)]
Member = Annotated[Principal, Depends(current_principal)]
MAX_AUDIO_BYTES = 5 * 1024 * 1024
LINE_KEYS = ("greeting", "ok", "wait", "not_heard")


class Turn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=2000)


class TextIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    lang: str = "en"
    history: list[Turn] = Field(default_factory=list, max_length=20)
    context: dict[str, Any] | None = None
    farm_id: uuid.UUID | None = None


class Reply(BaseModel):
    ok: bool = True
    transcript: str = ""
    reply: str = ""
    audio_url: str | None = None
    pending: dict[str, str] | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    provider: str | None = None
    resume: bool = False
    message: str | None = None


def _lang(lang: str) -> str:
    return lang if lang in languages() else "en"


def _farm(session: Session, p: Principal, farm_id: uuid.UUID | None) -> Farm:
    fid = farm_id or p.farm_scope
    if fid is None:
        raise HTTPException(422, "farm_id is required")
    return farm_for(session, p, fid)


def _audio_url(text: str, lang: str) -> str | None:
    if not text or not voice.available(lang):
        return None
    try:
        return f"/api/v1/assistant/audio/{voice.prepare(text, lang)}"
    except voice.VoiceError as e:
        log.warning("%s", e)
        return None


def _keyterms(session: Session, farm: Farm, lang: str) -> list[str]:
    b = build_bundle(session, farm, utcnow())
    terms: list[str] = []
    for blk in b.blocks:
        terms += [blk.name, *[v for v in blk.crop_names.values() if v]]
    for s in b.sources:
        terms += [v for v in s.tap_label.values() if v]
    clean = [x for x in dict.fromkeys(terms) if 0 < len(x) <= 50 and len(x.split()) <= 5]
    return clean[:100]


def _answer(session: Session, farm: Farm, p: Principal, lang: str, question: str, history: list[dict[str, str]],
            context: dict[str, Any] | None) -> Reply:
    res = chat_mod.turn(session, farm, p.user, lang, history, context, question, utcnow(),
                        complete=llm.complete)
    return Reply(transcript=question, reply=res.reply, audio_url=_audio_url(res.reply, lang), pending=res.pending,
                 context=res.context, provider=res.provider)


@router.get("/status")
def status(p: Member, session: DB, lang: str = "en", farm_id: uuid.UUID | None = None) -> dict[str, Any]:
    _farm(session, p, farm_id)
    lang = _lang(lang)
    thinking, speaking = llm.available(), voice.available(lang)
    reason = None
    if not thinking:
        reason = "no language model key"
    elif not speaking:
        reason = "no voice for this language"
    return {"available": thinking and speaking, "reason": reason, "lang": lang}


@router.get("/lines")
def lines(p: Member, session: DB, lang: str = "en", farm_id: uuid.UUID | None = None) -> dict[str, Any]:
    """Greeting and filler lines, prepared now so they play the moment they are needed."""
    _farm(session, p, farm_id)
    lang = _lang(lang)
    out = {}
    for key in LINE_KEYS:
        text = t(key, lang)
        out[key] = {"text": text, "audio_url": _audio_url(text, lang)}
    return {"lang": lang, "lines": out}


@router.post("/text", response_model=Reply)
def ask_text(body: TextIn, p: Member, session: DB) -> Reply:
    farm = _farm(session, p, body.farm_id)
    lang = _lang(body.lang)
    if not llm.available():
        return Reply(ok=False, reply=t("unavailable", lang), message="assistant not available")
    return _answer(session, farm, p, lang, body.question, [m.model_dump() for m in body.history], body.context)


@router.post("/ask", response_model=Reply)
async def ask_audio(
    p: Member,
    session: DB,
    audio: Annotated[UploadFile, File()],
    lang: Annotated[str, Form()] = "en",
    history: Annotated[str, Form()] = "[]",
    context: Annotated[str, Form()] = "{}",
    interrupted: Annotated[str, Form()] = "",
    farm_id: Annotated[uuid.UUID | None, Form()] = None,
) -> Reply:
    farm = _farm(session, p, farm_id)
    lang = _lang(lang)
    if not (voice.available(lang) and llm.available()):
        return Reply(ok=False, reply=t("unavailable", lang), message="assistant not available")
    try:
        past = [Turn(**m).model_dump() for m in json.loads(history or "[]")][-20:]
        ctx = json.loads(context or "{}")
        if not isinstance(ctx, dict):
            raise ValueError("context must be an object")
    except (ValueError, TypeError) as e:
        raise HTTPException(422, f"bad history or context: {e}") from e
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "recording too long")
    try:
        question = await run_in_threadpool(voice.transcribe, data, audio.filename or "q.webm",
                                           audio.content_type or "audio/webm", lang,
                                           _keyterms(session, farm, lang))
    except voice.VoiceError as e:
        log.warning("%s", e)
        return Reply(ok=False, reply=t("unavailable", lang), message="speech-to-text failed")
    if interrupted and voice.is_echo(question, interrupted):
        return Reply(resume=True, transcript=question, context=ctx)
    if not question:
        said = t("not_heard", lang)
        return Reply(reply=said, audio_url=_audio_url(said, lang), context=ctx)
    return await run_in_threadpool(_answer, session, farm, p, lang, question, past, ctx)


@router.get("/audio/{aid}")
def audio(aid: str) -> Any:
    """Cached answers come from disk; a new one streams from ElevenLabs as it is made. Ids are content
    hashes checked against a strict pattern, so nothing else can be served."""
    path = voice.audio_path(aid)
    if path:
        return FileResponse(path, media_type="audio/mpeg")
    if not voice.AUDIO_ID.match(aid):
        raise HTTPException(404, "no such audio")
    try:
        return StreamingResponse(voice.open_stream(aid), media_type="audio/mpeg")
    except voice.VoiceError as e:
        log.warning("%s", e)
        raise HTTPException(404 if "unknown" in str(e) else 502, "voice not available") from e
