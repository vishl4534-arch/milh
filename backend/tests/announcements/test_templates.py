import pytest

from milh.announcements.templates import available_languages, load, render, slot_names


def test_template_keys_match_across_languages() -> None:
    langs = available_languages()
    assert {"en", "ur"} <= set(langs)
    base = load("en")
    for lang in langs:
        table = load(lang)
        assert set(table) == set(base), f"{lang} keys differ"
        for key, text in table.items():
            assert slot_names(text) == slot_names(base[key]), f"{lang}:{key} slots differ"


def test_render_fills_slots() -> None:
    assert render("tank_low", "en", {"tank": "Main tank", "pct": 20}) == "Main tank is at 20 percent. Tell the owner."


def test_render_missing_slot_raises() -> None:
    with pytest.raises(KeyError):
        render("tank_low", "en", {"tank": "Main tank"})


def test_unknown_language_falls_back_to_english() -> None:
    assert render("midday_break_end", "xx", {}).startswith("Midday break is over")
