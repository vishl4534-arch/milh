from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, Float, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from milh.db import UTCDateTime, utcnow
from milh.models.base import Base, IdMixin


class Reading(IdMixin, Base):
    """One measured value. `id` may be client-supplied and doubles as the idempotency key."""

    __tablename__ = "readings"
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    block_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("blocks.id", ondelete="CASCADE"))
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("water_sources.id", ondelete="CASCADE")
    )
    tank_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("tanks.id", ondelete="CASCADE"))
    metric: Mapped[str] = mapped_column(String(32), index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(16))
    raw_value: Mapped[float] = mapped_column(Float)
    raw_unit: Mapped[str] = mapped_column(String(16))
    measured_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    received_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    source: Mapped[str] = mapped_column(String(64))
    submitted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    submitted_by_device_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("devices.id"))
    note: Mapped[str | None] = mapped_column(String(1000))
    flags: Mapped[list[str]] = mapped_column(JSON, default=list)


class SoilTest(IdMixin, Base):
    __tablename__ = "soil_tests"
    block_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("blocks.id", ondelete="CASCADE"), index=True
    )
    tested_on: Mapped[date] = mapped_column(Date)
    ec_1to5: Mapped[float | None] = mapped_column(Float)
    ece: Mapped[float] = mapped_column(Float)
    moisture_vwc: Mapped[float | None] = mapped_column(Float)
    ph: Mapped[float | None] = mapped_column(Float)
    lab: Mapped[str | None] = mapped_column(String(200))
    attachment_path: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(64))
    submitted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(String(1000))


class WeatherSnapshot(IdMixin, Base):
    __tablename__ = "weather_snapshots"
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    current: Mapped[dict[str, Any]] = mapped_column(JSON)
    daily: Mapped[dict[str, Any]] = mapped_column(JSON)
    hourly: Mapped[dict[str, Any]] = mapped_column(JSON)


class SoilProfile(Base):
    __tablename__ = "soil_profiles"
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), primary_key=True
    )
    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    clay_pct: Mapped[float] = mapped_column(Float)
    sand_pct: Mapped[float] = mapped_column(Float)
    silt_pct: Mapped[float] = mapped_column(Float)
    ph: Mapped[float | None] = mapped_column(Float)
    texture_class: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(32), default="api:soilgrids")
