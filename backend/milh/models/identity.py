from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from milh.db import UTCDateTime
from milh.models.base import Base, IdMixin


class User(IdMixin, Base):
    __tablename__ = "users"
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(16))  # owner | worker | admin
    language: Mapped[str] = mapped_column(String(8), default="en")
    password_hash: Mapped[str | None] = mapped_column(String(255))
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))


class FarmMember(Base):
    __tablename__ = "farm_members"
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )


class Device(IdMixin, Base):
    __tablename__ = "devices"
    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("farms.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(16))  # kiosk | sensor | gateway
    api_key_hash: Mapped[str] = mapped_column(String(255))
    key_prefix: Mapped[str] = mapped_column(String(16), index=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
