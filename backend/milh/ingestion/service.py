"""The one ingestion path: validation, unit normalisation, provenance, idempotency, side effects."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from milh import alerts
from milh.db import utcnow
from milh.farm_config import get_farm_settings
from milh.ingestion.validation import IngestError, normalise
from milh.models import Block, Farm, Reading, Tank, WaterSource
from milh.schemas.readings import ReadingIn

FUTURE_TOLERANCE = timedelta(minutes=10)
LIVE_ALERT_WINDOW = timedelta(days=7)
REPLAN_METRICS = {"water_ec", "soil_ec_1to5", "soil_ece", "soil_ph", "soil_moisture_vwc"}


@dataclass(frozen=True)
class Provenance:
    source: str  # manual | csv_import | device:<id> | gemini_extract
    user_id: uuid.UUID | None
    device_id: uuid.UUID | None
    device_farm_id: uuid.UUID | None = None


@dataclass
class IngestResult:
    reading_id: uuid.UUID | None
    status: Literal["created", "duplicate", "rejected"]
    error: str | None = None
    message: str | None = None
    flags: list[str] = field(default_factory=list)


def _check_refs(session: Session, r: ReadingIn) -> None:
    refs: list[tuple[str, uuid.UUID | None, uuid.UUID | None]] = []
    if r.block_id is not None:
        b = session.get(Block, r.block_id)
        refs.append(("Block", r.block_id, b.farm_id if b else None))
    if r.source_id is not None:
        w = session.get(WaterSource, r.source_id)
        refs.append(("WaterSource", r.source_id, w.farm_id if w else None))
    if r.tank_id is not None:
        t = session.get(Tank, r.tank_id)
        refs.append(("Tank", r.tank_id, t.farm_id if t else None))
    for name, ref, owner_farm in refs:
        if owner_farm != r.farm_id:
            raise IngestError("bad_ref", f"{name} {ref} is not part of farm {r.farm_id}")
    if r.metric == "water_ec" and r.source_id is None:
        raise IngestError("missing_ref", "water_ec needs source_id (which water source was measured)")
    if r.metric.startswith("tank_") and r.tank_id is None:
        raise IngestError("missing_ref", f"{r.metric} needs tank_id")
    if r.metric.startswith("soil_") and r.block_id is None:
        raise IngestError("missing_ref", f"{r.metric} needs block_id")


def validate(session: Session, r: ReadingIn, prov: Provenance, now: datetime) -> tuple[float, str]:
    """Raise IngestError if the reading cannot be stored; return the normalised (value, unit)."""
    if prov.device_farm_id is not None and prov.device_farm_id != r.farm_id:
        raise IngestError("wrong_farm", "device is registered to a different farm")
    if session.get(Farm, r.farm_id) is None:
        raise IngestError("bad_ref", "unknown farm")
    if r.measured_at > now + FUTURE_TOLERANCE:
        raise IngestError("future_timestamp", "measured_at is in the future")
    _check_refs(session, r)
    return normalise(r)


def _side_effects(session: Session, farm: Farm, reading: Reading, now: datetime) -> None:
    s = get_farm_settings(farm)
    # Alerts are about today: importing history (a 1991-2010 well series, an old lab report) must not
    # raise or clear live alarms. The reading itself is still stored and flagged.
    live = reading.measured_at >= now - LIVE_ALERT_WINDOW
    if reading.metric in REPLAN_METRICS:
        farm.needs_replan = True
    if reading.metric == "water_ec" and reading.source_id is not None:
        prev = session.scalars(
            select(Reading)
            .where(Reading.source_id == reading.source_id, Reading.metric == "water_ec",
                   Reading.measured_at < reading.measured_at, Reading.id != reading.id)
            .order_by(Reading.measured_at.desc())
            .limit(1)
        ).first()
        if prev is not None and prev.value > 0 and abs(reading.value - prev.value) / prev.value > s.ec_jump_ratio:
            reading.flags = [*reading.flags, "jump"]
            src = session.get(WaterSource, reading.source_id)
            if live:
                alerts.raise_alert(session, farm.id, "water_ec_jump", "warning",
                                   {"source": src.name if src else "", "old": round(prev.value, 2),
                                    "new": round(reading.value, 2)}, subject=str(reading.source_id))
    if not live:
        return
    if reading.tank_id is not None:
        alerts.resolve_alerts(session, farm.id, "data_stale", f"tank:{reading.tank_id}")
    if reading.submitted_by_device_id is not None:
        alerts.resolve_alerts(session, farm.id, "device_offline", f"device:{reading.submitted_by_device_id}")
    if reading.metric == "tank_level_pct" and reading.tank_id is not None:
        if reading.value < s.tank_low_pct:
            tank = session.get(Tank, reading.tank_id)
            alerts.raise_alert(session, farm.id, "tank_low", "warning",
                               {"tank": tank.name if tank else "", "pct": round(reading.value)},
                               subject=str(reading.tank_id))
        else:
            alerts.resolve_alerts(session, farm.id, "tank_low", str(reading.tank_id))


def ingest(
    session: Session, readings: list[ReadingIn], prov: Provenance, now: datetime | None = None
) -> list[IngestResult]:
    now = now or utcnow()
    results: list[IngestResult] = []
    for r in readings:
        if r.reading_id is not None:
            existing = session.get(Reading, r.reading_id)
            if existing is not None:
                if existing.farm_id == r.farm_id:
                    results.append(IngestResult(r.reading_id, "duplicate", flags=list(existing.flags)))
                else:
                    results.append(IngestResult(r.reading_id, "rejected", "id_conflict", "reading_id already used"))
                continue
        try:
            value, unit = validate(session, r, prov, now)
        except IngestError as e:
            results.append(IngestResult(r.reading_id, "rejected", e.code, e.message))
            continue
        reading = Reading(
            id=r.reading_id or uuid.uuid4(), farm_id=r.farm_id, block_id=r.block_id, source_id=r.source_id,
            tank_id=r.tank_id, metric=r.metric, value=value, unit=unit, raw_value=r.value, raw_unit=r.unit,
            measured_at=r.measured_at, received_at=now, source=prov.source,
            submitted_by_user_id=prov.user_id, submitted_by_device_id=prov.device_id, note=r.note, flags=[],
        )
        session.add(reading)
        session.flush()
        farm = session.get(Farm, r.farm_id)
        assert farm is not None
        _side_effects(session, farm, reading, now)
        session.flush()
        results.append(IngestResult(reading.id, "created", flags=list(reading.flags)))
    return results
