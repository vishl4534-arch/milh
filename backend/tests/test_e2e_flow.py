"""The whole loop through the API only: setup -> readings -> plan -> announcements -> DONE -> report."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import respx

from milh.farm_config import load_farm_config, seed_crops
from milh.sources.open_meteo import FORECAST_URL
from tests.factories import add_member, bearer, make_user

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "open_meteo_forecast.json").read_text())


@respx.mock
def test_full_loop(client, session) -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=FIXTURE))
    owner = make_user(session)
    seed_crops(session, ROOT / "data" / "crops.json")
    farm = load_farm_config(session, json.loads((ROOT / "data" / "demo_farm.json").read_text(encoding="utf-8")), owner)
    worker = make_user(session, role="worker", pin="1234", language="ur")
    add_member(session, farm, worker)
    session.commit()
    h = bearer(owner)

    assert client.post(f"/api/v1/farms/{farm.id}/weather/refresh", headers=h).status_code == 200
    sources = client.get(f"/api/v1/farms/{farm.id}/sources", headers=h).json()
    well, desal = sources[0]["id"], sources[1]["id"]
    when = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    batch = {"readings": [
        {"farm_id": str(farm.id), "source_id": well, "metric": "water_ec", "value": 3.6, "unit": "dS/m",
         "measured_at": when, "note": "e2e test value"},
        {"farm_id": str(farm.id), "source_id": desal, "metric": "water_ec", "value": 400, "unit": "µS/cm",
         "measured_at": when, "note": "e2e test value"},
    ]}
    assert [r["status"] for r in client.post("/api/v1/readings", json=batch, headers=h).json()["results"]] == [
        "created", "created"]
    blocks = client.get(f"/api/v1/farms/{farm.id}/blocks", headers=h).json()
    soil = {"block_id": blocks[1]["id"], "tested_on": (datetime.now(UTC) - timedelta(days=2)).date().isoformat(),
            "ece": 2.1, "ph": 7.9}
    assert client.post(f"/api/v1/farms/{farm.id}/soil-tests", json=soil, headers=h).status_code == 201

    plans = client.post(f"/api/v1/farms/{farm.id}/plans/recompute", headers=h).json()
    assert len(plans) == 3
    for p in plans:
        assert p["text"]["en"] and p["text"]["ur"]
        assert "no_water_ec" not in p["fallbacks"]

    kiosk = client.get(f"/api/v1/kiosk/bundle?farm_id={farm.id}", headers=bearer(worker, farm.id)).json()
    types = {a["type"] for a in kiosk["announcements"]}
    assert "daily_briefing" in types
    assert kiosk["blocks"][1]["next_test_due"] is not None

    run = next(r for r in kiosk["runs"] if r["steps"])
    done = {"id": str(uuid.uuid4()), "plan_id": run["plan_id"], "block_id": run["block_id"],
            "started_at": run["start"], "minutes": run["minutes"], "method": "tap"}
    assert client.post("/api/v1/irrigation-events", json=done, headers=bearer(worker, farm.id)).status_code == 201

    day = kiosk["day"]
    report = client.get(f"/api/v1/farms/{farm.id}/reports/water?start={day}&end={day}", headers=h).json()
    assert report["totals"]["actual_l"] > 0
    assert report["totals"]["habit_l"] > 0
