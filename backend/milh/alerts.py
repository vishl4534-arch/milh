"""Alerts for the owner, some also spoken to the worker, plus staleness checks for data and devices."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from milh.db import utcnow
from milh.farm_config import get_farm_settings
from milh.models import Alert, Block, Device, Farm, Reading, Tank

# Alerts the worker can act on are also announced on the kiosk. The rest are owner-only.
WORKER_TYPES = frozenset({"tank_low", "water_ec_jump", "data_stale", "device_offline"})


def _message(session: Session, farm_id: uuid.UUID, type: str, slots: dict[str, Any]) -> dict[str, str]:
    from milh.announcements.service import render_all

    farm = session.get(Farm, farm_id)
    assert farm is not None
    try:
        return render_all(farm, type, slots)
    except KeyError:
        return {"en": type.replace("_", " ")}


def raise_alert(
    session: Session,
    farm_id: uuid.UUID,
    type: str,
    severity: str,
    slots: dict[str, Any],
    subject: str | None = None,
    now: datetime | None = None,
) -> Alert:
    """Create an alert, or refresh the unresolved one with the same type and subject (no repeat
    announcement). New worker-facing alerts are announced on the kiosk immediately."""
    now = now or utcnow()
    existing = session.scalars(select(Alert).where(
        Alert.farm_id == farm_id, Alert.type == type, Alert.subject == subject, Alert.resolved_at.is_(None),
    )).first()
    message = _message(session, farm_id, type, slots)
    if existing is not None:
        existing.slots, existing.message, existing.severity = slots, message, severity
        flag_modified(existing, "slots")
        flag_modified(existing, "message")
        session.flush()
        return existing
    alert = Alert(farm_id=farm_id, type=type, severity=severity, slots=slots, subject=subject, message=message)
    session.add(alert)
    session.flush()
    if type in WORKER_TYPES:
        from milh.announcements.service import announce_now

        announce_now(session, farm_id, type, slots, now)
    return alert


def resolve_alerts(session: Session, farm_id: uuid.UUID, type: str, subject: str | None,
                   now: datetime | None = None) -> int:
    """Close open alerts whose condition has cleared, so the next occurrence alerts (and is announced) again."""
    n = 0
    for a in session.scalars(select(Alert).where(Alert.farm_id == farm_id, Alert.type == type,
                                                 Alert.subject == subject, Alert.resolved_at.is_(None))):
        a.resolved_at = now or utcnow()
        n += 1
    if n:
        session.flush()
    return n


def check_staleness(session: Session, farm: Farm, now: datetime) -> list[Alert]:
    from zoneinfo import ZoneInfo

    from milh.planning.soil_due import soil_due_for_block

    s = get_farm_settings(farm)
    raised: list[Alert] = []
    for t in session.scalars(select(Tank).where(Tank.farm_id == farm.id)):
        last = session.scalars(select(Reading).where(
            Reading.tank_id == t.id, Reading.metric.in_(["tank_level_pct", "tank_volume_l"]))
            .order_by(Reading.measured_at.desc()).limit(1)).first()
        if last is None:
            continue  # never measured: the kiosk shows an empty state instead
        hours = (now - last.measured_at).total_seconds() / 3600
        if hours > s.tank_stale_h:
            raised.append(raise_alert(session, farm.id, "data_stale", "warning",
                                      {"item": t.name, "hours": int(hours)}, subject=f"tank:{t.id}", now=now))
    for d in session.scalars(select(Device).where(Device.farm_id == farm.id, Device.last_seen_at.is_not(None))):
        assert d.last_seen_at is not None
        hours = (now - d.last_seen_at).total_seconds() / 3600
        if hours > s.device_offline_h:
            raised.append(raise_alert(session, farm.id, "device_offline", "warning",
                                      {"device": d.name, "hours": int(hours)}, subject=f"device:{d.id}", now=now))
    today = now.astimezone(ZoneInfo(farm.timezone)).date()
    for b in session.scalars(select(Block).where(Block.farm_id == farm.id)):
        due = soil_due_for_block(session, b, s)
        if due is not None and (today - due[0]).days >= 2:
            raised.append(raise_alert(session, farm.id, "soil_test_overdue", "info",
                                      {"block": b.name, "days": (today - due[0]).days}, subject=f"block:{b.id}",
                                      now=now))
    return raised
