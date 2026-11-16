# Milh — water decisions for salty desert farms

Milh (ملح, "salt") is a farm operations platform for desert farms that irrigate from brackish wells.
Each morning it turns live weather and the farm's own readings into one decision per block: **how many
minutes to run each water tap**. It explains that decision in plain words and speaks it to the worker
on a farm tablet, in their language.

- **Worker (farm tablet):** today's runs drawn as coloured "pipes" in the real tap colours, a big DONE
  button, spoken announcements (watering times, sunrise and sunset, heat, the midday break, soil test
  due, low tank), number-pad data entry, English and Urdu, and it works offline.
- **Owner (phone or laptop):** the plan with every input and fallback, the habit comparison (water, cost,
  estimated yield), readings, soil tests, CSV import, a Gemini lab-report reader, the salt clock, water
  reports, alerts and setup.
- **No simulated data.** Weather is live from Open-Meteo. Farm readings come only from forms, CSV,
  the REST API, MQTT sensors or confirmed lab reports, and every value shows where it came from.

Design: [docs/2026-11-16-milh-platform-design.md](docs/2026-11-16-milh-platform-design.md) ·
Build plan: [docs/superpowers/plans/2026-11-16-milh-platform.md](docs/superpowers/plans/2026-11-16-milh-platform.md) ·
Demo: [docs/demo-script.md](docs/demo-script.md)

## Run it on a laptop (no Docker)

Needs Python 3.12+ and Node 20+.

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"        # macOS/Linux: .venv/bin/pip
cp ../.env.example .env                       # then fill in JWT_SECRET (32+ chars) and optional keys
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m milh.cli seed-crops
.venv/Scripts/python -m milh.cli create-user --role owner --name "Owner" --email you@example.com
.venv/Scripts/python -m milh.cli load-farm ../data/demo_farm.json --owner-email you@example.com
.venv/Scripts/python -m milh.cli create-user --role worker --name "Worker" --pin 1234 --language ur --farm <FARM_ID>
.venv/Scripts/python -m milh.cli create-device --farm <FARM_ID> --kind kiosk --name "Farm tablet"
```

Then run three processes:

```bash
cd backend && .venv/Scripts/uvicorn milh.main:app --port 8000
```

```bash
cd backend && .venv/Scripts/python -m milh.worker
```

```bash
cd web && npm install && npm run dev
```

- Owner: http://localhost:5173/login
- Farm tablet: http://localhost:5173/kiosk/login (tablet key from `create-device`, plus the worker PIN)

The worker fetches weather hourly, plans every farm at 03:00 local time, re-plans when new readings
arrive, generates announcement audio and checks for stale data.

## Run it with Docker

```bash
cp .env.example backend/.env    # fill in JWT_SECRET and optional keys
docker compose up --build
docker compose --profile dev up web
```

Services: `db` (Postgres 16), `mqtt` (Mosquitto), `api`, `worker`, `mqtt-bridge`, and `web` (dev profile).

## Keys

Keys go only in `backend/.env`. That file is git-ignored and the browser never sees it.

| Variable | Needed for |
|---|---|
| `JWT_SECRET` | Sign-in tokens (32+ characters). Without it, logins reset when the server restarts. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_IDS` | Spoken announcements. Without them the tablet plays a chime and uses the device's own voice. |
| `GEMINI_API_KEY` | Friendlier wording, translating owner messages, reading lab reports. Optional: everything else works without it. |

## Getting data in

| Channel | How |
|---|---|
| Tablet number pad | Water salt (EC) and tank level |
| Owner forms | Any reading, plus soil tests |
| CSV | Owner → Add data → Import. Templates are in `web/public/templates/`. Published data needs a citation in `note`. |
| REST | `POST /api/v1/readings` with header `X-Api-Key: <device key>` (OpenAPI docs at http://localhost:8000/docs) |
| MQTT | Topic `milh/{farm_id}/{device_id}/{metric}`, JSON `{"key","value","unit","measured_at"}` |
| Lab report | Owner → Add data → Read a lab report (Gemini reads it, the owner confirms) |

Example sensor call:

```bash
curl -X POST localhost:8000/api/v1/readings -H "X-Api-Key: $KEY" -H "Content-Type: application/json" -d '{"farm_id":"<FARM_ID>","tank_id":"<TANK_ID>","metric":"tank_level_pct","value":64,"unit":"%","measured_at":"2026-11-16T06:00:00+04:00"}'
```

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest && .venv/Scripts/ruff check . && .venv/Scripts/mypy milh
```

```bash
cd web && npx vitest run && npx tsc -b && npm run lint
```

## Where the numbers come from

- Crop water need: FAO-56 (Allen et al. 1998), with ET₀ from Open-Meteo (FAO Penman-Monteith).
- Salt leaching and yield response: FAO-29 (Ayers & Westcot 1985), LR = ECw / (5·ECe_t − ECw) and Maas-Hoffman.
- EC 1:5 → ECe: Slavich & Petterson (1993) texture multipliers.
- Soil texture: ISRIC SoilGrids.
- Published salinity data in `data/published/`: well salinity for Al-Batinah, Oman (Al-Rahbi et al. 2019) and
  farm soil salinity (Al-Busaidi et al. 2022). Citations and caveats are in
  [data/published/SOURCES.md](data/published/SOURCES.md). The example farm is placed in the same area.
- Crop table values in `data/crops.json` are marked **VERIFY**. Check them against the source tables before relying on them.
