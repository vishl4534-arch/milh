from datetime import datetime, time
from zoneinfo import ZoneInfo

from milh.agronomy.timing import BlockRun, schedule_runs

TZ = ZoneInfo("Asia/Dubai")
SUNRISE = datetime(2026, 11, 16, 6, 31, tzinfo=TZ)
SUNSET = datetime(2026, 11, 16, 17, 38, tzinfo=TZ)


def _fmt(r):  # type: ignore[no-untyped-def]
    return r.start.strftime("%H:%M")


def test_fits_before_sunrise() -> None:
    r = schedule_runs([BlockRun("b1", 38), BlockRun("b2", 50)], SUNRISE, SUNSET, time(5, 0))
    assert [(x.start.strftime("%H:%M"), x.end.strftime("%H:%M"), x.slot) for x in r] == [
        ("05:03", "05:41", "morning"),
        ("05:41", "06:31", "morning"),
    ]


def test_overflow_to_evening() -> None:
    r = schedule_runs(
        [BlockRun("b1", 120), BlockRun("b2", 90), BlockRun("b3", 60)], SUNRISE, SUNSET, time(5, 0)
    )
    assert [(x.block_id, x.start.strftime("%H:%M"), x.slot) for x in r] == [
        ("b1", "05:00", "morning"),
        ("b2", "07:00", "morning"),
        ("b3", "18:08", "evening"),
    ]


def test_zero_minute_runs_dropped() -> None:
    assert schedule_runs([BlockRun("b1", 0)], SUNRISE, SUNSET, time(5, 0)) == []


def test_keeps_farm_timezone() -> None:
    r = schedule_runs([BlockRun("b1", 30)], SUNRISE, SUNSET, time(5, 0))
    assert r[0].start.utcoffset() == SUNRISE.utcoffset()
