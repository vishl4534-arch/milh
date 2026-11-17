"""Demo accounts: seeded logins work on both sign-in paths, and the list is only served in DEMO_MODE."""
from pathlib import Path

import pytest

from milh.config import get_settings
from milh.demo import read_accounts, seed_demo, write_accounts
from milh.models import FarmMember
from tests.factories import make_farm, make_user


@pytest.fixture
def demo(session, tmp_path: Path, monkeypatch):  # type: ignore[no-untyped-def]
    owner = make_user(session, email="someone@example.test")
    farm = make_farm(session, owner)
    stale = make_user(session, role="worker", pin="1234")  # an older worker sharing a demo PIN
    session.add(FarmMember(farm_id=farm.id, user_id=stale.id))
    accounts = seed_demo(session, farm.id)
    session.commit()
    path = tmp_path / "demo_accounts.json"
    write_accounts(accounts, path)
    s = get_settings()
    monkeypatch.setattr(s, "demo_accounts_file", path)
    return farm, accounts


def test_owner_side_accounts_can_sign_in(client, demo) -> None:  # type: ignore[no-untyped-def]
    farm, accounts = demo
    assert [o.role for o in accounts.owners] == ["owner", "admin"]
    for o in accounts.owners:
        r = client.post("/api/v1/auth/login", json={"email": o.email, "password": o.password})
        assert r.status_code == 200, o.email
        farms = client.get("/api/v1/farms", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
        assert farm.id.hex in {f["id"].replace("-", "") for f in farms}


def test_each_worker_signs_in_as_themself_on_the_tablet(client, demo) -> None:  # type: ignore[no-untyped-def]
    _farm, accounts = demo
    for w in accounts.workers:
        r = client.post("/api/v1/auth/kiosk", json={"device_key": w.device_key, "pin": w.pin})
        assert r.status_code == 200, w.name
        me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
        assert me["name"] == w.name and me["language"] == w.language


def test_seeding_twice_refreshes_logins(session, demo, client) -> None:  # type: ignore[no-untyped-def]
    farm, first = demo
    second = seed_demo(session, farm.id)
    session.commit()
    a, b = first.owners[0], second.owners[0]
    old = client.post("/api/v1/auth/login", json={"email": a.email, "password": a.password})
    new = client.post("/api/v1/auth/login", json={"email": b.email, "password": b.password})
    assert old.status_code == 401 and new.status_code == 200


def test_endpoint_hidden_unless_demo_mode(client, demo, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    s = get_settings()
    monkeypatch.setattr(s, "demo_mode", False)
    assert client.get("/api/v1/demo/accounts").status_code == 404
    monkeypatch.setattr(s, "demo_mode", True)
    body = client.get("/api/v1/demo/accounts").json()
    assert len(body["owners"]) == 2 and len(body["workers"]) == 2
    assert read_accounts(s.demo_accounts_file) is not None
