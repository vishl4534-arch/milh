import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from milh.auth import hash_secret
from milh.ingestion.mqtt_bridge import handle_message
from milh.models import Device, Reading
from tests.factories import make_config, make_farm, make_user


def _setup(session):  # type: ignore[no-untyped-def]
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, _b, tank = make_config(session, farm)
    key = "abcd1234.secret-value"
    dev = Device(farm_id=farm.id, name="Tank probe", kind="sensor", api_key_hash=hash_secret(key),
                 key_prefix="abcd1234")
    session.add(dev)
    session.commit()
    return farm, tank, dev, key


def _payload(key, tank_id, **kw):  # type: ignore[no-untyped-def]
    p = {"key": key, "tank_id": str(tank_id), "value": 61, "unit": "%",
         "measured_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat()}
    p.update(kw)
    return json.dumps(p).encode()


def test_topic_parsed_and_ingested(session) -> None:
    farm, tank, dev, key = _setup(session)
    r = handle_message(session, f"milh/{farm.id}/{dev.id}/tank_level_pct", _payload(key, tank.id))
    assert r.status == "created"
    got = session.scalars(select(Reading)).one()
    assert got.source == f"device:{dev.id}" and got.value == 61 and got.tank_id == tank.id


def test_wrong_farm_rejected(session) -> None:
    farm, tank, dev, key = _setup(session)
    other = make_farm(session, make_user(session), name="Other")
    r = handle_message(session, f"milh/{other.id}/{dev.id}/tank_level_pct", _payload(key, tank.id))
    assert r.status == "rejected"
    assert session.scalars(select(Reading)).all() == []


def test_wrong_key_rejected(session) -> None:
    farm, tank, dev, _key = _setup(session)
    r = handle_message(session, f"milh/{farm.id}/{dev.id}/tank_level_pct", _payload("abcd1234.wrong", tank.id))
    assert r.status == "rejected" and r.error == "bad_key"


def test_bad_json_rejected_without_crash(session) -> None:
    farm, _tank, dev, _key = _setup(session)
    r = handle_message(session, f"milh/{farm.id}/{dev.id}/tank_level_pct", b"{not json")
    assert r.status == "rejected" and r.error == "bad_payload"


def test_bad_topic_rejected(session) -> None:
    r = handle_message(session, "milh/only-two", b"{}")
    assert r.status == "rejected" and r.error == "bad_topic"
