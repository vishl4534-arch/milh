from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Date, Float, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from milh.db import UTCDateTime, utcnow
from milh.models.base import Base, IdMixin


class IrrigationPlan(IdMixin, Base):
    __tablename__ = "irrigation_plans"
    __table_args__ = (UniqueConstraint("block_id", "day", name="uq_plan_block_day"),)
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    block_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("blocks.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date, index=True)
    slot: Mapped[str | None] = mapped_column(String(16))
    start_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    end_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    minutes: Mapped[int] = mapped_column(Integer)
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    gross_l: Mapped[float] = mapped_column(Float)
    fractions: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    ecw: Mapped[float | None] = mapped_column(Float)
    lr: Mapped[float | None] = mapped_column(Float)
    cap_exceeded: Mapped[bool] = mapped_column(Boolean, default=False)
    flush: Mapped[bool] = mapped_column(Boolean, default=False)
    habit_l: Mapped[float] = mapped_column(Float)
    saved_l: Mapped[float] = mapped_column(Float)
    saved_aed: Mapped[float] = mapped_column(Float)
    habit_yield_pct: Mapped[float | None] = mapped_column(Float)
    plan_yield_pct: Mapped[float | None] = mapped_column(Float)
    explanation: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    text: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    fallbacks: Mapped[list[str]] = mapped_column(JSON, default=list)
    skip_reason: Mapped[str | None] = mapped_column(String(16))
    computed_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class IrrigationEvent(IdMixin, Base):
    __tablename__ = "irrigation_events"
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("irrigation_plans.id", ondelete="SET NULL")
    )
    block_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("blocks.id", ondelete="CASCADE"), index=True
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("water_sources.id"))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    minutes: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(16))  # tap | voice | sensor
    confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))


class Announcement(IdMixin, Base):
    __tablename__ = "announcements"
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(40))
    scheduled_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    template_key: Mapped[str | None] = mapped_column(String(60))
    slots: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    text: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    audio: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="scheduled")
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("irrigation_plans.id", ondelete="SET NULL")
    )
    custom: Mapped[bool] = mapped_column(Boolean, default=False)
    untranslated: Mapped[list[str]] = mapped_column(JSON, default=list)


class Alert(IdMixin, Base):
    __tablename__ = "alerts"
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    severity: Mapped[str] = mapped_column(String(16))
    type: Mapped[str] = mapped_column(String(40))
    subject: Mapped[str | None] = mapped_column(String(80))
    slots: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    message: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
