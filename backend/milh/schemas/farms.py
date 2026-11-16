from __future__ import annotations

import uuid
from datetime import date
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator

HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"
Lang = Literal["en", "ur", "ar", "hi"]


def _default_langs() -> list[Lang]:
    return ["en", "ur"]


def _default_settings() -> FarmSettings:
    return FarmSettings()


class FarmSettings(BaseModel):
    """Every per-farm default from the spec. Stored as JSON on Farm.settings."""

    model_config = ConfigDict(extra="forbid")

    lr_cap: float = Field(0.3, gt=0, lt=0.9)
    rain_threshold_mm: float = Field(5.0, ge=0)
    flush_extra_mm: float = Field(20.0, ge=0, le=200)
    stale_ec_days: int = Field(14, ge=1)
    stale_soil_days: int = Field(60, ge=1)  # an older soil test no longer triggers a flush day
    earliest_start: str = Field("05:00", pattern=HHMM)
    morning_overrun_min: int = Field(120, ge=0, le=600)
    evening_offset_min: int = Field(30, ge=0, le=300)
    daily_plan_time: str = Field("03:00", pattern=HHMM)
    briefing_time: str = Field("05:15", pattern=HHMM)
    heat_c: float = Field(45.0, ge=30, le=60)
    midday_break: bool = True  # UAE outdoor work break, 15 Jun-15 Sep, 12:30-15:00
    tank_low_pct: float = Field(25.0, ge=0, le=100)
    ec_jump_ratio: float = Field(0.2, gt=0, le=5)
    tank_stale_h: int = Field(48, ge=1)
    device_offline_h: int = Field(24, ge=1)
    soil_near_ratio: float = Field(0.8, gt=0, le=1)
    soil_change_ratio: float = Field(0.15, gt=0, le=5)
    soil_ph_min: float = Field(6.0, ge=0, le=14)
    soil_ph_max: float = Field(8.5, ge=0, le=14)
    soil_short_days: int = Field(7, ge=1)
    soil_long_days: int = Field(14, ge=1)
    languages: list[Lang] = Field(default_factory=_default_langs, min_length=1)


def _check_tz(v: str) -> str:
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError) as e:
        raise ValueError(f"unknown timezone {v!r}") from e
    return v


class FarmIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    timezone: str = "Asia/Dubai"
    settings: FarmSettings = Field(default_factory=_default_settings)

    _tz = field_validator("timezone")(_check_tz)


class FarmPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    timezone: str | None = None
    settings: dict[str, object] | None = None  # partial update, validated against FarmSettings

    @field_validator("timezone")
    @classmethod
    def _tzv(cls, v: str | None) -> str | None:
        return _check_tz(v) if v is not None else None


class FarmOut(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    lat: float
    lon: float
    timezone: str
    settings: FarmSettings
    example_label: str | None


class SourceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["well", "desal", "tse", "municipal"]
    cost_per_m3: float = Field(ge=0)
    declared_ec: float | None = Field(default=None, ge=0, le=60)
    declared_ec_note: str | None = None
    tap_label: dict[str, str] = Field(default_factory=dict)
    tap_color: str = "#1d4ed8"
    position: int = 0


class SourcePatch(BaseModel):
    name: str | None = None
    cost_per_m3: float | None = Field(default=None, ge=0)
    declared_ec: float | None = Field(default=None, ge=0, le=60)
    declared_ec_note: str | None = None
    tap_label: dict[str, str] | None = None
    tap_color: str | None = None
    position: int | None = None


class SourceOut(SourceIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    farm_id: uuid.UUID


class BlockIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    area_m2: float = Field(gt=0)
    crop_key: str
    planting_date: date
    irrigation_type: str = "drip"
    flow_l_per_h: float = Field(gt=0)
    efficiency: float = Field(0.9, gt=0, le=1)
    habit_minutes: int = Field(ge=1, le=1440)
    habit_source_id: uuid.UUID
    soil_texture: str | None = None
    position: int = 0


class BlockPatch(BaseModel):
    name: str | None = None
    area_m2: float | None = Field(default=None, gt=0)
    crop_key: str | None = None
    planting_date: date | None = None
    flow_l_per_h: float | None = Field(default=None, gt=0)
    efficiency: float | None = Field(default=None, gt=0, le=1)
    habit_minutes: int | None = Field(default=None, ge=1, le=1440)
    habit_source_id: uuid.UUID | None = None
    soil_texture: str | None = None
    position: int | None = None


class BlockOut(BlockIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    farm_id: uuid.UUID


class TankIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    capacity_l: float = Field(gt=0)
    source_id: uuid.UUID | None = None


class TankOut(TankIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    farm_id: uuid.UUID


class CropOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    names: dict[str, str]
    perennial: bool
    kc_ini: float
    kc_mid: float
    kc_end: float
    stage_days: list[int]
    salt_a: float
    salt_b: float
    citation: str
