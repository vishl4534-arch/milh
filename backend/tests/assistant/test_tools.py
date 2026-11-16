from datetime import timedelta

import pytest

from milh.assistant.tools import match_block, run_tool, schemas
from milh.kiosk import build_bundle
from milh.models import SoilTest
from milh.planning.planner import plan_farm_day
from tests.planning.test_planner import DAY, NOW, _setup

LATER = NOW + timedelta(hours=1)


@pytest.fixture
def farm_bundle(session):  # type: ignore[no-untyped-def]
    _owner, farm, well, desal, block = _setup(session)
    plan_farm_day(session, farm.id, DAY, NOW)
    session.commit()
    return session, farm, block


def _run(session, farm, name, lang="en", **args):  # type: ignore[no-untyped-def]
    return run_tool(build_bundle(session, farm, LATER), name, args, lang)


def test_schemas_list_tools() -> None:
    names = {t["function"]["name"] for t in schemas()}
    assert names == {"today_plan", "why_plan", "water_status", "soil_status", "weather_now", "next_announcement",
                     "mark_done", "confirm", "help"}


def test_today_plan_minutes_and_taps(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, _block = farm_bundle
    run = build_bundle(session, farm, LATER).runs[0]
    r = _run(session, farm, "today_plan", block="block 3")
    assert f"{run.minutes} minutes" in r.text and "blue tap" in r.text and "Block 3" in r.text
    ur = _run(session, farm, "today_plan", lang="ur", block="block 3")
    assert str(run.minutes) in ur.text and "نیلا نل" in ur.text


def test_today_plan_rain_skip(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, _block = farm_bundle
    b = build_bundle(session, farm, LATER)
    b.runs[0] = b.runs[0].model_copy(update={"minutes": 0, "steps": [], "skip_reason": "rain", "start": None})
    r = run_tool(b, "today_plan", {"block": "3"}, "en")
    assert "no watering today" in r.text.lower() and "rain" in r.text.lower()


def test_no_plan_yet(session) -> None:  # type: ignore[no-untyped-def]
    _owner, farm, *_ = _setup(session)
    r = _run(session, farm, "today_plan", block="block 3")
    assert "no watering plan for today yet" in r.text.lower()


def test_why_uses_plan_text(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, _block = farm_bundle
    run = build_bundle(session, farm, LATER).runs[0]
    assert _run(session, farm, "why_plan", block="Block 3").text == run.text["en"]


def test_water_status_empty_state(session) -> None:  # type: ignore[no-untyped-def]
    _owner, farm, *_ = _setup(session, ec_well=None)
    r = _run(session, farm, "water_status")
    assert "no reading" in r.text.lower()
    assert "0 percent" not in r.text


def test_water_status_with_salt(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, _block = farm_bundle
    assert "3.6" in _run(session, farm, "water_status").text


def test_soil_next_test(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, block = farm_bundle
    assert "not been tested" in _run(session, farm, "soil_status", block="3").text
    session.add(SoilTest(block_id=block.id, tested_on=DAY - timedelta(days=1), ece=1.0, ph=7.5, source="manual"))
    session.flush()
    r = _run(session, farm, "soil_status", block="3")
    assert "next test" in r.text.lower() and "22 Nov" in r.text


def test_sunset_time(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, _block = farm_bundle
    r = _run(session, farm, "weather_now", detail="sun")
    assert "17:30" in r.text and "06:32" in r.text


def test_next_announcement(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, _block = farm_bundle
    r = _run(session, farm, "next_announcement")
    assert r.text.lower().startswith("next at")


def test_unknown_block_asks_which(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, _block = farm_bundle
    r = _run(session, farm, "today_plan", block="block 9")
    assert r.kind == "ask_block" and "Which block" in r.text and "Block 3" in r.text


def test_mark_done_proposes_only(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, block = farm_bundle
    from milh.models import IrrigationEvent

    r = _run(session, farm, "mark_done", block="block 3")
    assert r.kind == "confirm" and r.pending and r.pending["block_id"] == str(block.id)
    assert "say yes" in r.text.lower()
    assert session.query(IrrigationEvent).count() == 0


def test_match_block_words_and_crops(farm_bundle) -> None:  # type: ignore[no-untyped-def]
    session, farm, block = farm_bundle
    blocks = build_bundle(session, farm, LATER).blocks
    assert match_block("teen number", blocks) is not None
    assert match_block("tomato wala", blocks).id == block.id  # type: ignore[union-attr]
    assert match_block("ٹماٹر", blocks).id == block.id  # type: ignore[union-attr]
    assert match_block("block 9", blocks) is None
