import json
from datetime import timedelta

import pytest
from sqlalchemy import select

from milh.assistant import chat as chat_mod
from milh.assistant.llm import LLMUnavailable
from milh.models import IrrigationEvent
from milh.planning.planner import plan_farm_day
from tests.factories import make_farm, make_user
from tests.planning.test_planner import DAY, NOW, _setup

LATER = NOW + timedelta(hours=1)


def tool_call(name: str, **args: object) -> dict:
    return {"role": "assistant", "content": None, "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}


def fake(*replies: dict):  # type: ignore[no-untyped-def]
    calls: list[list[dict]] = []

    def complete(messages, tools):  # type: ignore[no-untyped-def]
        calls.append(messages)
        return replies[min(len(calls) - 1, len(replies) - 1)], "fake (model)"

    complete.calls = calls  # type: ignore[attr-defined]
    return complete


@pytest.fixture
def setup(session):  # type: ignore[no-untyped-def]
    owner, farm, well, desal, block = _setup(session)
    plan_farm_day(session, farm.id, DAY, NOW)
    worker = make_user(session, role="worker")
    session.commit()
    return session, farm, worker, block


def _turn(session, farm, worker, question, complete, context=None, lang="en"):  # type: ignore[no-untyped-def]
    return chat_mod.turn(session, farm, worker, lang, [], context, question, LATER, complete=complete)


def test_question_runs_tool_and_templates_answer(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup
    r = _turn(session, farm, worker, "how long for block 3?", fake(tool_call("today_plan", block="block 3")))
    assert "Block 3" in r.reply and "minutes" in r.reply and r.pending is None


def test_model_digits_dropped(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup
    r = _turn(session, farm, worker, "hello", fake({"role": "assistant", "content": "Water block 3 for 45 minutes!"}))
    assert "45" not in r.reply


def test_small_talk_passes_guard(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup
    r = _turn(session, farm, worker, "hello", fake({"role": "assistant", "content": "Hello! Ask me about watering."}))
    assert r.reply == "Hello! Ask me about watering."


def test_yes_without_pending_does_nothing(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup
    r = _turn(session, farm, worker, "yes", fake(tool_call("confirm", answer="yes")))
    assert "nothing to confirm" in r.reply.lower()
    assert session.scalars(select(IrrigationEvent)).all() == []


def test_done_then_yes_writes_voice_event(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, block = setup
    first = _turn(session, farm, worker, "block 3 is done", fake(tool_call("mark_done", block="block 3")))
    assert first.pending and "say yes" in first.reply.lower()
    assert session.scalars(select(IrrigationEvent)).all() == []
    second = _turn(session, farm, worker, "haan", fake(), context=first.context)
    ev = session.scalars(select(IrrigationEvent)).one()
    assert ev.method == "voice" and ev.block_id == block.id and ev.confirmed_by_user_id == worker.id
    assert second.pending is None and "marked as watered" in second.reply


def test_done_then_no_writes_nothing(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup
    first = _turn(session, farm, worker, "block 3 done", fake(tool_call("mark_done", block="3")))
    second = _turn(session, farm, worker, "nahi", fake(), context=first.context)
    assert "nothing saved" in second.reply.lower() and second.pending is None
    assert session.scalars(select(IrrigationEvent)).all() == []


def test_done_twice_one_event(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup
    first = _turn(session, farm, worker, "block 3 done", fake(tool_call("mark_done", block="3")))
    _turn(session, farm, worker, "yes", fake(), context=first.context)
    again = _turn(session, farm, worker, "yes", fake(), context=first.context)
    assert len(session.scalars(select(IrrigationEvent)).all()) == 1
    assert "already" in again.reply.lower()


def test_pending_for_other_farm_rejected(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup
    first = _turn(session, farm, worker, "block 3 done", fake(tool_call("mark_done", block="3")))
    other = make_farm(session, make_user(session), name="Other")
    r = _turn(session, other, worker, "yes", fake(), context=first.context)
    assert session.scalars(select(IrrigationEvent)).all() == []
    assert "nothing to confirm" in r.reply.lower()


def test_llm_unavailable_fixed_line(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup

    def down(messages, tools):  # type: ignore[no-untyped-def]
        raise LLMUnavailable("no keys")

    r = _turn(session, farm, worker, "how long?", down)
    assert "not available right now" in r.reply


def test_urdu_answer(setup) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup
    r = _turn(session, farm, worker, "بلاک 3 کتنا پانی؟", fake(tool_call("today_plan", block="3")), lang="ur")
    assert "منٹ" in r.reply


@pytest.mark.parametrize("said,expected", [
    ("haan", "yes"), ("haan ji", "yes"), ("yes please", "yes"), ("ok", "yes"), ("ہاں جی", "yes"),
    ("nahi", "no"), ("no thanks", "no"),
    ("ok block 2", None), ("okay what about two", None), ("say yes", None), ("yes or tap the", None),
    ("yes no", None),
])
def test_yes_no_only_when_every_word_is_an_answer(said: str, expected: str | None) -> None:
    assert chat_mod.yes_no(said) == expected


@pytest.mark.parametrize("text", [
    "Water block three for twenty minutes.", "Give it half an hour.", "بلاک کو تین منٹ دیں", "teen ghante",
])
def test_guard_blocks_number_words(text: str) -> None:
    assert chat_mod.guard(text) is None


def test_guard_allows_plain_small_talk() -> None:
    assert chat_mod.guard("Hello! Ask me about today's watering.") == "Hello! Ask me about today's watering."


def test_tool_error_gives_fixed_line_not_crash(setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    session, farm, worker, _b = setup

    def boom(*a, **k):  # type: ignore[no-untyped-def]
        raise RuntimeError("database hiccup")

    monkeypatch.setattr(chat_mod, "run_tool", boom)
    r = _turn(session, farm, worker, "how long?", fake(tool_call("today_plan", block="3")))
    assert "not available right now" in r.reply
