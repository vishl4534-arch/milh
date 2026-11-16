"""Build one day's scheduled announcements from plans, sun times, forecast and soil-test due dates.

Pure: returns drafts. Slot values may be per-language dicts ({"en": "blue tap", "ur": ...}); they are
resolved to one language at render time.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from milh.schemas.farms import FarmSettings

BUILD_TYPES = frozenset({
    "daily_briefing", "irrigation_start", "irrigation_switch_source", "irrigation_stop", "sunrise_soon",
    "sunset", "heat_warning", "midday_break_start", "midday_break_end", "soil_test_due_tomorrow",
    "soil_test_due_today", "flush_day",
})
MIDDAY_START, MIDDAY_END = time(12, 25), time(15, 0)
HEAT_TIME = time(11, 0)
SOIL_TIME = time(7, 0)


@dataclass(frozen=True)
class RunForAnnounce:
    plan_id: uuid.UUID
    block_name: str
    crop_name: dict[str, str]
    start: datetime | None
    steps: list[tuple[dict[str, str], int]]  # (tap label per language, minutes)
    flush: bool
    skipped: str | None


@dataclass
class AnnouncementDraft:
    type: str
    scheduled_at: datetime
    template_key: str
    slots: dict[str, Any] = field(default_factory=dict)
    plan_id: uuid.UUID | None = None


def _at(day: date, t: time, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, t, tzinfo=tz)


def _hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def _in_midday_break_season(day: date) -> bool:
    return date(day.year, 6, 15) <= day <= date(day.year, 9, 15)


def build_day(
    day: date,
    tz: ZoneInfo,
    runs: list[RunForAnnounce],
    sunrise: datetime | None,
    sunset: datetime | None,
    tmax_c: float | None,
    soil_due: list[tuple[str, date]],
    s: FarmSettings,
) -> list[AnnouncementDraft]:
    out: list[AnnouncementDraft] = []
    briefing_at = _at(day, _hhmm(s.briefing_time), tz)
    active = [r for r in runs if r.start is not None and r.steps]

    lines: list[dict[str, Any]] = []
    for r in runs:
        if r.start is not None and r.steps:
            lines.append({"key": "briefing_block_line",
                          "slots": {"block": r.block_name, "crop": r.crop_name, "start": {"_time": r.start.isoformat()},
                                    "minutes": sum(m for _, m in r.steps)}})
        else:
            lines.append({"key": "briefing_block_skipped", "slots": {"block": r.block_name, "crop": r.crop_name}})
    tmax = round(tmax_c) if tmax_c is not None else "-"
    out.append(AnnouncementDraft(
        "daily_briefing", briefing_at, "daily_briefing" if active else "daily_briefing_no_irrigation",
        {"main": {"tmax": tmax, "count": len(active)}, "lines": lines},
    ))

    for r in active:
        assert r.start is not None
        if r.flush:
            out.append(AnnouncementDraft("flush_day", briefing_at + timedelta(minutes=1), "flush_day",
                                         {"block": r.block_name}, r.plan_id))
        cursor = r.start
        prev_tap: dict[str, str] | None = None
        for i, (tap, minutes) in enumerate(r.steps):
            if i == 0:
                out.append(AnnouncementDraft("irrigation_start", cursor, "irrigation_start",
                                             {"block": r.block_name, "crop": r.crop_name, "tap": tap,
                                              "minutes": minutes, "step": i}, r.plan_id))
            else:
                out.append(AnnouncementDraft("irrigation_switch_source", cursor, "irrigation_switch_source",
                                             {"block": r.block_name, "prev_tap": prev_tap, "tap": tap,
                                              "minutes": minutes, "step": i}, r.plan_id))
            cursor += timedelta(minutes=minutes)
            prev_tap = tap
        out.append(AnnouncementDraft("irrigation_stop", cursor, "irrigation_stop",
                                     {"block": r.block_name, "tap": prev_tap}, r.plan_id))

    if sunrise is not None:
        out.append(AnnouncementDraft("sunrise_soon", sunrise - timedelta(minutes=15), "sunrise_soon",
                                     {"time": {"_time": sunrise.isoformat()}}))
    if sunset is not None:
        out.append(AnnouncementDraft("sunset", sunset, "sunset", {"time": {"_time": sunset.isoformat()}}))
    if tmax_c is not None and tmax_c >= s.heat_c:
        out.append(AnnouncementDraft("heat_warning", _at(day, HEAT_TIME, tz), "heat_warning", {"tmax": round(tmax_c)}))
    if s.midday_break and _in_midday_break_season(day):
        out.append(AnnouncementDraft("midday_break_start", _at(day, MIDDAY_START, tz), "midday_break_start", {}))
        out.append(AnnouncementDraft("midday_break_end", _at(day, MIDDAY_END, tz), "midday_break_end", {}))
    for block_name, due in soil_due:
        if due == day + timedelta(days=1):
            out.append(AnnouncementDraft("soil_test_due_tomorrow", _at(day, SOIL_TIME, tz), "soil_test_due_tomorrow",
                                         {"block": block_name}))
        elif due == day:
            out.append(AnnouncementDraft("soil_test_due_today", _at(day, SOIL_TIME, tz), "soil_test_due_today",
                                         {"block": block_name}))
    out.sort(key=lambda d: d.scheduled_at)
    return out
