import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from milh.ingestion.service import Provenance, ingest
from milh.ingestion.validation import IngestError, normalise
from milh.models import Alert, Reading
from milh.schemas.readings import ReadingIn
from tests.factories import make_config, make_farm, make_user

NOW = datetime(2026, 11, 16, 2, 0, tzinfo=UTC)


def _r(farm_id, **kw):  # type: ignore[no-untyped-def]
    base = dict(farm_id=farm_id, metric="water_ec", value=3.6, unit="dS/m", measured_at=NOW - timedelta(minutes=5))
    base.update(kw)
    return ReadingIn(**base)


@pytest.fixture
def farm_setup(session):  # type: ignore[no-untyped-def]
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, desal, block, tank = make_config(session, farm)
    session.commit()
    return owner, farm, well, desal, block, tank


def test_normalise_us_cm_to_ds_m() -> None:
    r = _r(uuid.uuid4(), value=3600, unit="µS/cm")
    assert normalise(r) == pytest.approx((3.6, "dS/m"))


def test_normalise_m3_to_litres() -> None:
    assert normalise(_r(uuid.uuid4(), metric="tank_volume_l", value=2.5, unit="m3")) == (2500.0, "L")


def test_out_of_range_rejected() -> None:
    with pytest.raises(IngestError) as e:
        normalise(_r(uuid.uuid4(), value=75))
    assert e.value.code == "out_of_range"


def test_unknown_unit_rejected() -> None:
    with pytest.raises(IngestError) as e:
        normalise(_r(uuid.uuid4(), unit="ppm"))
    assert e.value.code == "unknown_unit"


def test_duplicate_reading_id_is_idempotent(session, farm_setup) -> None:
    owner, farm, well, *_ = farm_setup
    rid = uuid.uuid4()
    prov = Provenance("manual", owner.id, None)
    first = ingest(session, [_r(farm.id, reading_id=rid, source_id=well.id)], prov, now=NOW)
    second = ingest(session, [_r(farm.id, reading_id=rid, source_id=well.id)], prov, now=NOW)
    assert [x.status for x in first + second] == ["created", "duplicate"]
    assert session.scalar(select(func.count()).select_from(Reading)) == 1


def test_jump_flag_and_alert(session, farm_setup) -> None:
    owner, farm, well, *_ = farm_setup
    prov = Provenance("manual", owner.id, None)
    ingest(session, [_r(farm.id, source_id=well.id, value=3.0, measured_at=NOW - timedelta(days=7))], prov, now=NOW)
    res = ingest(session, [_r(farm.id, source_id=well.id, value=3.7)], prov, now=NOW)
    assert res[0].flags == ["jump"]
    alerts = session.scalars(select(Alert)).all()
    assert [a.type for a in alerts] == ["water_ec_jump"]


def test_tank_low_raises_alert(session, farm_setup) -> None:
    owner, farm, *_rest, tank = farm_setup
    ingest(session, [_r(farm.id, metric="tank_level_pct", value=20, unit="%", tank_id=tank.id)],
           Provenance("manual", owner.id, None), now=NOW)
    assert [a.type for a in session.scalars(select(Alert))] == ["tank_low"]


def test_future_timestamp_rejected(session, farm_setup) -> None:
    owner, farm, well, *_ = farm_setup
    res = ingest(session, [_r(farm.id, source_id=well.id, measured_at=NOW + timedelta(hours=1))],
                 Provenance("manual", owner.id, None), now=NOW)
    assert res[0].status == "rejected" and res[0].error == "future_timestamp"


def test_water_ec_needs_source(session, farm_setup) -> None:
    owner, farm, *_ = farm_setup
    res = ingest(session, [_r(farm.id)], Provenance("manual", owner.id, None), now=NOW)
    assert res[0].status == "rejected" and res[0].error == "missing_ref"


def test_reference_from_other_farm_rejected(session, farm_setup) -> None:
    owner, farm, *_ = farm_setup
    other = make_farm(session, owner, name="Other")
    w2, *_x = make_config(session, other)
    res = ingest(session, [_r(farm.id, source_id=w2.id)], Provenance("manual", owner.id, None), now=NOW)
    assert res[0].error == "bad_ref"


def test_ingest_sets_needs_replan(session, farm_setup) -> None:
    owner, farm, well, *_ = farm_setup
    farm.needs_replan = False
    ingest(session, [_r(farm.id, source_id=well.id)], Provenance("manual", owner.id, None), now=NOW)
    assert farm.needs_replan is True
