from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from milh.auth import Principal, current_principal, farm_for, owned_farm, require_role
from milh.db import get_session
from milh.models import SoilProfile
from milh.sources.open_meteo import (
    SOURCE,
    WeatherUnavailable,
    latest_snapshot,
    parse_daily,
    refresh_weather,
    snapshot_age_h,
)
from milh.sources.soilgrids import SoilUnavailable, refresh_soil_profile

router = APIRouter(prefix="/api/v1", tags=["weather"])
DB = Annotated[Session, Depends(get_session)]


class DailyOut(BaseModel):
    day: date
    et0_mm: float
    rain_mm: float
    tmax_c: float
    tmin_c: float | None
    sunrise: datetime | None
    sunset: datetime | None
    rain_chance_pct: float | None


class WeatherOut(BaseModel):
    current: dict[str, Any]
    daily: list[DailyOut]
    fetched_at: datetime
    age_h: float
    source: str


def http_client() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": "milh-farm-platform/0.1"})


def weather_out(session: Session, farm_id: uuid.UUID, tz: str) -> WeatherOut | None:
    snap = latest_snapshot(session, farm_id)
    if snap is None:
        return None
    daily = [DailyOut(**d.__dict__) for d in parse_daily(snap.daily, tz)]
    return WeatherOut(current=snap.current, daily=daily, fetched_at=snap.fetched_at,
                      age_h=round(snapshot_age_h(snap), 2), source=SOURCE)


@router.get("/farms/{farm_id}/weather", response_model=WeatherOut | None)
def get_weather(farm_id: uuid.UUID, p: Annotated[Principal, Depends(current_principal)],
                session: DB) -> WeatherOut | None:
    farm = farm_for(session, p, farm_id)
    return weather_out(session, farm.id, farm.timezone)


@router.post("/farms/{farm_id}/weather/refresh", response_model=WeatherOut | None)
def post_refresh(farm_id: uuid.UUID, p: Annotated[Principal, Depends(require_role("owner", "admin"))],
                 session: DB) -> WeatherOut | None:
    farm = owned_farm(session, p, farm_id)
    try:
        with http_client() as http:
            refresh_weather(session, farm, http)
    except WeatherUnavailable as e:
        raise HTTPException(503, f"Open-Meteo unavailable: {e}") from e
    farm.needs_replan = True
    session.commit()
    return weather_out(session, farm.id, farm.timezone)


class SoilProfileOut(BaseModel):
    clay_pct: float
    sand_pct: float
    silt_pct: float
    ph: float | None
    texture_class: str
    fetched_at: datetime
    source: str


def _profile_out(prof: SoilProfile | None) -> SoilProfileOut | None:
    if prof is None:
        return None
    return SoilProfileOut(clay_pct=prof.clay_pct, sand_pct=prof.sand_pct, silt_pct=prof.silt_pct, ph=prof.ph,
                          texture_class=prof.texture_class, fetched_at=prof.fetched_at, source=prof.source)


@router.get("/farms/{farm_id}/soil-profile", response_model=SoilProfileOut | None)
def get_soil_profile(farm_id: uuid.UUID, p: Annotated[Principal, Depends(current_principal)],
                     session: DB) -> SoilProfileOut | None:
    farm = farm_for(session, p, farm_id)
    return _profile_out(session.get(SoilProfile, farm.id))


@router.post("/farms/{farm_id}/soil-profile/refresh", response_model=SoilProfileOut | None)
def refresh_profile(farm_id: uuid.UUID, p: Annotated[Principal, Depends(require_role("owner", "admin"))],
                    session: DB) -> SoilProfileOut | None:
    farm = owned_farm(session, p, farm_id)
    try:
        with http_client() as http:
            prof = refresh_soil_profile(session, farm, http)
    except SoilUnavailable as e:
        raise HTTPException(503, f"SoilGrids unavailable: {e}") from e
    session.commit()
    return _profile_out(prof)
