from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SoilTestIn(BaseModel):
    id: uuid.UUID | None = None
    block_id: uuid.UUID
    tested_on: date
    ec_1to5: float | None = Field(default=None, ge=0, le=50)
    ece: float | None = Field(default=None, ge=0, le=100)
    moisture_vwc: float | None = Field(default=None, ge=0, le=100)
    ph: float | None = Field(default=None, ge=0, le=14)
    lab: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=1000)
    attachment_path: str | None = None

    @model_validator(mode="after")
    def _one_ec(self) -> SoilTestIn:
        if self.ece is None and self.ec_1to5 is None:
            raise ValueError("give ece or ec_1to5")
        return self


class SoilTestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    block_id: uuid.UUID
    tested_on: date
    ec_1to5: float | None
    ece: float
    moisture_vwc: float | None
    ph: float | None
    lab: str | None
    note: str | None
    source: str
    attachment_path: str | None
