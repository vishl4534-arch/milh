import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
import respx
from sqlalchemy import func, select

from milh.models import WeatherSnapshot
from milh.sources.open_meteo import (
    FORECAST_URL,
    WeatherUnavailable,
    fetch_forecast,
    latest_day_weather,
    refresh_weather,
)
from tests.factories import bearer, make_farm, make_user

FIXTURE = json.loads((Path(__file__).parents[1] / "fixtures" / "open_meteo_forecast.json").read_text())


@respx.mock
def test_fetch_forecast_parses_daily() -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=FIXTURE))
    with httpx.Client() as http:
        p = fetch_forecast(24.2075, 55.7447, "Asia/Dubai", http)
    assert len(p.daily) == 7
    assert p.daily[0].et0_mm == FIXTURE["daily"]["et0_fao_evapotranspiration"][0]
    assert p.daily[0].day == date.fromisoformat(FIXTURE["daily"]["time"][0])
    assert p.daily[0].sunrise is not None and p.daily[0].sunrise.utcoffset() == timedelta(hours=4)


@respx.mock
def test_refresh_stores_snapshot(session) -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=FIXTURE))
    farm = make_farm(session, make_user(session))
    with httpx.Client() as http:
        snap = refresh_weather(session, farm, http)
    assert snap.daily["time"] == FIXTURE["daily"]["time"]
    assert session.scalar(select(func.count()).select_from(WeatherSnapshot)) == 1


@respx.mock
def test_refresh_failure_keeps_previous_snapshot(session) -> None:
    farm = make_farm(session, make_user(session))
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=FIXTURE))
    with httpx.Client() as http:
        refresh_weather(session, farm, http)
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(500))
    with httpx.Client() as http, pytest.raises(WeatherUnavailable):
        refresh_weather(session, farm, http)
    assert session.scalar(select(func.count()).select_from(WeatherSnapshot)) == 1


@respx.mock
def test_latest_day_weather_reports_age(session) -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=FIXTURE))
    farm = make_farm(session, make_user(session))
    with httpx.Client() as http:
        snap = refresh_weather(session, farm, http)
    day = date.fromisoformat(FIXTURE["daily"]["time"][1])
    got = latest_day_weather(session, farm.id, day, now=snap.fetched_at + timedelta(hours=3))
    assert got is not None
    wx, age = got
    assert wx.day == day and age == pytest.approx(3.0)
    assert latest_day_weather(session, farm.id, date(2030, 1, 1)) is None


def test_weather_endpoint_empty_state(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    session.commit()
    r = client.get(f"/api/v1/farms/{farm.id}/weather", headers=bearer(owner))
    assert r.status_code == 200
    assert r.json() is None


@respx.mock
def test_weather_endpoint_after_refresh(client, session) -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=FIXTURE))
    owner = make_user(session)
    farm = make_farm(session, owner)
    session.commit()
    assert client.post(f"/api/v1/farms/{farm.id}/weather/refresh", headers=bearer(owner)).status_code == 200
    body = client.get(f"/api/v1/farms/{farm.id}/weather", headers=bearer(owner)).json()
    assert body["source"] == "api:open-meteo"
    assert len(body["daily"]) == 7
    assert datetime.fromisoformat(body["fetched_at"]) <= datetime.now(UTC)
