"""Language-model client for the voice assistant (ported from the team's sea-safe project).

Gemini first, Groq as optional backup, both through their OpenAI-compatible chat-completions endpoints,
so there is one code path. Each provider gets a hard time limit; if the first is slow the next is asked
too, and a tool call that does not match its tool counts as a failure.
"""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from typing import Any

import httpx

from milh.config import get_settings

log = logging.getLogger("milh.assistant.llm")

PROVIDERS: dict[str, dict[str, str]] = {
    "gemini": {"base_url": "https://generativelanguage.googleapis.com/v1beta/openai/", "key": "gemini_api_key",
               "model": "assistant_model", "effort": ""},
    "groq": {"base_url": "https://api.groq.com/openai/v1/", "key": "groq_api_key", "model": "groq_model",
             "effort": "groq_reasoning_effort"},
}
_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="llm")
_HTTP = httpx.Client(timeout=10, headers={"User-Agent": "milh-farm-platform/0.1"})


class LLMUnavailable(Exception):
    pass


def _fits(value: Any, spec: dict[str, Any]) -> bool:
    kind = spec.get("type")
    if kind == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            return False
        return bool(spec.get("minimum", value) <= value <= spec.get("maximum", value))
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str) and ("enum" not in spec or value in spec["enum"])
    return False


def call_problem(call: dict[str, Any], tools: list[dict[str, Any]]) -> str | None:
    """Why a tool call does not match its tool (None if it does)."""
    try:
        name, raw = call["function"]["name"], call["function"].get("arguments")
    except (KeyError, TypeError, AttributeError):
        return "no function name"
    schema = next((t["function"]["parameters"] for t in tools if t["function"]["name"] == name), None)
    if schema is None:
        return f"unknown tool {name!r}"
    try:
        args = json.loads(raw or "{}") if isinstance(raw, str) else raw
    except ValueError:
        return "arguments are not JSON"
    if not isinstance(args, dict):
        return "arguments are not an object"
    props, required = schema.get("properties", {}), schema.get("required", [])
    missing = [k for k in required if k not in args]
    if missing:
        return f"missing {missing}"
    extra = [k for k in args if k not in props]
    if extra:
        return f"unexpected {extra}"
    bad = [k for k, v in args.items() if not _fits(v, props[k])]
    if bad:
        return f"bad value for {bad}"
    return None


def _valid(message: dict[str, Any], tools: list[dict[str, Any]]) -> bool:
    for call in message.get("tool_calls") or []:
        problem = call_problem(call, tools)
        if problem:
            log.warning("tool call refused: %s", problem)
            return False
    return bool(message.get("tool_calls")) or bool((message.get("content") or "").strip())


def _clean(messages: list[dict[str, Any]], provider: str) -> list[dict[str, Any]]:
    """Only standard fields, so a turn started on one provider can finish on another (Gemini's tool calls
    carry an extra field it needs back; others may reject it)."""
    out = []
    for m in messages:
        c: dict[str, Any] = {k: m[k] for k in ("role", "content", "tool_call_id", "name") if k in m}
        if m.get("tool_calls"):
            c["tool_calls"] = [{k: tc[k] for k in ("id", "type", "function", "extra_content")
                                if k in tc and (k != "extra_content" or provider == "gemini")}
                               for tc in m["tool_calls"]]
        out.append(c)
    return out


def _ask(name: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    s = get_settings()
    p = PROVIDERS[name]
    model = getattr(s, p["model"])
    body: dict[str, Any] = {"model": model, "messages": _clean(messages, name), "tools": tools,
                            "tool_choice": "auto", "temperature": 0}
    effort = getattr(s, p["effort"]) if p["effort"] else ""
    if effort:
        body["reasoning_effort"] = effort
    r = _HTTP.post(p["base_url"] + "chat/completions", timeout=s.llm_timeout_seconds,
                   headers={"Authorization": f"Bearer {getattr(s, p['key'])}"}, json=body)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
    message: dict[str, Any] = r.json()["choices"][0]["message"]
    if not _valid(message, tools):
        raise RuntimeError("empty reply or a tool call that does not match its tool")
    for i, call in enumerate(message.get("tool_calls") or []):
        call.setdefault("id", f"call_{i}")
        call.setdefault("type", "function")
    return message, f"{name} ({model})"


def available() -> bool:
    s = get_settings()
    return any(getattr(s, PROVIDERS[n]["key"], None) for n in s.llm_providers if n in PROVIDERS)


def complete(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    """Returns (assistant message, "provider (model)") or raises LLMUnavailable."""
    s = get_settings()
    queue = [n for n in s.llm_providers if n in PROVIDERS]
    errors: list[str] = []
    running: dict[Future[tuple[dict[str, Any], str]], tuple[str, float]] = {}

    def start_next() -> bool:
        while queue:
            name = queue.pop(0)
            if not getattr(s, PROVIDERS[name]["key"], None):
                errors.append(f"{name}: no key")
                continue
            running[_POOL.submit(_ask, name, messages, tools)] = (name, time.monotonic())
            return True
        return False

    cap, hedge = s.llm_timeout_seconds, s.llm_hedge_seconds
    start_next()
    while running:
        newest = max(t for _, t in running.values())
        wake = min([t + cap for _, t in running.values()] + ([newest + hedge] if queue else []))
        done, _ = wait(running, timeout=max(0.0, wake - time.monotonic()), return_when=FIRST_COMPLETED)
        for f in done:
            name, _ = running.pop(f)
            try:
                message, label = f.result()
            except Exception as e:
                log.warning("LLM %s failed, trying next: %s", name, e)
                errors.append(f"{name}: {e}")
                continue
            return message, label
        now = time.monotonic()
        for f, (name, t) in list(running.items()):
            if now - t >= cap:
                running.pop(f)
                errors.append(f"{name}: no answer within {cap} s")
        if not running:
            start_next()
        elif queue and now - max(t for _, t in running.values()) >= hedge:
            start_next()
    raise LLMUnavailable("; ".join(errors) or "no providers configured")
