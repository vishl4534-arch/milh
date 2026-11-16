"""One conversation turn for the tablet's voice assistant.

The model reads the worker's words and picks a tool; the answer is the tool's template, filled by code.
The model's own words are only used for small talk, and only if they contain no digit. A "done" is a
proposal until the worker says yes (or taps the tick); then it is recorded like the DONE button.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.assistant import llm
from milh.assistant.tools import ToolResult, run_tool, schemas, t
from milh.irrigation_events import record_done
from milh.kiosk import KioskBundle, build_bundle
from milh.models import Farm, IrrigationEvent, IrrigationPlan, User

log = logging.getLogger("milh.assistant.chat")
LANG_NAMES = {"en": "English", "ur": "Urdu", "ar": "Arabic", "hi": "Hindi"}

YES = {"yes", "yeah", "yep", "ok", "okay", "sure", "correct", "right", "haan", "han", "ha", "ji", "jee", "haanji",
       "hanji", "theek", "thik", "ہاں", "جی", "ٹھیک", "हाँ", "हां", "जी", "✔"}
NO = {"no", "nope", "nah", "cancel", "nahi", "nahin", "na", "mat", "نہیں", "نا", "मत", "नहीं", "✖"}
# Words that may sit next to a yes or no without changing it ("yes please", "haan ji", "no thanks").
FILLER = {"please", "thanks", "thank", "you", "ji", "jee", "hai", "sir", "boss", "bhai", "جی", "ہے", "شکریہ"}
# Number and time words: the model's own small talk may contain none of these (numbers come from code only).
NUMBER_WORDS = {
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
    "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "half", "quarter", "dozen",
    "minute", "minutes", "hour", "hours", "litre", "litres", "liter", "liters", "percent",
    "ek", "teen", "char", "chaar", "paanch", "panch", "chhe", "saat", "aath", "nau", "das", "bees", "tees", "sau",
    "minat", "ghanta", "ghante",
    "ایک", "دو", "تین", "چار", "پانچ", "چھ", "سات", "آٹھ", "نو", "دس", "بیس", "سو", "منٹ", "گھنٹہ", "گھنٹے", "لیٹر",
    "एक", "दो", "तीन", "चार", "पांच", "छह", "सात", "आठ", "नौ", "दस", "मिनट", "घंटे", "लीटर",
}

Complete = Callable[[list[dict[str, Any]], list[dict[str, Any]]], tuple[dict[str, Any], str]]


@dataclass
class TurnResult:
    reply: str
    pending: dict[str, str] | None = None
    provider: str | None = None
    context: dict[str, Any] = field(default_factory=dict)


def yes_no(text: str) -> str | None:
    """A short yes or no ("haan", "nahi", "yes please"), or None. Long sentences go to the model."""
    words = re.findall(r"[\w✔✖]+", (text or "").lower())
    if not words or len(words) > 4:
        return None
    answers = [w for w in words if w not in FILLER or w in YES]
    if not answers or any(w not in YES and w not in NO for w in answers):
        return None  # anything else ("ok block 2", "say yes") is a real sentence: the model reads it
    has_yes, has_no = any(w in YES for w in answers), any(w in NO for w in answers)
    if has_yes == has_no:
        return None
    return "yes" if has_yes else "no"


def guard(text: str | None) -> str | None:
    """The model's own words, only if short and free of numbers (numbers come from code alone)."""
    text = (text or "").strip()
    if not text or len(text) > 250 or re.search(r"\d", text):
        return None
    if any(w in NUMBER_WORDS for w in re.findall(r"\w+", text.lower())):
        return None
    return text


def _system_prompt(bundle: KioskBundle, lang: str, pending: dict[str, str] | None) -> str:
    blocks = "\n".join(f"- {b.name}: {', '.join(v for v in b.crop_names.values() if v)}" for b in bundle.blocks)
    waiting = (f"\nThe assistant has just asked the worker to confirm: mark {pending.get('block_name')} as done. "
               "If the worker answers yes or no, call confirm." if pending else "")
    return f"""You are the voice assistant on the farm tablet of {bundle.farm.name}. You help the farm worker,
who may not read, with today's work. The worker speaks {LANG_NAMES.get(lang, lang)}; they may mix Urdu, Hindi
and English.
Blocks on this farm (name: crop):
{blocks}
RULES
1. For anything about watering, minutes, taps, why, the tank, water salt, soil, soil tests, weather, rain,
   sunrise, sunset, the midday break, or what happens next: call a tool. Never answer these yourself.
2. Pass the block in the worker's own words ("block 3", "teen", "tomato"); the app matches it. If they name no
   block, leave it out.
3. "Block 3 is done", "Block 3 ho gaya", "finished block 3" -> mark_done. Never claim something is saved.
4. Greetings and small talk: reply without a tool in {LANG_NAMES.get(lang, lang)}, at most two short sentences,
   no numbers, then invite them to ask about today's watering.
5. Never write a number, a time or a date yourself.{waiting}"""


