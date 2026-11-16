import json
from types import SimpleNamespace

import httpx
import pytest
import respx

from milh.assistant import llm

GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
GROQ = "https://api.groq.com/openai/v1/chat/completions"
TOOLS = [{"type": "function", "function": {"name": "today_plan", "parameters": {
    "type": "object", "properties": {"block": {"type": "string"}}, "required": ["block"]}}}]


def _settings(**kw):  # type: ignore[no-untyped-def]
    base = dict(gemini_api_key="g-key", groq_api_key="q-key", assistant_model="gemini-test", groq_model="groq-test",
                groq_reasoning_effort="low", llm_providers=["gemini", "groq"], llm_timeout_seconds=2.0,
                llm_hedge_seconds=1.0)
    base.update(kw)
    return SimpleNamespace(**base)


def _reply(message: dict) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": message}]})


def _call(name: str, args: dict) -> dict:
    return {"role": "assistant", "content": None,
            "tool_calls": [{"id": "c1", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}


@respx.mock
def test_gemini_answers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm, "get_settings", lambda: _settings())
    route = respx.post(GEMINI).mock(return_value=_reply(_call("today_plan", {"block": "Block 3"})))
    msg, label = llm.complete([{"role": "user", "content": "how long block 3"}], TOOLS)
    assert label == "gemini (gemini-test)"
    assert msg["tool_calls"][0]["function"]["name"] == "today_plan"
    assert json.loads(route.calls.last.request.content)["model"] == "gemini-test"


@respx.mock
def test_bad_tool_call_falls_back_to_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm, "get_settings", lambda: _settings())
    respx.post(GEMINI).mock(return_value=_reply(_call("today_plan", {"block": 3})))  # wrong type
    respx.post(GROQ).mock(return_value=_reply(_call("today_plan", {"block": "Block 3"})))
    _msg, label = llm.complete([{"role": "user", "content": "x"}], TOOLS)
    assert label.startswith("groq")


def test_no_keys_raises_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm, "get_settings", lambda: _settings(gemini_api_key=None, groq_api_key=None))
    with pytest.raises(llm.LLMUnavailable):
        llm.complete([{"role": "user", "content": "x"}], TOOLS)


def test_call_problem_rejects_extra_and_wrong_types() -> None:
    def call(args: dict) -> dict:
        return {"function": {"name": "today_plan", "arguments": json.dumps(args)}}

    assert llm.call_problem(call({"block": "B"}), TOOLS) is None
    assert "unexpected" in (llm.call_problem(call({"block": "B", "x": 1}), TOOLS) or "")
    assert "bad value" in (llm.call_problem(call({"block": 3}), TOOLS) or "")
    assert "missing" in (llm.call_problem(call({}), TOOLS) or "")
    assert "unknown tool" in (llm.call_problem({"function": {"name": "nope", "arguments": "{}"}}, TOOLS) or "")
