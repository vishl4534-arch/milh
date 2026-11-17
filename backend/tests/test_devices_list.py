"""The owner sees the farm's tablet and sensor keys by name and prefix, never the key itself."""
from tests.factories import bearer
from tests.planning.test_planner import _setup


def test_owner_lists_devices_without_keys(client, session) -> None:  # type: ignore[no-untyped-def]
    owner, farm, *_ = _setup(session)
    session.commit()
    h = bearer(owner)
    made = client.post(f"/api/v1/farms/{farm.id}/devices", headers=h,
                       json={"name": "Shed tablet", "kind": "kiosk"}).json()
    r = client.get(f"/api/v1/farms/{farm.id}/devices", headers=h)
    assert r.status_code == 200
    [d] = r.json()
    assert d["name"] == "Shed tablet" and d["kind"] == "kiosk" and made["api_key"].startswith(d["key_prefix"])
    assert "api_key" not in d and "api_key_hash" not in d
