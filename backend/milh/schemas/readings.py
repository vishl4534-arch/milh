"""Canonical reading payload: the contract every injection channel uses (spec §7.6)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

Metric = Literal[
    "water_ec",
    "tank_level_pct",
    "tank_volume_l",
    "well_depth_m",
    "soil_ec_1to5",
    "soil_ece",
    "soil_moisture_vwc",
    "soil_ph",
    "flow_l",
    "irrigation_minutes",
]


class ReadingIn(BaseModel):
    reading_id: uuid.UUID | None = None
    farm_id: uuid.UUID
    block_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    tank_id: uuid.UUID | None = None
    metric: Metric
    value: float
    unit: str = Field(min_length=1, max_length=16)
    measured_at: AwareDatetime
    device_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=1000)


class ReadingBatchIn(BaseModel):
    readings: list[ReadingIn] = Field(min_length=1, max_length=1000)


class ReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    farm_id: uuid.UUID
    block_id: uuid.UUID | None
    source_id: uuid.UUID | None
    tank_id: uuid.UUID | None
    metric: str
    value: float
    unit: str
    raw_value: float
    raw_unit: str
    measured_at: datetime
    received_at: datetime
    source: str
    note: str | None
    flags: list[str]