def _execute(session: Session, farm: Farm, user: User, pending: dict[str, str] | None, answer: str,
             lang: str, now: datetime) -> TurnResult:
    if not pending or pending.get("action") != "mark_done" or pending.get("farm_id") != str(farm.id):
        return TurnResult(t("nothing_pending", lang))
    if answer != "yes":
        return TurnResult(t("done_cancelled", lang))
    try:
        plan = session.get(IrrigationPlan, uuid.UUID(pending["plan_id"]))
        block_id = uuid.UUID(pending["block_id"])
    except (KeyError, ValueError):
        return TurnResult(t("nothing_pending", lang))
    name = pending.get("block_name", "")
    if plan is None or plan.farm_id != farm.id or plan.block_id != block_id:
        return TurnResult(t("nothing_pending", lang))
    if session.scalars(select(IrrigationEvent.id).where(IrrigationEvent.plan_id == plan.id)).first():
        return TurnResult(t("done_already", lang, block=name))
    first_source = plan.steps[0]["source_id"] if plan.steps else None
    record_done(session, event_id=uuid.uuid4(), plan_id=plan.id, block_id=plan.block_id,
                source_id=uuid.UUID(first_source) if first_source else None, started_at=plan.start_at or now,
                minutes=plan.minutes, method="voice", user_id=user.id)
    session.commit()
    return TurnResult(t("done_saved", lang, block=name))


def turn(session: Session, farm: Farm, user: User, lang: str, history: list[dict[str, str]],
         context: dict[str, Any] | None, question: str, now: datetime,
         complete: Complete = llm.complete) -> TurnResult:
    pending = (context or {}).get("pending")
    pending = pending if isinstance(pending, dict) else None

    quick = yes_no(question) if pending else None
    if quick:
        return _execute(session, farm, user, pending, quick, lang, now)

    bundle = build_bundle(session, farm, now)
    tools = schemas()
    messages: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt(bundle, lang, pending)}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history[-8:]
                 if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str)]
    messages.append({"role": "user", "content": question})

    results: list[ToolResult] = []
    final_text = ""
    provider: str | None = None
    try:
        for _ in range(1):  # one round: the answer is the tools' templates
            message, provider = complete(messages, tools)
            calls = message.get("tool_calls") or []
            if not calls:
                final_text = message.get("content") or ""
                break
            messages.append({"role": "assistant", "content": message.get("content"), "tool_calls": calls})
            for call in calls:
                try:
                    args = json.loads(call["function"].get("arguments") or "{}")
                except ValueError:
                    args = {}
                res = run_tool(bundle, call["function"]["name"], args if isinstance(args, dict) else {}, lang)
                results.append(res)
                messages.append({"role": "tool", "tool_call_id": call.get("id", "call_0"),
                                 "content": json.dumps({"ok": True, "note": "The app answers the worker itself."})})
            break  # the answer is the tools' templates: no second model call needed
    except llm.LLMUnavailable as e:
        log.error("no language model available: %s", e)
        return TurnResult(t("unavailable", lang), context={"pending": pending} if pending else {})
    except Exception:  # a bug or a database hiccup must still give the worker a spoken answer
        log.exception("assistant turn failed")
        return TurnResult(t("unavailable", lang), context={"pending": pending} if pending else {})

    confirm = next((r for r in results if r.kind == "confirm_answer"), None)
    if confirm is not None:
        out = _execute(session, farm, user, pending, confirm.answer or "no", lang, now)
        out.provider = provider
        return out
    if results:
        new_pending = next((r.pending for r in results if r.pending), None)
        reply = " ".join(r.text for r in results if r.text)
        return TurnResult(reply, new_pending, provider, {"pending": new_pending} if new_pending else {})
    reply = guard(final_text) or t("not_understood", lang)
    return TurnResult(reply, pending, provider, {"pending": pending} if pending else {})
