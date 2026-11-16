import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from milh.announcements.build import RunForAnnounce, build_day
from milh.schemas.farms import FarmSettings

TZ = ZoneInfo("Asia/Dubai")
DAY = date(2026, 11, 16)
SUNRISE = datetime(2026, 11, 16, 6, 31, tzinfo=TZ)
SUNSET = datetime(2026, 11, 16, 17, 38, tzinfo=TZ)
BLUE = {"en": "blue tap", "ur": "نیلا نل"}
GREEN = {"en": "green tap", "ur": "سبز نل"}


def _run(start: datetime | None = datetime(2026, 11, 16, 5, 3, tzinfo=TZ), steps=None, skipped=None, flush=False):  # type: ignore[no-untyped-def]
    return RunForAnnounce(plan_id=uuid.uuid4(), block_name="Block 3", crop_name={"en": "Tomato"}, start=start,
                          steps=steps if steps is not None else [(BLUE, 33), (GREEN, 11)], flush=flush,
                          skipped=skipped)


def _types(drafts):  # type: ignore[no-untyped-def]
    return [d.type for d in drafts]


def _local(dt: datetime) -> str:
    return dt.astimezone(TZ).strftime("%H:%M")


def test_briefing_scheduled_in_farm_timezone() -> None:
    drafts = build_day(DAY, TZ, [_run()], SUNRISE, SUNSET, 29.4, [], FarmSettings())
    briefing = next(d for d in drafts if d.type == "daily_briefing")
    assert _local(briefing.scheduled_at) == "05:15"
    assert briefing.scheduled_at.utcoffset() == timedelta(hours=4)


def test_two_step_run_yields_start_switch_stop() -> None:
    drafts = [d for d in build_day(DAY, TZ, [_run()], SUNRISE, SUNSET, 29.4, [], FarmSettings())
              if d.type.startswith("irrigation_")]
    assert [(d.type, _local(d.scheduled_at)) for d in drafts] == [
        ("irrigation_start", "05:03"), ("irrigation_switch_source", "05:36"), ("irrigation_stop", "05:47")]
    assert drafts[1].slots["prev_tap"] == BLUE and drafts[1].slots["tap"] == GREEN
    assert drafts[2].slots["tap"] == GREEN


def test_zero_minute_plan_has_no_start_stop() -> None:
    drafts = build_day(DAY, TZ, [_run(start=None, steps=[], skipped="rain")], SUNRISE, SUNSET, 29.4, [],
                       FarmSettings())
    assert not any(t.startswith("irrigation_") for t in _types(drafts))
    briefing = next(d for d in drafts if d.type == "daily_briefing")
    assert briefing.template_key == "daily_briefing_no_irrigation"
    assert [line["key"] for line in briefing.slots["lines"]] == ["briefing_block_skipped"]


def test_sun_announcements() -> None:
    drafts = build_day(DAY, TZ, [], SUNRISE, SUNSET, 29.4, [], FarmSettings())
    sun = {d.type: _local(d.scheduled_at) for d in drafts if d.type in ("sunrise_soon", "sunset")}
    assert sun == {"sunrise_soon": "06:16", "sunset": "17:38"}


def test_midday_break_only_in_summer() -> None:
    summer = build_day(date(2026, 7, 1), TZ, [], SUNRISE.replace(month=7, day=1), SUNSET.replace(month=7, day=1),
                       44.0, [], FarmSettings())
    assert {"midday_break_start", "midday_break_end"} <= set(_types(summer))
    assert "midday_break_start" not in _types(build_day(DAY, TZ, [], SUNRISE, SUNSET, 29.4, [], FarmSettings()))


def test_heat_warning_threshold() -> None:
    assert "heat_warning" in _types(build_day(DAY, TZ, [], SUNRISE, SUNSET, 45.0, [], FarmSettings()))
    assert "heat_warning" not in _types(build_day(DAY, TZ, [], SUNRISE, SUNSET, 44.9, [], FarmSettings()))


def test_soil_due_tomorrow_and_today() -> None:
    drafts = build_day(DAY, TZ, [], SUNRISE, SUNSET, 29.4, [("Block 1", DAY + timedelta(days=1)), ("Block 2", DAY)],
                       FarmSettings())
    assert {"soil_test_due_tomorrow", "soil_test_due_today"} <= set(_types(drafts))


def test_flush_day_announced() -> None:
    assert "flush_day" in _types(build_day(DAY, TZ, [_run(flush=True)], SUNRISE, SUNSET, 29.4, [], FarmSettings()))
