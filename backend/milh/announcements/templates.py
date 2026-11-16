"""Announcement and explanation templates per language: fixed phrases with {slot} fill-ins.

Templates (not machine translation of free text) keep spoken numbers exact and reviewable.
"""

from __future__ import annotations

import json
import string
from datetime import datetime
from functools import cache
from pathlib import Path
from typing import Any

TEMPLATE_DIR = Path(__file__).parent / "templates"
FALLBACK_LANG = "en"


@cache
def load(lang: str) -> dict[str, str]:
    path = TEMPLATE_DIR / f"{lang}.json"
    data: dict[str, str] = json.loads(path.read_text(encoding="utf-8"))
    return data


def available_languages() -> list[str]:
    return sorted(p.stem for p in TEMPLATE_DIR.glob("*.json"))


def slot_names(template: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(template) if name}


def render(key: str, lang: str, slots: dict[str, Any]) -> str:
    """Fill a template. Raises KeyError on an unknown key or a missing slot. Unknown languages
    fall back to English rather than failing an announcement."""
    table = load(lang) if (TEMPLATE_DIR / f"{lang}.json").exists() else load(FALLBACK_LANG)
    template = table[key]
    missing = slot_names(template) - set(slots)
    if missing:
        raise KeyError(f"template {key!r} missing slot(s): {', '.join(sorted(missing))}")
    return template.format_map({k: slots[k] for k in slot_names(template)})


def format_time(dt: datetime, lang: str) -> str:
    return dt.strftime("%H:%M")


def localized(names: dict[str, str], lang: str) -> str:
    """Pick the name in `lang`, else English, else any."""
    return names.get(lang) or names.get(FALLBACK_LANG) or next(iter(names.values()), "")
