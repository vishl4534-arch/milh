from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from milh.models import Farm, Reading, User
from milh.schemas.readings import ReadingIn


def test_reading_roundtrip(session) -> None:
    owner = User(name="Owner", role="owner", language="en")
    session.add(owner)
    session.flush()
    farm = Farm(owner_id=owner.id, name="F", lat=24.2, lon=55.7, timezone="Asia/Dubai")
    session.add(farm)
    session.flush()
    now = datetime(2026, 11, 16, 1, 10, tzinfo=UTC)
    session.add(
        Reading(
            farm_id=farm.id, metric="water_ec", value=3.6, unit="dS/m", raw_value=3600,
            raw_unit="µS/cm", measured_at=now, received_at=now, source="manual", flags=["jump"],
        )
    )
    session.commit()
    session.expunge_all()
    got = session.scalars(select(Reading)).one()
    assert got.flags == ["jump"]
    assert got.measured_at.tzinfo is not None
    assert got.measured_at == now


def test_reading_in_rejects_naive_datetime() -> None:
    with pytest.raises(ValidationError):
        ReadingIn(
            farm_id="00000000-0000-0000-0000-000000000001", metric="water_ec", value=3.6,
            unit="dS/m", measured_at="2026-11-16T05:10:00",
        )
