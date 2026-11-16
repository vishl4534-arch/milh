"""What the voice assistant can look up or do. Every answer is a template filled by code from the same
data the tablet shows (the kiosk bundle); the language model only chooses the tool."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from functools import cache
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo

from milh.kiosk import KBlock, KioskBundle, KRun

TEMPLATE_DIR = Path(__file__).parent / "templates"
Kind = Literal["answer", "ask_block", "confirm", "confirm_answer"]


@dataclass
class ToolResult:
    text: str
    kind: Kind = "answer"
    pending: dict[str, str] | None = None
    answer: str | None = None  # for confirm: "yes" / "no"


@cache
def _table(lang: str) -> dict[str, str]:
    path = TEMPLATE_DIR / f"{lang}.json"
    if not path.exists():
        path = TEMPLATE_DIR / "en.json"
    data: dict[str, str] = json.loads(path.read_text(encoding="utf-8"))
    return data


def t(key: str, lang: str, **slots: Any) -> str:
    return _table(lang)[key].format(**slots)


def languages() -> list[str]:
    return sorted(p.stem for p in TEMPLATE_DIR.glob("*.json"))


def schemas() -> list[dict[str, Any]]:
    block = {"type": "string", "description": "The block the worker means, in their words (e.g. 'block 3', "
                                              "'tomato'). Leave out if they did not say one."}

    def fn(name: str, desc: str, props: dict[str, Any] | None = None,
           required: list[str] | None = None) -> dict[str, Any]:
        return {"type": "function", "function": {"name": name, "description": desc, "parameters": {
            "type": "object", "properties": props or {}, "required": required or []}}}

    return [
        fn("today_plan", "How long and from which tap to water a block today (or every block).", {"block": block}),
        fn("why_plan", "Why today's watering for a block is what it is.", {"block": block}),
        fn("water_status", "Tank level and how salty each water source is."),
        fn("soil_status", "Soil salt status and the next soil test date.", {"block": block}),
        fn("weather_now", "Weather now, rain, sunrise and sunset, the midday work break.",
           {"detail": {"type": "string", "enum": ["temp", "rain", "sun", "midday", "all"]}}, ["detail"]),
        fn("next_announcement", "What happens next on the farm today."),
        fn("mark_done", "The worker says a block's watering is finished. Only proposes; the worker must confirm.",
           {"block": block}, ["block"]),
        fn("confirm", "The worker answers yes or no to a question the assistant just asked.",
           {"answer": {"type": "string", "enum": ["yes", "no"]}}, ["answer"]),
        fn("help", "What the assistant can do."),
    ]


# ---- block names as people say them ------------------------------------------------------------------
NUMBER_WORDS: dict[str, list[str]] = {
    "1": ["one", "first", "ek", "ایک", "पहला", "एक"], "2": ["two", "second", "دو", "दो"],
    "3": ["three", "third", "teen", "تین", "तीन"], "4": ["four", "fourth", "char", "chaar", "چار", "चार"],
    "5": ["five", "fifth", "paanch", "panch", "پانچ", "पांच"], "6": ["six", "chhe", "چھ", "छह"],
    "7": ["seven", "saat", "سات", "सात"], "8": ["eight", "aath", "آٹھ", "आठ"], "9": ["nine", "nau", "نو", "नौ"],
}


def _has(text: str, word: str) -> bool:
    if word.isascii():
        return re.search(rf"(?<![\w]){re.escape(word)}(?![\w])", text) is not None
    return word in text


def match_block(text: str | None, blocks: list[KBlock]) -> KBlock | None:
    """The one block the words point to, or None if none or several match (then the assistant asks)."""
    said = (text or "").lower().strip()
    if not said:
        return None
    hits: set[str] = set()
    for b in blocks:
        name = b.name.lower()
        if name in said:
            hits.add(str(b.id))
        for n in re.findall(r"\d+", name):
            if re.search(rf"(?<!\d){n}(?!\d)", said) or any(_has(said, w) for w in NUMBER_WORDS.get(n, [])):
                hits.add(str(b.id))
        for crop in b.crop_names.values():
            if crop and _has(said, crop.lower()):
                hits.add(str(b.id))
    return next((b for b in blocks if str(b.id) in hits), None) if len(hits) == 1 else None


# ---- formatting -----------------------------------------------------------------------------------------
def _pick(names: dict[str, str], lang: str, fallback: str = "") -> str:
    return names.get(lang) or names.get("en") or next(iter(names.values()), fallback)


def _hhmm(dt: datetime | None, tz: ZoneInfo) -> str:
    return dt.astimezone(tz).strftime("%H:%M") if dt else "--:--"


def _day(d: date) -> str:
    return f"{d.day} {d.strftime('%b')}"


def _age(then: datetime, now: datetime, lang: str) -> str:
    hours = max(0.0, (now - then).total_seconds() / 3600)
    if hours < 1:
        return t("age_minutes", lang, n=max(1, round(hours * 60)))
    if hours < 48:
        return t("age_hours", lang, n=round(hours))
    if hours < 24 * 730:
        return t("age_days", lang, n=round(hours / 24))
    return t("age_years", lang, n=round(hours / 24 / 365))


def _run_for(bundle: KioskBundle, block: KBlock) -> KRun | None:
    return next((r for r in bundle.runs if r.block_id == block.id), None)


def _which(bundle: KioskBundle, lang: str) -> ToolResult:
    return ToolResult(t("which_block", lang, blocks=", ".join(b.name for b in bundle.blocks)), "ask_block")


def _resolve(bundle: KioskBundle, args: dict[str, Any], lang: str, required: bool) -> KBlock | ToolResult | None:
    """A block, a 'which block?' answer, or None when no block was named and none is required."""
    said = args.get("block")
    if not said or str(said).strip().lower() in ("all", "every", "sab"):
        if required or len(bundle.blocks) == 1:
            return bundle.blocks[0] if len(bundle.blocks) == 1 else _which(bundle, lang)
        return None
    return match_block(str(said), bundle.blocks) or _which(bundle, lang)


def _plan_line(run: KRun, block: KBlock, tz: ZoneInfo, lang: str) -> str:
    crop = _pick(block.crop_names, lang, block.crop_key)
    if run.done:
        return t("plan_done", lang, block=block.name)
    if run.skip_reason == "rain":
        return t("plan_skip_rain", lang, block=block.name, crop=crop)
    if not run.steps:
        return t("plan_skip_no_need", lang, block=block.name, crop=crop)
    steps = t("plan_step_join", lang).join(
        t("plan_step", lang, tap=_pick(s.tap_label, lang, "tap"), minutes=s.minutes) for s in run.steps)
    return t("plan_minutes", lang, block=block.name, crop=crop, minutes=run.minutes,
             start=_hhmm(run.start, tz), steps=steps)


def run_tool(bundle: KioskBundle, name: str, args: dict[str, Any], lang: str) -> ToolResult:
    tz = ZoneInfo(bundle.farm.timezone)
    now = bundle.generated_at
    blocks = {b.id: b for b in bundle.blocks}

    if name == "help":
        return ToolResult(t("help", lang))
    if name == "confirm":
        return ToolResult("", "confirm_answer", answer="yes" if args.get("answer") == "yes" else "no")

    if name in ("today_plan", "why_plan", "mark_done"):
        target = _resolve(bundle, args, lang, required=name != "today_plan")
        if isinstance(target, ToolResult):
            return target
        if not bundle.runs:
            return ToolResult(t("no_plan", lang))
        if target is None:  # today_plan for every block
            lines = []
            for r in bundle.runs:
                b = blocks[r.block_id]
                lines.append(t("plan_all_line", lang, block=b.name, minutes=r.minutes) if r.steps and not r.done
                             else t("plan_all_skip", lang, block=b.name))
            return ToolResult(t("plan_all", lang, lines=", ".join(lines)))
        run = _run_for(bundle, target)
        if name == "today_plan":
            return ToolResult(_plan_line(run, target, tz, lang) if run else t("no_plan", lang))
        if name == "why_plan":
            return ToolResult(_pick(run.text, lang) if run else t("no_plan", lang))
        if run is None or not run.steps:
            return ToolResult(t("done_no_plan", lang, block=target.name))
        if run.done:
            return ToolResult(t("done_already", lang, block=target.name))
        return ToolResult(t("confirm_done", lang, block=target.name), "confirm",
                          {"action": "mark_done", "farm_id": str(bundle.farm.id), "plan_id": str(run.plan_id),
                           "block_id": str(target.id), "block_name": target.name})

    if name == "water_status":
        parts = []
        for tk in bundle.tanks:
            parts.append(t("tank", lang, tank=tk.name, pct=round(tk.level_pct), age=_age(tk.measured_at, now, lang))
                         if tk.level_pct is not None and tk.measured_at else t("tank_none", lang, tank=tk.name))
        for s in bundle.sources:
            tap = _pick(s.tap_label, lang, s.name)
            if s.ec is None or s.ec_measured_at is None:
                parts.append(t("source_none", lang, tap=tap))
            else:
                key = "source_ec_old" if s.stale else "source_ec"
                parts.append(t(key, lang, tap=tap, ec=f"{s.ec:.1f}", age=_age(s.ec_measured_at, now, lang)))
        return ToolResult(" ".join(parts))

    if name == "soil_status":
        target = _resolve(bundle, args, lang, required=False)
        if isinstance(target, ToolResult):
            return target
        lines = []
        for b in [target] if target else bundle.blocks:
            if b.soil.status == "none":
                lines.append(t("soil_none", lang, block=b.name))
                continue
            status = t(f"soil_{b.soil.status}", lang)
            due = b.next_test_due
            if due is not None and due <= bundle.day:
                lines.append(t("soil_due", lang, block=b.name, status=status))
            else:
                lines.append(t("soil", lang, block=b.name, status=status, due=_day(due) if due else "-"))
        return ToolResult(" ".join(lines))

    if name == "weather_now":
        if bundle.weather is None:
            return ToolResult(t("weather_none", lang))
        detail = args.get("detail", "all")
        today = next((d for d in bundle.weather.daily if d.day == bundle.day), None)
        parts = []
        temp = bundle.weather.current.get("temperature_2m")
        if detail in ("temp", "all") and today is not None:
            parts.append(t("weather_temp", lang, temp=round(float(temp)) if isinstance(temp, (int, float)) else "-",
                           tmax=round(today.tmax_c)))
        if detail in ("rain", "all") and today is not None:
            parts.append(t("weather_rain", lang, rain=f"{today.rain_mm:g}") if today.rain_mm > 0
                         else t("weather_no_rain", lang))
        if detail in ("sun", "all") and bundle.sun is not None:
            parts.append(t("weather_sun", lang, sunrise=_hhmm(bundle.sun.sunrise, tz),
                           sunset=_hhmm(bundle.sun.sunset, tz)))
        if detail in ("midday", "all"):
            d = bundle.day
            in_season = date(d.year, 6, 15) <= d <= date(d.year, 9, 15)
            parts.append(t("midday_on" if in_season else "midday_off", lang))
        return ToolResult(" ".join(parts) or t("weather_none", lang))

    if name == "next_announcement":
        nxt = next((a for a in bundle.announcements if a.status == "scheduled" and a.scheduled_at >= now), None)
        if nxt is None:
            return ToolResult(t("next_none", lang))
        return ToolResult(t("next_ann", lang, time=_hhmm(nxt.scheduled_at, tz), text=_pick(nxt.text, lang)))

    return ToolResult(t("not_understood", lang))
