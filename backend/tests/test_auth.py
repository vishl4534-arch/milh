from sqlalchemy import select

from milh.models import Device
from tests.factories import add_member, bearer, make_farm, make_user


def test_login_ok(client, session) -> None:
    u = make_user(session, email="o@example.test", password="secret-pw")
    session.commit()
    r = client.post("/api/v1/auth/login", json={"email": "o@example.test", "password": "secret-pw"})
    assert r.status_code == 200
    assert r.json()["access_token"]
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["id"] == str(u.id)


def test_login_bad_password_401(client, session) -> None:
    make_user(session, email="o@example.test", password="secret-pw")
    session.commit()
    r = client.post("/api/v1/auth/login", json={"email": "o@example.test", "password": "nope"})
    assert r.status_code == 401


def test_device_api_key_shown_once_and_hashed(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    session.commit()
    r = client.post(f"/api/v1/farms/{farm.id}/devices", json={"name": "Kiosk", "kind": "kiosk"},
                    headers=bearer(owner))
    assert r.status_code == 201
    key = r.json()["api_key"]
    dev = session.scalars(select(Device)).one()
    assert dev.api_key_hash != key and key not in dev.api_key_hash


def test_kiosk_pin_login_scoped_to_device_farm(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    worker = make_user(session, role="worker", password=None, pin="4321")
    add_member(session, farm, worker)
    session.commit()
    key = client.post(f"/api/v1/farms/{farm.id}/devices", json={"name": "Kiosk", "kind": "kiosk"},
                      headers=bearer(owner)).json()["api_key"]
    bad = client.post("/api/v1/auth/kiosk", json={"device_key": key, "pin": "0000"})
    assert bad.status_code == 401
    r = client.post("/api/v1/auth/kiosk", json={"device_key": key, "pin": "4321"})
    assert r.status_code == 200
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["role"] == "worker"
    assert me["farm_id"] == str(farm.id)


def test_worker_cannot_patch_farm_403(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    worker = make_user(session, role="worker")
    add_member(session, farm, worker)
    session.commit()
    r = client.patch(f"/api/v1/farms/{farm.id}", json={"name": "x"}, headers=bearer(worker, farm.id))
    assert r.status_code == 403


def test_owner_cannot_read_other_owners_farm_404(client, session) -> None:
    a = make_user(session)
    b = make_user(session)
    farm_b = make_farm(session, b)
    session.commit()
    assert client.get(f"/api/v1/farms/{farm_b.id}", headers=bearer(a)).status_code == 404


def test_missing_token_401(client) -> None:
    assert client.get("/api/v1/me").status_code == 401
