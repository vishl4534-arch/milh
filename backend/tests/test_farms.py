import json
from pathlib import Path

from sqlalchemy import func, select

from milh.farm_config import load_farm_config, seed_crops
from milh.models import Block, Reading, WaterSource
from tests.factories import bearer, ensure_tomato, make_farm, make_user

DATA = Path(__file__).resolve().parents[2] / "data"


def test_create_farm_with_default_settings(client, session) -> None:
    owner = make_user(session)
    session.commit()
    r = client.post("/api/v1/farms", json={"name": "Al Ain", "lat": 24.2, "lon": 55.7,
                                           "timezone": "Asia/Dubai"}, headers=bearer(owner))
    assert r.status_code == 201, r.text
    s = r.json()["settings"]
    assert s["lr_cap"] == 0.3
    assert s["earliest_start"] == "05:00"
    assert s["languages"] == ["en", "ur"]
    assert client.get("/api/v1/farms", headers=bearer(owner)).json()[0]["name"] == "Al Ain"


def test_patch_settings_validates(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    session.commit()
    r = client.patch(f"/api/v1/farms/{farm.id}", json={"settings": {"lr_cap": 1.5}}, headers=bearer(owner))
    assert r.status_code == 422
    ok = client.patch(f"/api/v1/farms/{farm.id}", json={"settings": {"lr_cap": 0.25}}, headers=bearer(owner))
    assert ok.status_code == 200
    assert ok.json()["settings"]["lr_cap"] == 0.25
    assert ok.json()["settings"]["briefing_time"] == "05:15"


def test_bad_timezone_rejected(client, session) -> None:
    owner = make_user(session)
    session.commit()
    r = client.post("/api/v1/farms", json={"name": "X", "lat": 1, "lon": 1, "timezone": "Mars/Base"},
                    headers=bearer(owner))
    assert r.status_code == 422


def test_block_requires_known_crop(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    ensure_tomato(session)
    session.commit()
    src = client.post(f"/api/v1/farms/{farm.id}/sources", json={"name": "Well", "kind": "well",
                      "cost_per_m3": 0.5, "tap_label": {"en": "blue tap"}}, headers=bearer(owner)).json()
    base = {"name": "B1", "area_m2": 1000, "planting_date": "2026-10-01", "flow_l_per_h": 15000,
            "habit_minutes": 60, "habit_source_id": src["id"]}
    bad = client.post(f"/api/v1/farms/{farm.id}/blocks", json={**base, "crop_key": "kiwi"}, headers=bearer(owner))
    assert bad.status_code == 422
    ok = client.post(f"/api/v1/farms/{farm.id}/blocks", json={**base, "crop_key": "tomato"}, headers=bearer(owner))
    assert ok.status_code == 201, ok.text


def test_block_habit_source_must_belong_to_farm(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    other = make_farm(session, owner, name="Other")
    ensure_tomato(session)
    foreign = WaterSource(farm_id=other.id, name="W", kind="well", cost_per_m3=1, tap_label={})
    session.add(foreign)
    session.commit()
    r = client.post(f"/api/v1/farms/{farm.id}/blocks", json={
        "name": "B1", "area_m2": 1000, "crop_key": "tomato", "planting_date": "2026-10-01",
        "flow_l_per_h": 15000, "habit_minutes": 60, "habit_source_id": str(foreign.id)}, headers=bearer(owner))
    assert r.status_code == 422


def test_crops_endpoint_lists_library(client, session) -> None:
    owner = make_user(session)
    seed_crops(session, DATA / "crops.json")
    session.commit()
    keys = {c["key"] for c in client.get("/api/v1/crops", headers=bearer(owner)).json()}
    assert {"tomato", "date_palm", "barley", "cucumber"} <= keys


def test_load_farm_cli_creates_no_readings(session) -> None:
    owner = make_user(session)
    seed_crops(session, DATA / "crops.json")
    farm = load_farm_config(session, json.loads((DATA / "demo_farm.json").read_text(encoding="utf-8")), owner)
    session.commit()
    assert farm.example_label
    assert session.scalar(select(func.count()).select_from(Block)) >= 3
    assert session.scalar(select(func.count()).select_from(Reading)) == 0
