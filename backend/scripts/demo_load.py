"""Load the cited published data into a running Milh API and build today's plan.

Usage (API must be running):
    python scripts/demo_load.py --email owner@milh.test --password ... [--well-ec 6.0] [--desal-ec 0.5]

What it loads:
- data/published/batinah_well_T52_water_ec.csv  (well salinity 1991-2010, cited) -> feeds the salt clock
- data/published/batinah_soil_tests.csv         (farm soil ECe 1993 and 2020, cited)
- Today's water EC for each source. These are NOT measurements: they are demo stand-ins, labelled as such in the
  reading's note. Replace them on stage with a real meter reading (Owner -> Add data, or the tablet number pad).
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
from pathlib import Path

import httpx

DATA = Path(__file__).resolve().parents[2] / "data" / "published"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--well-ec", type=float, default=6.0)
    ap.add_argument("--desal-ec", type=float, default=0.5)
    ap.add_argument("--replan-only", action="store_true", help="skip loading data; just rebuild today's plan")
    a = ap.parse_args()

    c = httpx.Client(base_url=a.api, timeout=60)
    tok = c.post("/api/v1/auth/login", json={"email": a.email, "password": a.password}).raise_for_status().json()
    c.headers["Authorization"] = f"Bearer {tok['access_token']}"
    farm = c.get("/api/v1/farms").raise_for_status().json()[0]
    fid = farm["id"]
    print("Farm:", farm["name"], fid)
    if not a.replan_only:
        load(c, fid, a.well_ec, a.desal_ec)

    print("Weather:", c.post(f"/api/v1/farms/{fid}/weather/refresh").status_code)
    print("Soil profile:", c.post(f"/api/v1/farms/{fid}/soil-profile/refresh").status_code)
    plans = c.post(f"/api/v1/farms/{fid}/plans/recompute").raise_for_status().json()
    for p in plans:
        print(f"  {p['block_name']}: {p['minutes']} min (habit {p['explanation'].get('habit_minutes')}), "
              f"water saved {round(p['saved_l'])} L, well water saved {p['aquifer_saved_l']} L, "
              f"AED {p['saved_aed']:.2f}, yield {p['habit_yield_pct']} -> {p['plan_yield_pct']}, "
              f"fallbacks {p['fallbacks']}")


def load(c: httpx.Client, fid: str, well_ec: float, desal_ec: float) -> None:
    for kind, name in (("readings", "batinah_well_T52_water_ec.csv"), ("soil_tests", "batinah_soil_tests.csv")):
        with open(DATA / name, "rb") as f:
            r = c.post(f"/api/v1/farms/{fid}/imports", params={"kind": kind, "dry_run": False, "published": True},
                       files={"file": (name, f, "text/csv")})
        print(f"Import {name}: {r.status_code} {r.json()}")

    now = datetime.now(UTC).isoformat()
    note = "DEMO STAND-IN, not a measurement. Replace with a meter reading."
    for src in c.get(f"/api/v1/farms/{fid}/sources").raise_for_status().json():
        ec = well_ec if src["kind"] == "well" else desal_ec
        r = c.post("/api/v1/readings", json={"farm_id": fid, "source_id": src["id"], "metric": "water_ec",
                                             "value": ec, "unit": "dS/m", "measured_at": now, "note": note})
        print(f"Today's EC {src['name']} = {ec}: {r.json()['results'][0]['status']}")

    tanks = c.get(f"/api/v1/farms/{fid}/tanks").raise_for_status().json()
    for t in tanks:
        r = c.post("/api/v1/readings", json={"farm_id": fid, "tank_id": t["id"], "metric": "tank_level_pct",
                                             "value": 72, "unit": "%", "measured_at": now, "note": note})
        print(f"Tank {t['name']} = 72%: {r.json()['results'][0]['status']}")


if __name__ == "__main__":
    main()
