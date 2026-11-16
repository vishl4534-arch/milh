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


def test_already_crossed_before_first_reading_returns_first_reading() -> None:
    # Tomato loses 10 % already at the first reading's salt: the line was crossed no later than that day.
    c = salt_clock(READ, TOMATO, LIB, D0 + timedelta(90))
    assert c.date_loss_10 == D0


def test_recent_series_is_as_of_today() -> None:
    c = salt_clock(READ, DATE_PALM, LIB, today=D0 + timedelta(90))
    assert c.stale is False and c.as_of == D0 + timedelta(90)


def test_old_series_is_anchored_at_last_reading_not_extrapolated_to_today() -> None:
    # Readings end in 2026-04; asking in 2042 must not project 16 years beyond the data.
    c = salt_clock(READ, DATE_PALM, LIB, today=date(2042, 4, 1))
    assert c.stale is True
    assert c.as_of == D0 + timedelta(90)          # the last reading
    assert c.data_age_days == (date(2042, 4, 1) - (D0 + timedelta(90))).days
    assert c.current_ecw == pytest.approx(3.3)    # value at the last reading, not 2042
    assert c.current_yield_pct == pytest.approx(96.58, abs=0.01)
    assert c.suggested_crops == ["barley"]        # horizon counted from the last reading


def test_old_survey_is_not_stitched_to_a_new_reading() -> None:
    # A 1991-2010 survey (with its own 12-year gap) plus one reading today: the trend comes from the survey
    # only, reported as of 2010, and today's single reading does not bend the line.
    survey = [(date(1991, 7, 1), 2.5), (date(1993, 7, 1), 3.46), (date(2005, 7, 1), 10.33), (date(2010, 7, 1), 15.36)]
    today = date(2026, 11, 16)
    c = salt_clock([*survey, (today, 6.0)], DATE_PALM, LIB, today=today)
    alone = salt_clock(survey, DATE_PALM, LIB, today=today)
    assert c.status == "ok" and c.stale is True and c.as_of == date(2010, 7, 1)
    assert c.current_ecw == pytest.approx(alone.current_ecw)
    assert c.n_readings == 4


def test_recent_run_wins_once_it_has_enough_readings() -> None:
    old = [(date(2005, 1, 1) + timedelta(days=30 * i), 9.0) for i in range(4)]
    c = salt_clock([*old, *READ], DATE_PALM, LIB, today=D0 + timedelta(90))
    assert c.stale is False and c.current_ecw == pytest.approx(3.3)


def test_crossing_inside_the_series_reports_when_it_happened() -> None:
    # Yearly series rising 1 dS/m per year from 3.0: date palm 10 % loss (ECw 4.52) is crossed ~1.5 years in.
    yearly = [(date(2000 + i, 7, 1), 3.0 + i) for i in range(5)]
    c = salt_clock(yearly, DATE_PALM, LIB, today=date(2026, 11, 16))
    assert c.stale and c.date_loss_10 is not None
    assert date(2001, 12, 1) <= c.date_loss_10 <= date(2002, 2, 1)


def test_yield_clamped() -> None:
    assert yield_pct(50, 2.5, 9.9) == 0.0
    assert yield_pct(1.0, 2.5, 9.9) == 100.0
