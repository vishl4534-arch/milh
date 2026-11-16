"""Place block irrigation runs around sunrise, inside worker hours (spec §7.2 step 8)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Literal


@dataclass(frozen=True)
class BlockRun:
    block_id: str
    minutes: int


@dataclass(frozen=True)
class ScheduledRun:
    block_id: str
    start: datetime
    end: datetime
    slot: Literal["morning", "evening"]


def schedule_runs(
    runs: list[BlockRun],
    sunrise: datetime,
    sunset: datetime,
    earliest_start: time,
    morning_overrun: timedelta = timedelta(hours=2),
    evening_offset: timedelta = timedelta(minutes=30),
) -> list[ScheduledRun]:
    """One block at a time, in the given order. The morning run ends at sunrise when worker hours
    allow; whatever cannot finish by sunrise + overrun moves to an evening slot after sunset."""
    active = [r for r in runs if r.minutes > 0]
    if not active:
        return []
    total = timedelta(minutes=sum(r.minutes for r in active))
    earliest = datetime.combine(sunrise.date(), earliest_start, tzinfo=sunrise.tzinfo)
    cursor = max(earliest, sunrise - total)
    limit = sunrise + morning_overrun

    out: list[ScheduledRun] = []
    evening = False
    for r in active:
        dur = timedelta(minutes=r.minutes)
        if not evening and cursor + dur > limit:
            evening = True
            cursor = sunset + evening_offset
        out.append(ScheduledRun(r.block_id, cursor, cursor + dur, "evening" if evening else "morning"))
        cursor += dur
    return out
