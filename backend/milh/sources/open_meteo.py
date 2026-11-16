"""Open-Meteo: live forecast (ET0, sunrise/sunset, heat) and historical weather. Free, no key.

Docs: https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/historical-weather-api
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.db import utcnow
from milh.models import Farm, WeatherSnapshot

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
SOURCE = "api:open-meteo"

_DAILY = ("temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,"
          "et0_fao_evapotranspiration,sunrise,sunset,shortwave_radiation_sum")


class WeatherUnavailable(Exception):
    pass


@dataclass(frozen=True)
class DailyWeather:
    day: date
    et0_mm: float
    rain_mm: float
    tmax_c: float
    tmin_c: float | None
    sunrise: datetime | None
    sunset: datetime | None
    rain_chance_pct: float | None = None


@dataclass(frozen=True)
class ForecastPayload:
    current: dict[str, Any]
    daily: list[DailyWeather]
    raw_daily: dict[str, Any]
    raw_hourly: dict[str, Any]


def _local(ts: str | None, tz: ZoneInfo) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts).replace(tzinfo=tz)


def parse_daily(daily: dict[str, Any], tz_name: str) -> list[DailyWeather]:
    tz = ZoneInfo(tz_name)
    out: list[DailyWeather] = []
    n = len(daily.get("time", []))

    def col(name: str, i: int) -> Any:
        values = daily.get(name)
        return values[i] if values is not None and i < len(values) else None

    for i in range(n):
        et0 = col("et0_fao_evapotranspiration", i)
        tmax = col("temperature_2m_max", i)
        if et0 is None or tmax is None:
            continue  # incomplete day: never invent a value
        out.append(DailyWeather(
            day=date.fromisoformat(daily["time"][i]),
            et0_mm=float(et0),
            rain_mm=float(col("precipitation_sum", i) or 0.0),
            tmax_c=float(tmax),
            tmin_c=col("temperature_2m_min", i),
            sunrise=_local(col("sunrise", i), tz),
            sunset=_local(col("sunset", i), tz),
            rain_chance_pct=col("precipitation_probability_max", i),
        ))
    return out


def fetch_forecast(lat: float, lon: float, tz_name: str, http: httpx.Client) -> ForecastPayload:
    params: dict[str, str | float | int] = {
        "latitude": lat, "longitude": lon, "timezone": tz_name, "forecast_days": 7,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation",
        "hourly": "temperature_2m,relative_humidity_2m,et0_fao_evapotranspiration",
        "daily": _DAILY,
    }
    try:
        r = http.get(FORECAST_URL, params=params, timeout=20)
        r.raise_for_status()
        data = r.json()
        daily_raw = data["daily"]
    except (httpx.HTTPError, ValueError, KeyError) as e:
        raise WeatherUnavailable(str(e)) from e
    return ForecastPayload(data.get("current", {}), parse_daily(daily_raw, tz_name), daily_raw,
                           data.get("hourly", {}))


def fetch_history(lat: float, lon: float, tz_name: str, start: date, end: date,
                  http: httpx.Client) -> list[DailyWeather]:
    params: dict[str, str | float] = {
        "latitude": lat, "longitude": lon, "timezone": tz_name,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": "et0_fao_evapotranspiration,precipitation_sum,temperature_2m_max,temperature_2m_min,sunrise,sunset",
    }
    try:
        r = http.get(ARCHIVE_URL, params=params, timeout=30)
        r.raise_for_status()
        return parse_daily(r.json()["daily"], tz_name)
    except (httpx.HTTPError, ValueError, KeyError) as e:
        raise WeatherUnavailable(str(e)) from e


def refresh_weather(session: Session, farm: Farm, http: httpx.Client) -> WeatherSnapshot:
    p = fetch_forecast(farm.lat, farm.lon, farm.timezone, http)
    snap = WeatherSnapshot(farm_id=farm.id, fetched_at=utcnow(), current=p.current, daily=p.raw_daily,
                           hourly=p.raw_hourly)
    session.add(snap)
    session.flush()
    return snap


def latest_snapshot(session: Session, farm_id: uuid.UUID) -> WeatherSnapshot | None:
    q = (select(WeatherSnapshot).where(WeatherSnapshot.farm_id == farm_id)
         .order_by(WeatherSnapshot.fetched_at.desc()).limit(1))
    return session.scalars(q).first()


def snapshot_age_h(snap: WeatherSnapshot, now: datetime | None = None) -> float:
    return ((now or utcnow()) - snap.fetched_at).total_seconds() / 3600.0


def latest_day_weather(
    session: Session, farm_id: uuid.UUID, day: date, now: datetime | None = None
) -> tuple[DailyWeather, float] | None:
    snap = latest_snapshot(session, farm_id)
    if snap is None:
        return None
    farm = session.get(Farm, farm_id)
    assert farm is not None
    for d in parse_daily(snap.daily, farm.timezone):
        if d.day == day:
            return d, snapshot_age_h(snap, now)
    return None
