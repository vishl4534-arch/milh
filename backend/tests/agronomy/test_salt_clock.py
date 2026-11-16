from datetime import date, timedelta

import pytest

from milh.agronomy.salt_clock import salt_clock, yield_pct
from tests.agronomy.fixtures import BARLEY, DATE_PALM, TOMATO

D0 = date(2026, 1, 1)
READ = [(D0, 3.0), (D0 + timedelta(30), 3.1), (D0 + timedelta(60), 3.2), (D0 + timedelta(90), 3.3)]
LIB = {"tomato": TOMATO, "date_palm": DATE_PALM, "barley": BARLEY}


def test_salt_clock_date_palm() -> None:
    c = salt_clock(READ, DATE_PALM, LIB, today=D0 + timedelta(90))
    assert c.status == "ok"
    assert c.current_ecw == pytest.approx(3.3)
    assert c.current_yield_pct == pytest.approx(96.58, abs=0.01)
    assert c.date_loss_10 is not None and abs((c.date_loss_10 - date(2027, 4, 2)).days) <= 1
    assert c.date_loss_25 is not None and abs((c.date_loss_25 - date(2029, 7, 13)).days) <= 1
    assert c.suggested_crops == ["barley"]


def test_collecting_until_four_readings() -> None:
    c = salt_clock(READ[:3], DATE_PALM, LIB, D0 + timedelta(90))
    assert c.status == "collecting"
    assert c.n_readings == 3


def test_collecting_until_span() -> None:
    short = [(D0 + timedelta(i * 4), 3.0 + i * 0.1) for i in range(4)]
    assert salt_clock(short, DATE_PALM, LIB, D0 + timedelta(12)).status == "collecting"


def test_falling_salinity_never_crosses() -> None:
    c = salt_clock([(d, 6.6 - ec) for d, ec in READ], DATE_PALM, LIB, D0 + timedelta(90))
    assert c.date_loss_10 is None
    assert c.date_loss_25 is None


def test_already_crossed_returns_today() -> None:
    c = salt_clock(READ, TOMATO, LIB, D0 + timedelta(90))
    assert c.date_loss_10 == D0 + timedelta(90)


def test_yield_clamped() -> None:
    assert yield_pct(50, 2.5, 9.9) == 0.0
    assert yield_pct(1.0, 2.5, 9.9) == 100.0
