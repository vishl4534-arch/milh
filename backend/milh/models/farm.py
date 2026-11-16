from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import JSON, Boolean, Date, Float, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from milh.models.base import Base, IdMixin


class Farm(IdMixin, Base):
    __tablename__ = "farms"
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(120))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Dubai")
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    example_label: Mapped[str | None] = mapped_column(String(200))
    needs_replan: Mapped[bool] = mapped_column(Boolean, default=False)


class Crop(Base):
    __tablename__ = "crops"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    names: Mapped[dict[str, str]] = mapped_column(JSON)
    perennial: Mapped[bool] = mapped_column(Boolean, default=False)
    kc_ini: Mapped[float] = mapped_column(Float)
    kc_mid: Mapped[float] = mapped_column(Float)
    kc_end: Mapped[float] = mapped_column(Float)
    stage_days: Mapped[list[int]] = mapped_column(JSON)
    salt_a: Mapped[float] = mapped_column(Float)
    salt_b: Mapped[float] = mapped_column(Float)
    citation: Mapped[str] = mapped_column(String(500))


class WaterSource(IdMixin, Base):
    __tablename__ = "water_sources"
    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("farms.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(16))  # well | desal | tse | municipal
    cost_per_m3: Mapped[float] = mapped_column(Float)
    declared_ec: Mapped[float | None] = mapped_column(Float)
    declared_ec_note: Mapped[str | None] = mapped_column(String(500))
    tap_label: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    tap_color: Mapped[str] = mapped_column(String(16), default="#1d4ed8")
    position: Mapped[int] = mapped_column(Integer, default=0)


class Block(IdMixin, Base):
    __tablename__ = "blocks"
    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("farms.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    area_m2: Mapped[float] = mapped_column(Float)
    crop_key: Mapped[str] = mapped_column(String(40), ForeignKey("crops.key"))
    planting_date: Mapped[date] = mapped_column(Date)
    irrigation_type: Mapped[str] = mapped_column(String(16), default="drip")
    flow_l_per_h: Mapped[float] = mapped_column(Float)
    efficiency: Mapped[float] = mapped_column(Float, default=0.9)
    habit_minutes: Mapped[int] = mapped_column(Integer)
    habit_source_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("water_sources.id"))
    soil_texture: Mapped[str | None] = mapped_column(String(32))
    position: Mapped[int] = mapped_column(Integer, default=0)


class Tank(IdMixin, Base):
    __tablename__ = "tanks"
    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("farms.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    capacity_l: Mapped[float] = mapped_column(Float)
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("water_sources.id"))
