import math

import pytest

from milh.agronomy.blend import SourceOption, choose_blend, split_minutes

WELL = SourceOption("well", 3.6, 0.5)
DESAL = SourceOption("desal", 0.4, 5.0)


def test_blend_cheapest_feasible() -> None:
    r = choose_blend([WELL, DESAL], 7.015, 1000, 2.5)
    assert r.fractions == pytest.approx({"well": 0.75, "desal": 0.25})
    assert r.ecw == pytest.approx(2.8)
    assert r.lr == pytest.approx(0.28866, abs=1e-4)
    assert r.gross_l == pytest.approx(10957.3, rel=1e-3)
    assert r.cost_aed == pytest.approx(17.81, abs=0.02)
    assert not r.cap_exceeded
    assert r.lr_cheapest_alone == pytest.approx(0.40449, abs=1e-4)


def test_blend_fresh_well_uses_only_well() -> None:
    r = choose_blend([SourceOption("well", 1.0, 0.5), DESAL], 7.015, 1000, 2.5)
    assert r.fractions == {"well": 1.0, "desal": 0.0}


def test_blend_single_source() -> None:
    r = choose_blend([WELL], 7.015, 1000, 2.5)
    assert r.fractions == {"well": 1.0}
    assert r.cap_exceeded  # LR 0.40 > cap 0.3 with no other water available


def test_blend_infeasible_picks_lowest_ec_and_flags() -> None:
    r = choose_blend([SourceOption("w", 14.0, 0.5), SourceOption("w2", 13.0, 0.4)], 7.0, 1000, 2.5)
    assert r.cap_exceeded
    assert r.fractions["w2"] == 1.0
    assert r.lr == 0.3
    assert math.isfinite(r.gross_l)


def test_blend_zero_need() -> None:
    assert choose_blend([WELL, DESAL], 0.0, 1000, 2.5).gross_l == 0


def test_blend_requires_a_source() -> None:
    with pytest.raises(ValueError):
        choose_blend([], 7.0, 1000, 2.5)


def test_split_minutes() -> None:
    assert split_minutes(43.83, {"well": 0.75, "desal": 0.25}, ["well", "desal"]) == [
        ("well", 33),
        ("desal", 11),
    ]


def test_split_minutes_at_least_one_and_skips_zero() -> None:
    assert split_minutes(10, {"well": 0.98, "desal": 0.02, "tse": 0.0}, ["well", "desal", "tse"]) == [
        ("well", 10),
        ("desal", 1),
    ]


def test_split_zero_total() -> None:
    assert split_minutes(0, {"well": 1.0}, ["well"]) == []
