from datetime import date, timedelta

from milh.agronomy.soil_schedule import SoilResult, next_soil_test

D0 = date(2026, 11, 1)


def r(days: int, ece: float, ph: float | None = 7.5) -> SoilResult:
    return SoilResult(D0 + timedelta(days), ece, ph)


def test_first_two_tests_short() -> None:
    assert next_soil_test([r(0, 1.0), r(14, 1.0)], 2.5, False) == (D0 + timedelta(21), ["first_tests"])


def test_near_threshold_short() -> None:
    assert "near_threshold" in next_soil_test([r(0, 1.5), r(7, 1.6), r(14, 2.1)], 2.5, False)[1]


def test_changed_short() -> None:
    assert next_soil_test([r(0, 1.2), r(7, 1.2), r(14, 1.5)], 2.5, False)[0] == D0 + timedelta(21)


def test_ph_short() -> None:
    assert "ph_out_of_range" in next_soil_test([r(0, 1.5), r(7, 1.5), r(14, 1.5, 8.7)], 2.5, False)[1]


def test_flush_short() -> None:
    assert "flush" in next_soil_test([r(0, 1.5), r(7, 1.5), r(14, 1.5)], 2.5, True)[1]


def test_stable_long() -> None:
    assert next_soil_test([r(0, 1.4), r(7, 1.45), r(14, 1.5)], 2.5, False) == (
        D0 + timedelta(28),
        ["stable"],
    )


def test_unknown_ph_does_not_trigger() -> None:
    assert next_soil_test([r(0, 1.4), r(7, 1.45), r(14, 1.5, None)], 2.5, False)[1] == ["stable"]
