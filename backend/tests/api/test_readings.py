import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from milh.models import Reading, SoilProfile, SoilTest
from tests.factories import add_member, bearer, make_config, make_farm, make_user


def _payload(farm_id, source_id, **kw):  # type: ignore[no-untyped-def]
    p = {"farm_id": str(farm_id), "source_id": str(source_id), "metric": "water_ec", "value": 3600,
         "unit": "µS/cm", "measured_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat()}
    p.update(kw)
    return p


def test_post_reading_as_user_manual_provenance(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, *_ = make_config(session, farm)
    session.commit()
    r = client.post("/api/v1/readings", json=_payload(farm.id, well.id), headers=bearer(owner))
    assert r.status_code == 200, r.text
    assert r.json()["results"][0]["status"] == "created"
    got = session.scalars(select(Reading)).one()
    assert got.source == "manual" and got.value == 3.6 and got.raw_unit == "µS/cm"


def test_device_key_provenance(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, *_ = make_config(session, farm)
    session.commit()
    dev = client.post(f"/api/v1/farms/{farm.id}/devices", json={"name": "probe", "kind": "sensor"},
                      headers=bearer(owner)).json()
    r = client.post("/api/v1/readings", json={"readings": [_payload(farm.id, well.id)]},
                    headers={"X-Api-Key": dev["api_key"]})
    assert r.status_code == 200, r.text
    assert session.scalars(select(Reading)).one().source == f"device:{dev['id']}"


def test_device_cannot_write_other_farm(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    other = make_farm(session, owner, name="Other")
    w2, *_ = make_config(session, other)
    session.commit()
    dev = client.post(f"/api/v1/farms/{farm.id}/devices", json={"name": "probe", "kind": "sensor"},
                      headers=bearer(owner)).json()
    r = client.post("/api/v1/readings", json=_payload(other.id, w2.id), headers={"X-Api-Key": dev["api_key"]})
    assert r.json()["results"][0]["error"] == "wrong_farm"


def test_no_credentials_401(client) -> None:
    assert client.post("/api/v1/readings", json={}).status_code == 401


def test_user_cannot_write_foreign_farm(client, session) -> None:
    a, b = make_user(session), make_user(session)
    farm_b = make_farm(session, b)
    wb, *_ = make_config(session, farm_b)
    session.commit()
    assert client.post("/api/v1/readings", json=_payload(farm_b.id, wb.id), headers=bearer(a)).status_code == 404


def test_list_readings_filtered(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, desal, *_ = make_config(session, farm)
    session.commit()
    batch = {"readings": [_payload(farm.id, well.id), _payload(farm.id, desal.id, value=400)]}
    client.post("/api/v1/readings", json=batch, headers=bearer(owner))
    url = f"/api/v1/farms/{farm.id}/readings?metric=water_ec&source_id={desal.id}"
    got = client.get(url, headers=bearer(owner)).json()
    assert [x["value"] for x in got] == [0.4]


def test_soil_test_ec1to5_converted_and_cited(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, block, _t = make_config(session, farm)
    session.add(SoilProfile(farm_id=farm.id, clay_pct=4, sand_pct=92, silt_pct=4, ph=8.1, texture_class="sand"))
    session.commit()
    r = client.post(f"/api/v1/farms/{farm.id}/soil-tests", json={
        "block_id": str(block.id), "tested_on": "2026-11-15", "ec_1to5": 0.2, "ph": 8.0}, headers=bearer(owner))
    assert r.status_code == 201, r.text
    t = session.scalars(select(SoilTest)).one()
    assert t.ece == 0.2 * 23.0
    assert "Slavich" in (t.note or "")
    assert farm.needs_replan


def test_soil_test_needs_ece_or_texture(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, block, _t = make_config(session, farm)
    session.commit()
    r = client.post(f"/api/v1/farms/{farm.id}/soil-tests", json={
        "block_id": str(block.id), "tested_on": "2026-11-15", "ec_1to5": 0.2}, headers=bearer(owner))
    assert r.status_code == 422


def test_worker_can_submit_soil_test_idempotent(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, block, _t = make_config(session, farm)
    worker = make_user(session, role="worker")
    add_member(session, farm, worker)
    session.commit()
    body = {"id": str(uuid.uuid4()), "block_id": str(block.id), "tested_on": "2026-11-15", "ece": 2.1}
    for _ in range(2):
        r = client.post(f"/api/v1/farms/{farm.id}/soil-tests", json=body, headers=bearer(worker, farm.id))
        assert r.status_code == 201
    assert len(session.scalars(select(SoilTest)).all()) == 1
