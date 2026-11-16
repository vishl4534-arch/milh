# Milh Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Milh, a desert-farm operations platform. It gives the on-farm worker a kiosk with a live dashboard and spoken multilingual announcements, gives the remote owner a dashboard, and turns live weather and injected water/soil readings into a daily, explained irrigation decision (minutes per water source). It never uses simulated data.

**Architecture:** A Python FastAPI backend with PostgreSQL. A separate worker process runs scheduled jobs: weather pull, daily plan, announcements, reminders and staleness checks. All agronomy maths lives in a pure, fully unit-tested package (`milh.agronomy`) with no database or network access. A React + TypeScript PWA has two modes: the worker kiosk (offline cache, audio playback) and the owner dashboard. External services are Open-Meteo (weather, ET₀, sun times), ISRIC SoilGrids (soil texture and pH), ElevenLabs (announcement audio) and Gemini (wording, translation, lab-report extraction only). MQTT is supported through a Mosquitto bridge. Everything runs with Docker Compose.

**Tech Stack:**
- **Backend:** Python 3.12, uv, FastAPI, SQLAlchemy 2 (sync), Alembic, Pydantic v2, pydantic-settings, httpx, APScheduler 3.x, PyJWT, argon2-cffi, paho-mqtt, google-genai, pytest, respx, ruff, mypy.
- **Database and messaging:** PostgreSQL 16, Mosquitto 2.
- **Frontend:** React 18, TypeScript, Vite, vite-plugin-pwa, Dexie, TanStack Query, React Router, react-i18next, Tailwind, shadcn/ui, Recharts, openapi-typescript, Vitest, Testing Library.
- **Infrastructure:** Docker Compose, GitHub Actions.

**Spec:** `docs/2026-11-16-milh-platform-design.md`. Read it before starting any task. Section numbers below (§) refer to it.

## Global Constraints

- **No simulated data, anywhere.** No random or fake sensors, no generated readings, no hidden demo seeders. The only seed scripts load the **crop reference library** and an **example farm configuration** (blocks, sources, costs). Readings enter only through ingestion (forms, CSV, REST, MQTT, confirmed lab-report extraction). Tests may use hand-written fixtures; fixtures are never loaded into a running app.
- Every stored reading and soil test records provenance: `source` ∈ {`api:open-meteo`, `api:soilgrids`, `manual`, `csv_import`, `device:<id>`, `gemini_extract`}, `submitted_by` (user or device), `measured_at`, `received_at`, optional `note` (the citation for published data).
- Missing data shows an empty state ("No test yet. Add one"), never an invented value. Every fallback is listed in the plan's `fallbacks` and shown in the UI.
- Gemini never produces a number used in a decision. Engine numbers are the source of truth; a Gemini rewording that drops the minutes value is discarded (Task 16).
- API keys (`ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `JWT_SECRET`) exist only in the server `.env`. `.env` is git-ignored; `.env.example` has empty values. The frontend never calls ElevenLabs or Gemini.
- All times are stored in UTC and displayed and scheduled in the farm's timezone (`Farm.timezone`, default `Asia/Dubai`).
- Defaults (all per-farm settings): LR cap `0.3`; drip efficiency `0.9`; rain under `5 mm` ignored; earliest worker start `05:00`; morning overrun `sunrise + 2 h`; evening slot `sunset + 30 min`; daily plan job `03:00`; briefing `05:15`; heat threshold `45 °C`; UAE midday break `15 Jun–15 Sep, 12:30–15:00`; tank low `25 %`; water-EC jump `> 20 %`; water EC stale after `14 days`; tank reading stale after `48 h`; device offline after `24 h`; flush extra `20 mm` (team to verify); soil rules `0.8 / 0.15 / pH 6.0–8.5 / 7 d / 14 d`.
- P0 languages: English (`en`) and Urdu (`ur`, RTL). P1: Arabic (`ar`, RTL) and Hindi (`hi`).
- Python: type-checked (`mypy --strict` on `milh.agronomy`, normal elsewhere), `ruff` clean. TypeScript: `strict: true`, `eslint` clean.

## Review Focus

1. **Kiosk audio blocked by browser autoplay.** Browsers refuse to play audio until the user interacts with the page. The kiosk must show a full-screen "Tap to start" unlock before scheduling playback, and must show a visible "🔇 tap to enable sound" banner if playback is rejected later. Test: Task 20 `player.test.ts › refuses to schedule before unlock and shows banner on NotAllowedError`.
2. **Water too salty for any blend** (ECw ≥ 5·a, or no mix meets the LR cap). Expected: no crash, no negative or infinite LR. Recommend the lowest-EC mix, set `cap_exceeded`, and raise an owner alert "Water too salty for <crop>". Test: Task 9 `test_blend_infeasible_picks_lowest_ec_and_flags`, Task 13 `test_plan_block_cap_exceeded_raises_alert_reason`.
3. **Missing inputs** (no water EC ever recorded, no forecast ever fetched). Expected: the plan falls back to the owner's habit routine with the reason shown; no 500 error, no 0-minute plan. Test: Task 13 `test_plan_block_no_water_ec_uses_habit`, `test_plan_block_no_forecast_uses_habit`.
4. **Timezone drift.** The server container runs in UTC, the farm is in Asia/Dubai (UTC+4). Expected: a 05:15 briefing plays at 05:15 Dubai time, and the day boundary for "today's plan" is midnight Dubai time. Test: Task 14 `test_briefing_scheduled_in_farm_timezone`, Task 17 `test_bundle_day_uses_farm_timezone`.
5. **Rain day or zero net irrigation.** Expected: the block plan is 0 minutes with `skip_reason="rain"` or `"no_need"`, no start/stop announcements for it, and the briefing says the block is skipped. Test: Task 13 `test_plan_block_rain_skips`, Task 14 `test_zero_minute_plan_has_no_start_stop`.

---

## Team tracks and timeline (24–48 h, 2–4 people)

| Hours | Track 1 — Backend & data | Track 2 — Engine | Track 3 — Web | Track 4 — Voice & demo (optional) |
|---|---|---|---|---|
| 0–3 | **Task 0, Task 1 together (everyone)** | | | Task R1 starts |
| 3–12 | 2 → 3 → 4 → 5 | 8 → 9 → 10 → 11 | 18 → 19 | R1, 15, templates for 14 |
| 12–20 | 6 → 7 → 17 | 12 → 13 → 14 | 20 → 21 | 16 |
| 20–30 | 24 → 23 | help Track 1/3, integration | 22 | demo farm config, Task 31 draft |
| 30–40 | P1: 25, 26, 27 | P1: 28 | P1: 29 | Task 31 |
| last 6 | **Feature freeze. Task 31 run-through, backup video** | | | |

Integration check-ins at hours 12, 20 and 30. At each one, merge everything and run the end-to-end flow (reading in → plan updates → announcement plays → DONE recorded).

With 2 people, merge Tracks 1+4 and 2+3. With 3 people, Track 4 work goes to whoever finishes first.

---

## File structure

```
.
├── .env.example                    # empty keys + defaults
├── .gitignore
├── docker-compose.yml              # db, mqtt, api, worker, web
├── infra/mosquitto.conf
├── .github/workflows/ci.yml
├── data/
│   ├── crops.json                  # FAO-56 / FAO-29 reference library (cited)
│   ├── demo_farm.json              # example farm CONFIGURATION only (no readings)
│   └── published/                  # cited real data as import CSVs (Task R1)
│       ├── SOURCES.md
│       └── *.csv
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini, alembic/versions/
│   ├── milh/
│   │   ├── config.py               # Settings
│   │   ├── db.py                   # engine, SessionLocal, get_session
│   │   ├── models/                 # identity.py farm.py data.py ops.py
│   │   ├── schemas/                # pydantic I/O models, one file per router
│   │   ├── agronomy/               # PURE: crops.py water.py blend.py timing.py soil_schedule.py salt_clock.py units.py
│   │   ├── ingestion/              # validation.py service.py csv_import.py mqtt_bridge.py
│   │   ├── sources/                # open_meteo.py soilgrids.py
│   │   ├── planning/               # core.py (pure) planner.py (DB) explain.py
│   │   ├── announcements/          # templates/{en,ur,ar,hi}.json templates.py build.py service.py tts.py
│   │   ├── ai/gemini.py
│   │   ├── alerts.py               # alert creation + staleness checks
│   │   ├── reports.py
│   │   ├── auth.py                 # hashing, JWT, deps, require_role
│   │   ├── api/                    # routers: auth farms readings soil imports weather plans kiosk events announcements alerts reports devices lab
│   │   ├── jobs.py                 # APScheduler job registration
│   │   ├── worker.py               # `python -m milh.worker`
│   │   ├── cli.py                  # seed-crops, load-farm, create-user, create-device
│   │   └── main.py                 # FastAPI app
│   └── tests/                      # mirrors milh/; conftest.py with db fixture
└── web/
    ├── package.json, vite.config.ts, tailwind.config.ts
    └── src/
        ├── main.tsx  App.tsx  routes.tsx
        ├── api/      client.ts  schema.d.ts (generated)  hooks.ts
        ├── i18n/     index.ts  en.json  ur.json
        ├── kiosk/    KioskApp.tsx UnlockScreen.tsx NumberPad.tsx ReadingEntry.tsx player.ts offline.ts
        │             panels/{WeatherBar,TodayPanel,WaterPanel,SoilPanel,AnnouncementBar}.tsx
        ├── owner/    OwnerLayout.tsx FarmList.tsx FarmDashboard.tsx PlanDetail.tsx SetupForms.tsx
        │             SoilTests.tsx ImportCsv.tsx Reports.tsx SaltClockPanel.tsx Alerts.tsx LabReport.tsx
        └── components/ui/ (shadcn)
```

---

## P0 tasks

### Task 0: Repository, tooling, Compose, CI (everyone, hours 0–1)

**Files:**
- Create: `.gitignore`, `.env.example`, `docker-compose.yml`, `infra/mosquitto.conf`, `.github/workflows/ci.yml`, `backend/pyproject.toml`, `backend/milh/__init__.py`, `backend/milh/config.py`, `backend/milh/main.py`, `backend/tests/test_health.py`, `web/` (Vite React-TS template)

**Interfaces:**
- Produces: `Settings` (pydantic-settings, env-loaded) with fields `database_url`, `jwt_secret`, `elevenlabs_api_key: str | None`, `elevenlabs_model_id: str`, `elevenlabs_voice_ids: dict[str, str]` (JSON env), `gemini_api_key: str | None`, `gemini_model: str` (default `"gemini-2.5-flash"`; the builder may pick a newer model), `media_dir: Path` (default `/data/media`), `mqtt_url: str`, `cors_origins: list[str]`. Also `get_settings() -> Settings` (cached) and `GET /health -> {"status": "ok"}`.

- [ ] **Step 1:** `git init`. Write `.gitignore` covering `.env`, `__pycache__`, `.venv`, `node_modules`, `dist`, `media/`.
- [ ] **Step 2:** Write `.env.example` with every `Settings` field, secrets empty.
- [ ] **Step 3:** Write the failing test `tests/test_health.py::test_health_ok`: `TestClient(app).get("/health")` returns `200` and `{"status": "ok"}`.
- [ ] **Step 4:** Implement `config.py` and `main.py` (CORS from settings, `/health`). Run `uv run pytest` and expect PASS.
- [ ] **Step 5:** `npm create vite@latest web -- --template react-ts`. Add Tailwind, shadcn/ui init, Vitest, eslint. Run `npm run build` and expect success.
- [ ] **Step 6:** Write `docker-compose.yml`:
  - `db`: postgres:16, volume, healthcheck, plus a second DB `milh_test` created by an init script.
  - `mqtt`: eclipse-mosquitto:2, with `infra/mosquitto.conf` allowing anonymous connections on the internal network only.
  - `api`: `uvicorn milh.main:app`, depends on db healthy, `media` volume.
  - `worker`: `python -m milh.worker`, same image.
  - `web`: Vite dev server on 5173 (dev profile).
  - Run `docker compose up -d db api`, then `curl localhost:8000/health` and expect `{"status":"ok"}`.
- [ ] **Step 7:** Write `ci.yml`:
  - backend job with a postgres service: `uv sync`, `ruff check`, `mypy milh`, `pytest`.
  - web job: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- [ ] **Step 8:** Commit `chore: scaffold repo, compose, CI`.

### Task 1: Data contracts — models, migration, reading schema (everyone, hours 1–3)

**Files:**
- Create: `backend/milh/db.py`, `backend/milh/models/{__init__,identity,farm,data,ops}.py`, `backend/alembic/versions/0001_initial.py`, `backend/milh/schemas/readings.py`, `backend/tests/conftest.py`, `backend/tests/test_models.py`

**Interfaces:**
- Produces the SQLAlchemy models below, with UUID primary keys and `created_at` everywhere. All other tasks use these names exactly.
  - `User(id, email | None, name, role: Literal["owner","worker","admin"], language: str, password_hash | None, pin_hash | None, phone | None)`
  - `FarmMember(farm_id, user_id)`, which scopes users to farms.
  - `Device(id, farm_id, name, kind: Literal["kiosk","sensor","gateway"], api_key_hash, last_seen_at | None)`
  - `Farm(id, owner_id, name, lat, lon, timezone, settings: JSONB, needs_replan: bool)`
  - `Crop(key PK str, names JSONB, perennial, kc_ini, kc_mid, kc_end, stage_days ARRAY[int] len 4, salt_a, salt_b, citation)`
  - `Block(id, farm_id, name, area_m2, crop_key, planting_date, irrigation_type, flow_l_per_h, efficiency, habit_minutes, habit_source_id, soil_texture | None)`
  - `WaterSource(id, farm_id, name, kind: Literal["well","desal","tse","municipal"], cost_per_m3, declared_ec | None, tap_label: JSONB (per-language label, e.g. {"en":"blue tap"}), tap_color)`
  - `Tank(id, farm_id, name, capacity_l, source_id | None)`
  - `Reading(id (client-suppliable, idempotency key), farm_id, block_id?, source_id?, tank_id?, metric, value, unit (normalised), raw_value, raw_unit, measured_at, received_at, source, submitted_by_user_id?, submitted_by_device_id?, note?, flags: ARRAY[str])`
  - `SoilTest(id (client-suppliable), block_id, tested_on: date, ec_1to5?, ece, moisture_vwc?, ph?, lab?, attachment_path?, source, submitted_by_user_id?, note?, confirmed_by_user_id?)`
  - `WeatherSnapshot(id, farm_id, fetched_at, current JSONB, daily JSONB, hourly JSONB)`
  - `SoilProfile(farm_id PK, fetched_at, clay_pct, sand_pct, silt_pct, ph, texture_class, source="api:soilgrids")`
  - `IrrigationPlan(id, farm_id, block_id, day: date, slot, start_at, minutes, steps JSONB [{source_id, minutes}], gross_l, fractions JSONB, ecw, lr, cap_exceeded, flush, habit_l, saved_l, saved_aed, habit_yield_pct, plan_yield_pct, explanation JSONB, text JSONB {lang: str}, fallbacks ARRAY[str], skip_reason?, computed_at)`. Unique on (block_id, day).
  - `IrrigationEvent(id (client-suppliable), plan_id?, block_id, source_id?, started_at, minutes, method: Literal["tap","voice","sensor"], confirmed_by_user_id?)`
  - `Announcement(id, farm_id, type, scheduled_at, template_key, slots JSONB, text JSONB {lang: str}, audio JSONB {lang: relpath}, status: Literal["scheduled","played","acknowledged","cancelled"], plan_id?, custom: bool)`
  - `Alert(id, farm_id, severity: Literal["info","warning","critical"], type, message JSONB {lang: str}, created_at, resolved_at?)`
- Produces `schemas/readings.py`:
  - `Metric = Literal["water_ec","tank_level_pct","tank_volume_l","well_depth_m","soil_ec_1to5","soil_ece","soil_moisture_vwc","soil_ph","flow_l","irrigation_minutes"]`
  - `ReadingIn(reading_id: UUID | None, farm_id: UUID, block_id: UUID | None, source_id: UUID | None, tank_id: UUID | None, metric: Metric, value: float, unit: str, measured_at: AwareDatetime, device_id: UUID | None, note: str | None)`
  - `ReadingOut`
  - `ReadingBatchIn(readings: list[ReadingIn])`
- Produces `conftest.py` fixtures `session` (per-test transaction on `milh_test`, rolled back) and `client` (TestClient with the session override).

- [ ] **Step 1:** Write the failing test `test_models.py::test_reading_roundtrip`. Insert a Farm and a Reading with flags `["jump"]`, query it back, and assert `flags == ["jump"]` and that `measured_at.tzinfo` is not None.
- [ ] **Step 2:** Implement the models and run `alembic revision --autogenerate -m initial`. Review the migration by hand (JSONB, ARRAY, unique (block_id, day)).
- [ ] **Step 3:** Run `uv run alembic upgrade head && uv run pytest tests/test_models.py`. Expect PASS.
- [ ] **Step 4:** Write `test_models.py::test_reading_in_rejects_naive_datetime`: `ReadingIn(..., measured_at="2026-11-16T05:10:00")` raises `ValidationError`. Run it and expect PASS (`AwareDatetime`).
- [ ] **Step 5:** Commit `feat: core data model and reading contract`.

> After Task 1 merges, tracks split. Track 3 runs `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts` whenever the API changes.

### Task 2: Auth, roles, devices (Track 1)

**Files:**
- Create: `backend/milh/auth.py`, `backend/milh/api/auth.py`, `backend/milh/api/devices.py`, `backend/milh/cli.py` (`create-user`, `create-device`), `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `User`, `Device`, `FarmMember`.
- Produces:
  - `hash_secret(s: str) -> str` and `verify_secret(s: str, h: str) -> bool` (argon2).
  - `issue_token(user: User, farm_id: UUID | None, ttl: timedelta) -> str`.
  - FastAPI dependencies: `current_user`, `require_role(*roles)`, `require_farm_access(farm_id)`, and `device_from_api_key` (header `X-Api-Key`, which updates `Device.last_seen_at`).
  - Endpoints:
    - `POST /api/v1/auth/login {email, password} -> {access_token}`
    - `POST /api/v1/auth/kiosk {device_key, pin} -> {access_token}`. Issues a worker token bound to the device's farm, 18 h TTL.
    - `POST /api/v1/farms/{id}/devices -> {id, api_key}`. The API key is shown once (owner or admin only).

- [ ] **Step 1:** Write the failing tests:
  - `test_login_ok`
  - `test_login_bad_password_401`
  - `test_kiosk_pin_login_scoped_to_device_farm`
  - `test_worker_cannot_patch_farm_403`
  - `test_owner_cannot_read_other_owners_farm_404`
  - `test_device_api_key_shown_once_and_hashed`: the response contains the key, and `Device.api_key_hash != key`.
- [ ] **Step 2:** Run them and expect FAIL. Implement. Run them and expect PASS.
- [ ] **Step 3:** Add the CLI commands `uv run python -m milh.cli create-user --role owner --email … --name …` (prompts for password) and `create-device --farm … --kind kiosk`.
- [ ] **Step 4:** Commit `feat: auth, roles, device keys`.

### Task 3: Farm configuration API, crop library, example farm (Track 1)

**Files:**
- Create: `data/crops.json`, `data/demo_farm.json`, `backend/milh/api/farms.py`, `backend/milh/schemas/farms.py`, `backend/tests/test_farms.py`. Modify `cli.py` (`seed-crops`, `load-farm`).

**Interfaces:**
- Produces CRUD under `/api/v1/farms` (`GET` list, `POST`, `GET/PATCH /{id}`), plus `/{id}/blocks`, `/{id}/sources` and `/{id}/tanks` (GET, POST, PATCH). Also `GET /api/v1/crops`.
- Produces `FarmSettings` (pydantic, stored in `Farm.settings`) holding every per-farm default from Global Constraints. `get_farm_settings(farm: Farm) -> FarmSettings`.
- `data/crops.json` holds a list of `Crop` rows for `tomato, cucumber, sweet_pepper, date_palm, barley, alfalfa`. Values are copied from FAO-56 Tables 11–12 (Kc and stage lengths, arid or desert rows where given) and FAO-29 Table 4 (`salt_a`, `salt_b`), with `citation` per row. **The implementer verifies every value against the documents.** Expected values to cross-check: tomato a=2.5 b=9.9; cucumber a=2.5 b=13; date palm a=4.0 b=3.6; barley a=8.0 b=5.0; alfalfa a=2.0 b=7.3.
- `data/demo_farm.json` is a farm at Al Ain coordinates (24.2075, 55.7447), timezone `Asia/Dubai`, with three blocks (tomato, date palm, cucumber), a well and a desal source with tap labels, and one tank. **It contains no readings.** The top-level `"_label": "Example farm configuration — not a real farm"` is shown in the owner UI.

- [ ] **Step 1:** Write the failing tests:
  - `test_create_farm_with_default_settings`: `settings.lr_cap == 0.3` and `earliest_start == "05:00"`.
  - `test_patch_settings_validates`: `lr_cap=1.5` returns 422.
  - `test_block_requires_known_crop`: 422.
  - `test_load_farm_cli_creates_no_readings`: after `load-farm`, `count(Reading) == 0`.
- [ ] **Step 2:** Implement. Run `uv run pytest tests/test_farms.py` and expect PASS.
- [ ] **Step 3:** Commit `feat: farm configuration, crop library, example farm config`.

### Task 4: Ingestion service and REST readings (Track 1)

**Files:**
- Create: `backend/milh/ingestion/validation.py`, `backend/milh/ingestion/service.py`, `backend/milh/api/readings.py`, `backend/milh/api/soil.py`, `backend/milh/schemas/soil.py`, `backend/tests/ingestion/test_validation.py`, `backend/tests/ingestion/test_service.py`, `backend/tests/api/test_readings.py`

**Interfaces:**
- Consumes: `ReadingIn`, models, auth dependencies.
- Produces:
  - `METRIC_RULES: dict[Metric, MetricRule]` with `MetricRule(unit: str, min: float, max: float, conversions: dict[str, float])`:
    - water_ec: dS/m, 0–60, {dS/m: 1, mS/cm: 1, µS/cm: 0.001, uS/cm: 0.001}
    - tank_level_pct: %, 0–100
    - tank_volume_l: L, 0–10 000 000, {L: 1, m3: 1000}
    - well_depth_m: m, 0–500
    - soil_ec_1to5: dS/m, 0–50
    - soil_ece: dS/m, 0–100
    - soil_moisture_vwc: %, 0–100
    - soil_ph: pH, 0–14
    - flow_l: L, 0–10 000 000, {L: 1, m3: 1000}
    - irrigation_minutes: min, 0–1440
  - `normalise(r: ReadingIn) -> tuple[float, str]`. Raises `IngestError(code, message)`; codes `unknown_unit` and `out_of_range`.
  - `ingest(session, readings: list[ReadingIn], provenance: Provenance) -> list[IngestResult]`, where `Provenance(source: str, user_id: UUID | None, device_id: UUID | None)` and `IngestResult(reading_id, status: Literal["created","duplicate","rejected"], error: str | None, flags: list[str])`. It sets `Farm.needs_replan = True` when a `water_ec` or `soil_*` reading is created. For `water_ec` it adds flag `"jump"` when the change is more than 20 % from the previous reading of the same source, and calls `alerts.raise_alert(..., type="water_ec_jump")`. For `tank_level_pct` below the farm's `tank_low_pct` it raises `tank_low`. (`alerts.raise_alert` is defined in Task 24. Until then, stub it in `alerts.py` with the final signature `raise_alert(session, farm_id, type: str, severity: str, slots: dict) -> Alert`.)
  - Rejects a `measured_at` more than 10 minutes in the future (`code="future_timestamp"`).
  - `POST /api/v1/readings` accepts a `ReadingIn` or a `ReadingBatchIn`. Auth is a user JWT (provenance `manual`) or `X-Api-Key` (provenance `device:<id>`). It returns `{"results": [IngestResult]}` with status 200 (partial rejects are reported per row).
  - `GET /api/v1/farms/{id}/readings?metric=&source_id=&tank_id=&since=&limit=`
  - `POST /api/v1/farms/{id}/soil-tests` (`SoilTestIn` with optional `id`, `block_id`, `tested_on`, `ec_1to5 | ece` (at least one), `moisture_vwc?`, `ph?`, `lab?`, `note?`). If only `ec_1to5` is given, `ece` is computed with `agronomy.units.ece_from_ec1to5` (Task 8b) and the factor is recorded in `note`. Sets `needs_replan`. `GET` lists the farm's soil tests.

- [ ] **Step 1:** Write the failing tests:
  - `test_normalise_us_cm_to_ds_m`: 3600 µS/cm becomes `(3.6, "dS/m")`.
  - `test_out_of_range_rejected`: water_ec 75 is rejected.
  - `test_unknown_unit_rejected`
  - `test_duplicate_reading_id_is_idempotent`: posting the same `reading_id` twice gives statuses `["created"]` then `["duplicate"]` and exactly one row.
  - `test_jump_flag_and_alert`: 3.0 then 3.7 sets flags `["jump"]` and creates one Alert of type `water_ec_jump`.
  - `test_device_key_provenance`: `source == f"device:{device.id}"`.
  - `test_future_timestamp_rejected`
  - `test_ingest_sets_needs_replan`
  - `test_soil_test_ec1to5_converted_and_cited`
- [ ] **Step 2:** Run them and expect FAIL. Implement. Run them and expect PASS.
- [ ] **Step 3:** Commit `feat: ingestion service, readings and soil-test endpoints`.

### Task 5: Open-Meteo weather (Track 1)

**Files:**
- Create: `backend/milh/sources/open_meteo.py`, `backend/milh/api/weather.py`, `backend/tests/sources/test_open_meteo.py`, `backend/tests/fixtures/open_meteo_forecast.json` (one real response captured with `curl`, used only in tests)

**Interfaces:**
- Produces:
  - `fetch_forecast(lat: float, lon: float, http: httpx.Client) -> ForecastPayload`. It calls `GET https://api.open-meteo.com/v1/forecast` with:
    - `current=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation`
    - `hourly=temperature_2m,relative_humidity_2m,et0_fao_evapotranspiration`
    - `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,sunrise,sunset,shortwave_radiation_sum`
    - `timezone=auto&forecast_days=7`
  - `fetch_history(lat, lon, start: date, end: date, http) -> list[DailyWeather]`, from `https://archive-api.open-meteo.com/v1/archive` with `daily=et0_fao_evapotranspiration,precipitation_sum,temperature_2m_max`.
  - `DailyWeather(day: date, et0_mm: float, rain_mm: float, tmax_c: float, tmin_c: float | None, sunrise: datetime | None, sunset: datetime | None)`. Sunrise and sunset are tz-aware in the farm tz.
  - `refresh_weather(session, farm: Farm, http) -> WeatherSnapshot`, which stores the snapshot. On HTTP failure it raises `WeatherUnavailable` and the previous snapshot stays.
  - `latest_day_weather(session, farm_id, day) -> tuple[DailyWeather, float] | None`, returning (weather, snapshot age in hours).
  - `GET /api/v1/farms/{id}/weather -> {current, daily: [DailyWeather], fetched_at, age_h, source: "api:open-meteo"}`

- [ ] **Step 1:** Write the failing tests (respx mocks the URL with the fixture):
  - `test_fetch_forecast_parses_daily`: 7 days; `et0_mm` equals the fixture's first `et0_fao_evapotranspiration`; sunrise is tz-aware.
  - `test_refresh_stores_snapshot`
  - `test_refresh_failure_keeps_previous_snapshot`: a 500 raises `WeatherUnavailable` and the snapshot count is unchanged.
  - `test_latest_day_weather_reports_age`
- [ ] **Step 2:** Implement. Run the tests and expect PASS. Then run `uv run python -c "…refresh for demo farm…"` once against the live API and check that real values were stored.
- [ ] **Step 3:** Commit `feat: Open-Meteo forecast and history`.

### Task 6: SoilGrids soil profile (Track 1)

**Files:**
- Create: `backend/milh/sources/soilgrids.py`, `backend/tests/sources/test_soilgrids.py`, `backend/tests/fixtures/soilgrids.json` (captured real response)

**Interfaces:**
- Produces `refresh_soil_profile(session, farm, http) -> SoilProfile`. It calls `GET https://rest.isric.org/soilgrids/v2.0/properties/query?lon=&lat=&property=clay&property=sand&property=silt&property=phh2o&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`, takes a depth-weighted mean over 0–30 cm, and applies the unit `d_factor` from the response (e.g. clay g/kg ÷ 10 → %, pH ×10 ÷ 10). It derives `texture_class` with the USDA texture triangle (`agronomy/units.py::usda_texture(sand, silt, clay) -> str`).
- When `Block.soil_texture` is null, blocks default to the farm `SoilProfile.texture_class`.

- [ ] **Step 1:** Write the failing tests:
  - `test_parse_soilgrids_depth_weighted`: expected percentages computed by hand from the fixture.
  - `test_usda_texture_sand`: `usda_texture(92, 4, 4) == "sand"`.
  - `test_usda_texture_loam`: `usda_texture(40, 40, 20) == "loam"`.
- [ ] **Step 2:** Implement. Run the tests and expect PASS.
- [ ] **Step 3:** Commit `feat: SoilGrids soil profile`.

### Task 7: CSV import (Track 1)

**Files:**
- Create: `backend/milh/ingestion/csv_import.py`, `backend/milh/api/imports.py`, `backend/tests/ingestion/test_csv_import.py`, `web/public/templates/readings_template.csv`, `web/public/templates/soil_tests_template.csv`

**Interfaces:**
- Produces:
  - Readings CSV columns: `measured_at,metric,value,unit,block,source,tank,note`. `block`, `source` and `tank` are matched by name within the farm.
  - Soil-test CSV columns: `tested_on,block,ece,ec_1to5,ph,moisture_vwc,lab,note`.
  - `parse_csv(session, farm_id, kind: Literal["readings","soil_tests"], text: str) -> ImportPreview`, where `ImportPreview(rows_ok: int, errors: list[RowError(row: int, column: str, message: str)])`.
  - `POST /api/v1/farms/{id}/imports?kind=readings&dry_run=true` (multipart `file`) returns `ImportPreview`. With `dry_run=false` it commits **only if there are zero errors** (otherwise 422 with the preview), through `ingest(..., Provenance(source="csv_import", user_id=…))`.
  - **Every row of published data must have a non-empty `note` (the citation).** When the uploader ticks "published data", an empty note is a row error `missing_citation` (query flag `published=true`).

- [ ] **Step 1:** Write the failing tests:
  - `test_dry_run_reports_row_errors`: a bad unit on row 3 gives `errors[0].row == 3`.
  - `test_commit_all_or_nothing`: one bad row means zero rows are stored.
  - `test_published_requires_citation`
  - `test_unknown_block_name_error`
  - `test_import_provenance_csv_import`
- [ ] **Step 2:** Implement. Run the tests and expect PASS.
- [ ] **Step 3:** Commit `feat: CSV import with dry-run and citations`.

### Task 8: Agronomy — crop coefficients and water need (Track 2)

**Files:**
- Create: `backend/milh/agronomy/__init__.py`, `backend/milh/agronomy/crops.py`, `backend/milh/agronomy/water.py`, `backend/tests/agronomy/fixtures.py`, `backend/tests/agronomy/test_crops.py`, `backend/tests/agronomy/test_water.py`

**Interfaces:**
- Produces (`crops.py`):
  ```python
  @dataclass(frozen=True)
  class CropParams:
      key: str; names: dict[str, str]; perennial: bool
      kc_ini: float; kc_mid: float; kc_end: float
      stage_days: tuple[int, int, int, int]   # initial, development, mid, late
      salt_a: float; salt_b: float; citation: str
  Stage = Literal["initial", "development", "mid", "late", "ended", "perennial"]
  def load_crop_library(path: Path) -> dict[str, CropParams]
  def crop_from_row(row: Crop) -> CropParams
  def kc_for_day(crop: CropParams, days_after_planting: int) -> tuple[float, Stage]
  ```
  This is the FAO-56 piecewise curve: constant `kc_ini` in the initial stage, linear to `kc_mid` across development, constant in mid, linear to `kc_end` across late, `kc_end` with stage `"ended"` after that. A perennial crop always returns `(kc_mid, "perennial")`.
- Produces (`water.py`):
  ```python
  def crop_et_mm(et0_mm: float, kc: float) -> float
  def effective_rain_mm(rain_mm: float, threshold_mm: float = 5.0) -> float  # 0 if rain < threshold else rain
  def net_irrigation_mm(etc_mm: float, eff_rain_mm: float, extra_mm: float = 0.0) -> float  # max(0, etc - rain) + extra
  def leaching_requirement(ecw: float, ece_threshold: float) -> float | None  # FAO-29: ecw/(5a-ecw); None if ecw >= 5a; 0 if ecw <= 0
  def gross_volume_l(net_mm: float, area_m2: float, lr: float, efficiency: float) -> float  # net_mm*area_m2/((1-lr)*efficiency)
  def runtime_minutes(volume_l: float, flow_l_per_h: float) -> float  # volume/flow*60
  ```
- `tests/agronomy/fixtures.py` defines `TOMATO = CropParams("tomato", {"en": "Tomato"}, False, 0.6, 1.15, 0.8, (30, 40, 45, 30), 2.5, 9.9, "test")`, plus `DATE_PALM` (perennial, kc_mid 0.95, a 4.0, b 3.6) and `BARLEY` (a 8.0, b 5.0).

- [ ] **Step 1: Write the failing tests**
  ```python
  @pytest.mark.parametrize("day,kc,stage", [
      (0, 0.6, "initial"), (29, 0.6, "initial"), (50, 0.875, "development"),
      (80, 1.15, "mid"), (130, 0.975, "late"), (145, 0.8, "ended"), (400, 0.8, "ended")])
  def test_kc_for_day_tomato(day, kc, stage):
      got, st = kc_for_day(TOMATO, day)
      assert got == pytest.approx(kc) and st == stage

  def test_kc_perennial():
      assert kc_for_day(DATE_PALM, 9999) == (0.95, "perennial")

  def test_crop_et():            assert crop_et_mm(6.1, 1.15) == pytest.approx(7.015)
  def test_small_rain_ignored(): assert effective_rain_mm(3.0) == 0.0
  def test_big_rain_counts():    assert effective_rain_mm(8.0) == 8.0
  def test_net_never_negative(): assert net_irrigation_mm(7.015, 8.0) == 0.0
  def test_lr_fao29():           assert leaching_requirement(3.6, 2.5) == pytest.approx(0.40449, abs=1e-4)
  def test_lr_impossible():      assert leaching_requirement(12.5, 2.5) is None
  def test_gross_volume():       assert gross_volume_l(7.015, 1000, 0.28866, 0.9) == pytest.approx(10957.3, rel=1e-3)
  def test_runtime():            assert runtime_minutes(10957.3, 15000) == pytest.approx(43.83, abs=0.01)
  ```
- [ ] **Step 2:** Run `uv run pytest tests/agronomy -v`. Expect FAIL (import error).
- [ ] **Step 3:** Implement the signatures above.
- [ ] **Step 4:** Run the tests and expect PASS. Run `uv run mypy --strict milh/agronomy` and expect it clean.
- [ ] **Step 5:** Commit `feat(agronomy): FAO-56 crop water need and FAO-29 leaching`.

### Task 8b: Agronomy — units and soil conversions (Track 2, small)

**Files:**
- Create: `backend/milh/agronomy/units.py`, `backend/tests/agronomy/test_units.py`

**Interfaces:**
- Produces:
  - `usda_texture(sand: float, silt: float, clay: float) -> str` (used by Task 6).
  - `ECE_FROM_EC1TO5: dict[str, float]`, a texture class → multiplication factor taken from Slavich & Petterson (1993). **The implementer copies the table and its citation from the paper**, and the module docstring holds the citation.
  - `ece_from_ec1to5(ec: float, texture: str) -> tuple[float, float]`, returning (ece, factor used). Raises `KeyError` for an unknown texture.

- [ ] **Step 1:** Write the failing tests:
  - `test_ece_uses_texture_factor`: the expected value is `ec * ECE_FROM_EC1TO5["sand"]`, and the returned factor equals the table value.
  - The two texture tests from Task 6 (moved here).
- [ ] **Step 2:** Implement. Run the tests and expect PASS. Commit `feat(agronomy): soil texture and ECe conversion`.

### Task 9: Agronomy — water-source blend (Track 2)

**Files:**
- Create: `backend/milh/agronomy/blend.py`, `backend/tests/agronomy/test_blend.py`

**Interfaces:**
- Consumes: `leaching_requirement`, `gross_volume_l`, `runtime_minutes`.
- Produces:
  ```python
  @dataclass(frozen=True)
  class SourceOption: source_id: str; ec: float; cost_per_m3: float
  @dataclass(frozen=True)
  class BlendResult:
      fractions: dict[str, float]      # sums to 1.0
      ecw: float; lr: float            # lr used for volume (cap when infeasible)
      gross_l: float; cost_aed: float
      cap_exceeded: bool
      lr_cheapest_alone: float | None  # LR if only the cheapest source were used (for the explanation)
  def choose_blend(sources: list[SourceOption], net_mm: float, area_m2: float,
                   ece_threshold: float, efficiency: float = 0.9,
                   lr_cap: float = 0.3, step: float = 0.05) -> BlendResult
  def split_minutes(total_minutes: float, fractions: dict[str, float],
                    order: list[str]) -> list[tuple[str, int]]
  ```
  **Algorithm:**
  - One source: fraction 1.0.
  - Two or more: evaluate every pair (i, j) and every fraction `f ∈ {0, step, …, 1}` of j. `ecw = (1−f)·ec_i + f·ec_j`. A mix is feasible if `leaching_requirement(ecw, a)` is not None and is `≤ lr_cap`. Cost is `gross_l/1000 × ((1−f)·cost_i + f·cost_j)`. Pick the feasible mix with the lowest cost, breaking ties on the lower ecw.
  - No feasible mix: pick the lowest-ecw mix, set `lr = min(leaching_requirement or lr_cap, lr_cap)` (the cap, used only to size the volume) and `cap_exceeded=True`.
  - `net_mm == 0`: `gross_l == 0`, and fractions are still chosen by the same rule.
  - `split_minutes`: `round(total × fraction)` per source with fraction > 0, at least 1 minute each, listed in `order` (the block's tap order: well first). Sources with fraction 0 are omitted.

- [ ] **Step 1: Write the failing tests**
  ```python
  WELL = SourceOption("well", 3.6, 0.5); DESAL = SourceOption("desal", 0.4, 5.0)
  def test_blend_cheapest_feasible():
      r = choose_blend([WELL, DESAL], 7.015, 1000, 2.5)
      assert r.fractions == pytest.approx({"well": 0.75, "desal": 0.25})
      assert r.ecw == pytest.approx(2.8); assert r.lr == pytest.approx(0.28866, abs=1e-4)
      assert r.gross_l == pytest.approx(10957.3, rel=1e-3); assert r.cost_aed == pytest.approx(17.81, abs=0.02)
      assert not r.cap_exceeded and r.lr_cheapest_alone == pytest.approx(0.40449, abs=1e-4)
  def test_blend_fresh_well_uses_only_well():
      r = choose_blend([SourceOption("well", 1.0, 0.5), DESAL], 7.015, 1000, 2.5)
      assert r.fractions == {"well": 1.0, "desal": 0.0}
  def test_blend_infeasible_picks_lowest_ec_and_flags():
      r = choose_blend([SourceOption("w", 14.0, 0.5), SourceOption("w2", 13.0, 0.4)], 7.0, 1000, 2.5)
      assert r.cap_exceeded and r.fractions["w2"] == 1.0 and r.lr == 0.3 and math.isfinite(r.gross_l)
  def test_blend_zero_need():
      assert choose_blend([WELL, DESAL], 0.0, 1000, 2.5).gross_l == 0
  def test_split_minutes():
      assert split_minutes(43.83, {"well": 0.75, "desal": 0.25}, ["well", "desal"]) == [("well", 33), ("desal", 11)]
  ```
- [ ] **Step 2:** Run them and expect FAIL. Implement. Run them and expect PASS. Run `mypy --strict` and expect it clean.
- [ ] **Step 3:** Commit `feat(agronomy): cheapest salt-safe water blend`.

### Task 10: Agronomy — timing across blocks (Track 2)

**Files:**
- Create: `backend/milh/agronomy/timing.py`, `backend/tests/agronomy/test_timing.py`

**Interfaces:**
- Produces:
  ```python
  @dataclass(frozen=True)
  class BlockRun: block_id: str; minutes: int
  @dataclass(frozen=True)
  class ScheduledRun: block_id: str; start: datetime; end: datetime; slot: Literal["morning", "evening"]
  def schedule_runs(runs: list[BlockRun], sunrise: datetime, sunset: datetime, earliest_start: time,
                    morning_overrun: timedelta = timedelta(hours=2),
                    evening_offset: timedelta = timedelta(minutes=30)) -> list[ScheduledRun]
  ```
  Blocks run one at a time in the given order (MVP: one block at a time). Runs with 0 minutes are dropped. The morning start is `max(earliest_start on sunrise's date, sunrise − total_minutes)`. A run whose end would pass `sunrise + morning_overrun` and all runs after it go to the evening slot, starting at `sunset + evening_offset`, still one at a time. All datetimes keep sunrise's tzinfo.

- [ ] **Step 1: Write the failing tests** (tz = `ZoneInfo("Asia/Dubai")`, day 2026-11-16, sunrise 06:31, sunset 17:38)
  ```python
  def test_fits_before_sunrise():
      r = schedule_runs([BlockRun("b1", 38), BlockRun("b2", 50)], SUNRISE, SUNSET, time(5, 0))
      assert [(x.start.strftime("%H:%M"), x.end.strftime("%H:%M"), x.slot) for x in r] == \
             [("05:03", "05:41", "morning"), ("05:41", "06:31", "morning")]
  def test_overflow_to_evening():
      r = schedule_runs([BlockRun("b1", 120), BlockRun("b2", 90), BlockRun("b3", 60)], SUNRISE, SUNSET, time(5, 0))
      assert [(x.block_id, x.start.strftime("%H:%M"), x.slot) for x in r] == \
             [("b1", "05:00", "morning"), ("b2", "07:00", "morning"), ("b3", "18:08", "evening")]
  def test_zero_minute_runs_dropped():
      assert schedule_runs([BlockRun("b1", 0)], SUNRISE, SUNSET, time(5, 0)) == []
  ```
- [ ] **Step 2:** Run them and expect FAIL. Implement. Run them and expect PASS.
- [ ] **Step 3:** Commit `feat(agronomy): sunrise-anchored scheduling with worker hours`.

### Task 11: Agronomy — adaptive soil-test schedule (Track 2)

**Files:**
- Create: `backend/milh/agronomy/soil_schedule.py`, `backend/tests/agronomy/test_soil_schedule.py`

**Interfaces:**
- Produces:
  ```python
  @dataclass(frozen=True)
  class SoilResult: tested_on: date; ece: float; ph: float | None
  @dataclass(frozen=True)
  class SoilRules: near_ratio: float = 0.8; change_ratio: float = 0.15; ph_min: float = 6.0
                   ph_max: float = 8.5; short_days: int = 7; long_days: int = 14
  def next_soil_test(history: list[SoilResult], ece_threshold: float,
                     flush_since_last: bool, rules: SoilRules = SoilRules()) -> tuple[date, list[str]]
  ```
  `history` is ascending and non-empty. The function returns `(latest.tested_on + days, reasons)`. Reasons are drawn from `"first_tests"`, `"near_threshold"`, `"changed"`, `"ph_out_of_range"`, `"flush"`. If there are no reasons, `"stable"` is returned with `long_days`.

- [ ] **Step 1: Write the failing tests** (`a = 2.5`; `d0 = date(2026, 11, 1)`)
  ```python
  def r(days, ece, ph=7.5): return SoilResult(d0 + timedelta(days), ece, ph)
  def test_first_two_tests_short():   assert next_soil_test([r(0, 1.0), r(14, 1.0)], 2.5, False) == (d0 + timedelta(21), ["first_tests"])
  def test_near_threshold_short():    assert "near_threshold" in next_soil_test([r(0,1.5), r(7,1.6), r(14, 2.1)], 2.5, False)[1]
  def test_changed_short():           assert next_soil_test([r(0,1.2), r(7,1.2), r(14, 1.5)], 2.5, False)[0] == d0 + timedelta(21)
  def test_ph_short():                assert "ph_out_of_range" in next_soil_test([r(0,1.5), r(7,1.5), r(14,1.5, 8.7)], 2.5, False)[1]
  def test_flush_short():             assert "flush" in next_soil_test([r(0,1.5), r(7,1.5), r(14,1.5)], 2.5, True)[1]
  def test_stable_long():             assert next_soil_test([r(0,1.4), r(7,1.45), r(14, 1.5)], 2.5, False) == (d0 + timedelta(28), ["stable"])
  ```
- [ ] **Step 2:** Run them and expect FAIL. Implement. Run them and expect PASS.
- [ ] **Step 3:** Commit `feat(agronomy): adaptive 7/14-day soil testing`.

### Task 12: Agronomy — salt clock (Track 2; confirmed in scope)

**Files:**
- Create: `backend/milh/agronomy/salt_clock.py`, `backend/tests/agronomy/test_salt_clock.py`

**Interfaces:**
- Produces:
  ```python
  ECE_PER_ECW = 1.5   # FAO-29 rule of thumb, leaching fraction 15–20 %; cite in docstring
  def yield_pct(ece: float, a: float, b: float) -> float     # 100 - b*(ece-a), clamped to [0, 100]
  @dataclass(frozen=True)
  class SaltClock:
      status: Literal["collecting", "ok"]; n_readings: int; span_days: int
      slope_per_day: float | None; current_ecw: float | None; current_yield_pct: float | None
      date_loss_10: date | None; date_loss_25: date | None   # None if never (slope <= 0)
      suggested_crops: list[str]                            # crop keys with yield >= 90 % at horizon
  def salt_clock(readings: list[tuple[date, float]], crop: CropParams, library: dict[str, CropParams],
                 today: date, horizon_days: int = 730, min_readings: int = 4, min_span_days: int = 21) -> SaltClock
  ```
  The fit is ordinary least squares of EC on day number. `current_ecw` is the fitted value at `today`. A crossing date is `first_reading_date + round((ecw_target − intercept)/slope)` days, where `ecw_target = (a + loss/b)/ECE_PER_ECW`. If the crossing date is before `today`, `today` is returned (already crossed). Suggested crops are library crops ordered by yield at the horizon, highest first, excluding the current crop.

- [ ] **Step 1: Write the failing tests**
  ```python
  D0 = date(2026, 1, 1)
  READ = [(D0, 3.0), (D0 + timedelta(30), 3.1), (D0 + timedelta(60), 3.2), (D0 + timedelta(90), 3.3)]
  LIB = {"tomato": TOMATO, "date_palm": DATE_PALM, "barley": BARLEY}
  def test_salt_clock_date_palm():
      c = salt_clock(READ, DATE_PALM, LIB, today=D0 + timedelta(90))
      assert c.status == "ok" and c.current_ecw == pytest.approx(3.3)
      assert c.current_yield_pct == pytest.approx(96.58, abs=0.01)
      assert abs((c.date_loss_10 - date(2027, 4, 2)).days) <= 1
      assert abs((c.date_loss_25 - date(2029, 7, 13)).days) <= 1
      assert c.suggested_crops == ["barley"]
  def test_collecting_until_four_readings(): assert salt_clock(READ[:3], DATE_PALM, LIB, D0 + timedelta(90)).status == "collecting"
  def test_collecting_until_span(): 
      short = [(D0 + timedelta(i * 4), 3.0 + i * 0.1) for i in range(4)]
      assert salt_clock(short, DATE_PALM, LIB, D0 + timedelta(12)).status == "collecting"
  def test_falling_salinity_never_crosses():
      c = salt_clock([(d, 6.6 - ec) for d, ec in READ], DATE_PALM, LIB, D0 + timedelta(90))
      assert c.date_loss_10 is None
  def test_yield_clamped(): assert yield_pct(50, 2.5, 9.9) == 0.0 and yield_pct(1.0, 2.5, 9.9) == 100.0
  ```
- [ ] **Step 2:** Run them and expect FAIL. Implement. Run them and expect PASS.
- [ ] **Step 3:** Commit `feat(agronomy): salt clock trend and crop-switch suggestion`.

### Task 13: Planner — decision per block, fallbacks, explanation (Track 2)

**Files:**
- Create: `backend/milh/planning/core.py` (pure), `backend/milh/planning/explain.py`, `backend/milh/planning/planner.py` (DB), `backend/milh/api/plans.py`, `backend/tests/planning/test_core.py`, `backend/tests/planning/test_planner.py`

**Interfaces:**
- Consumes: Tasks 8–12, `latest_day_weather` (Task 5), `get_farm_settings` (Task 3), `raise_alert` (Task 4 stub).
- Produces (`core.py`):
  ```python
  @dataclass(frozen=True)
  class SourceState: option: SourceOption; ec_age_days: float | None; from_declared: bool
  @dataclass(frozen=True)
  class BlockInputs:
      block_id: str; crop: CropParams; days_after_planting: int; area_m2: float
      flow_l_per_h: float; efficiency: float; habit_minutes: int; habit_source_id: str
      sources: list[SourceState]        # only sources with a known EC (measured or declared)
      tap_order: list[str]; latest_ece: float | None; flush_due: bool
  @dataclass(frozen=True)
  class DayWeather: et0_mm: float; rain_mm: float; age_h: float
  @dataclass(frozen=True)
  class PlanSettings: lr_cap: float = 0.3; rain_threshold_mm: float = 5.0
                      flush_extra_mm: float = 20.0; stale_ec_days: int = 14
  @dataclass(frozen=True)
  class BlockPlan:
      block_id: str; minutes: int; steps: list[tuple[str, int]]; gross_l: float
      fractions: dict[str, float]; ecw: float | None; lr: float | None; cap_exceeded: bool; flush: bool
      habit_l: float; saved_l: float; saved_aed: float; habit_yield_pct: float | None; plan_yield_pct: float | None
      explanation: dict[str, Any]; fallbacks: list[str]
      skip_reason: Literal["rain", "no_need"] | None
  def plan_block(inp: BlockInputs, wx: DayWeather | None, s: PlanSettings, source_costs: dict[str, float]) -> BlockPlan
  ```
  **Rules:**
  - `wx is None` → habit plan, `fallbacks=["no_forecast"]`.
  - `inp.sources == []` → habit plan, `fallbacks=["no_water_ec"]`.
  - A habit plan has `minutes=habit_minutes`, `steps=[(habit_source_id, habit_minutes)]`, `saved_l=0`, `saved_aed=0`.
  - A source with `ec_age_days > stale_ec_days` or `from_declared` adds `"water_ec_stale:<id>"`.
  - `latest_ece is None` adds `"no_soil_test"` (info only).
  - `flush_due` adds `flush_extra_mm` to net and sets `flush=True`.
  - `habit_l = habit_minutes × flow/60`, and `saved_aed` = habit cost − blend cost.
  - `habit_yield_pct = yield_pct(ECE_PER_ECW × ec_of_habit_source, a, b)`. `plan_yield_pct` is 100.0 unless `cap_exceeded`, in which case it is `yield_pct(ECE_PER_ECW × ecw, a, b)`. The explanation labels both "estimate (FAO-29, ECe ≈ 1.5 × ECw)".
  - `net_mm == 0` with effective rain > 0 gives `skip_reason="rain"`; `net_mm == 0` without rain gives `"no_need"`. Both have `minutes=0`.
  - `explanation` holds the keys `et0, rain_eff, kc, stage, etc, net_mm, ecw, lr, lr_cheapest_alone, lr_cap, fractions, gross_l, minutes, habit_minutes, saved_l, saved_aed, habit_yield_pct, plan_yield_pct, flush, weather_age_h`.
- Produces (`explain.py`): `render_explanation(plan: BlockPlan, crop_name: str, source_names: dict[str, str], lang: str) -> str`. This is template text per language from `announcements/templates/<lang>.json` key `plan_explanation*`. EN example: `"{minutes} min instead of {habit_minutes}: ET₀ {et0} mm, {crop} at {stage} (Kc {kc}); water EC {ecw} so {lr_pct}% extra flushes salt; {mix_text}."`
- Produces (`planner.py`):
  - `plan_farm_day(session, farm_id: UUID, day: date, now: datetime) -> list[IrrigationPlan]`. It loads inputs:
    - latest `water_ec` reading per source, falling back to `declared_ec` with `from_declared=True`
    - latest SoilTest per block
    - `flush_due = latest_ece > crop.salt_a` and no plan with `flush=True` in the last 7 days
  - It calls `plan_block`, calls `schedule_runs` for the times, upserts the `IrrigationPlan` rows (unique block/day), fills `text[lang]` for each farm language with `render_explanation`, raises a `water_too_salty` alert when `cap_exceeded`, sets `Farm.needs_replan=False`, and calls `announcements.service.rebuild_day(session, farm_id, day)` (Task 14).
  - Endpoints: `GET /api/v1/farms/{id}/plans?day=`, `POST /api/v1/farms/{id}/plans/recompute?day=`, `GET /api/v1/farms/{id}/salt-clock?source_id=` (uses `salt_clock` with the current crop of the block that habitually uses that source).

- [ ] **Step 1: Write the failing tests (`test_core.py`)**. Base input: TOMATO at day 80, 1000 m², 15 000 L/h, efficiency 0.9, habit 60 min on well; WELL 3.6/0.5, DESAL 0.4/5.0; weather et0 6.1, rain 0.
  ```python
  def test_plan_block_happy_path():
      p = plan_block(BASE, DayWeather(6.1, 0.0, 1.0), PlanSettings(), COSTS)
      assert p.steps == [("well", 33), ("desal", 11)] and p.minutes == 44
      assert p.saved_l == pytest.approx(15000 - 10957.3, rel=1e-3)
      assert p.habit_yield_pct == pytest.approx(71.29, abs=0.01) and p.plan_yield_pct == 100.0
      assert p.fallbacks == ["no_soil_test"] and p.skip_reason is None
  def test_plan_block_no_water_ec_uses_habit():   # sources=[]
      p = plan_block(replace(BASE, sources=[]), WX, PlanSettings(), COSTS)
      assert p.minutes == 60 and p.steps == [("well", 60)] and "no_water_ec" in p.fallbacks
  def test_plan_block_no_forecast_uses_habit():   assert "no_forecast" in plan_block(BASE, None, PlanSettings(), COSTS).fallbacks
  def test_plan_block_rain_skips():
      p = plan_block(BASE, DayWeather(6.1, 12.0, 1.0), PlanSettings(), COSTS)
      assert p.minutes == 0 and p.steps == [] and p.skip_reason == "rain"
  def test_plan_block_flush_adds_water():
      assert plan_block(replace(BASE, flush_due=True), WX, PlanSettings(), COSTS).minutes > 44
  def test_plan_block_stale_ec_flagged():         # ec_age_days=20 on well
      assert "water_ec_stale:well" in plan_block(STALE, WX, PlanSettings(), COSTS).fallbacks
  def test_plan_block_cap_exceeded_raises_alert_reason():  # both sources EC 14/13
      p = plan_block(SALTY, WX, PlanSettings(), COSTS); assert p.cap_exceeded and p.plan_yield_pct < 100
  ```
- [ ] **Step 2:** Run them and expect FAIL. Implement `core.py`. Run them and expect PASS.
- [ ] **Step 3:** Write the failing DB tests (`test_planner.py`):
  - `test_plan_farm_day_upserts_one_per_block`: running it twice still gives 3 rows.
  - `test_plan_uses_declared_ec_when_no_reading`
  - `test_cap_exceeded_creates_alert`
  - `test_explanation_text_has_en_and_ur`: both strings contain `"44"`.
  - `test_recompute_endpoint_owner_only`
- [ ] **Step 4:** Implement `planner.py`, `explain.py` and the router. Run the tests and expect PASS.
- [ ] **Step 5:** Commit `feat: daily irrigation planner with explained fallbacks`.

### Task 14: Announcements — templates, build, schedule, DONE (Track 2 + Track 4 for template text)

**Files:**
- Create: `backend/milh/announcements/templates/en.json`, `backend/milh/announcements/templates/ur.json`, `backend/milh/announcements/templates.py`, `backend/milh/announcements/build.py`, `backend/milh/announcements/service.py`, `backend/milh/api/announcements.py`, `backend/milh/api/events.py`, `backend/tests/announcements/test_templates.py`, `backend/tests/announcements/test_build.py`, `backend/tests/api/test_events.py`

**Interfaces:**
- Produces:
  - Template keys (identical in every language file): `daily_briefing`, `daily_briefing_no_irrigation`, `briefing_block_line`, `briefing_block_skipped`, `irrigation_start`, `irrigation_switch_source`, `irrigation_stop`, `sunrise_soon`, `sunset`, `heat_warning`, `midday_break_start`, `midday_break_end`, `soil_test_due_tomorrow`, `soil_test_due_today`, `tank_low`, `water_ec_jump`, `water_too_salty`, `flush_day`, `data_stale`, `device_offline`, `plan_explanation`, `plan_explanation_habit_fallback`. Slots use `{name}` syntax. The Urdu text is drafted (Gemini may help with the draft offline) and checked by a team member who reads Urdu if one is available. Numbers stay as Western digits.
  - `render(key: str, lang: str, slots: dict[str, Any]) -> str`. Raises `KeyError` on a missing key or slot. `format_time(dt, lang) -> str` gives `"05:45"`.
  - `build_day(day: date, tz: ZoneInfo, runs: list[RunForAnnounce], sunrise: datetime, sunset: datetime, tmax_c: float | None, soil_due: list[tuple[str, date]], s: FarmSettings) -> list[AnnouncementDraft]`, where:
    - `RunForAnnounce(plan_id, block_name, crop_name, start, steps: list[tuple[str tap_label_by_lang, int minutes]], flush: bool, skipped: str | None)`
    - `AnnouncementDraft(type, scheduled_at, template_key, slots, plan_id | None)`
  - `build_day` rules:
    - Briefing at `s.briefing_time`.
    - For each run step: `irrigation_start` (first step) or `irrigation_switch_source` (later steps) at the step's start, and `irrigation_stop` at the run's end.
    - `sunrise_soon` at sunrise − 15 min; `sunset` at sunset.
    - `heat_warning` at 11:00 if `tmax_c ≥ s.heat_c`.
    - `midday_break_start` at 12:25 and `midday_break_end` at 15:00 when the day is within 15 Jun–15 Sep.
    - Soil due: `soil_test_due_tomorrow` at 07:00 on the day before, `soil_test_due_today` at 07:00 on the day.
    - `flush_day` at briefing + 1 min for each flush run.
  - `rebuild_day(session, farm_id, day)` cancels this day's unplayed non-custom announcements and recreates them from the plans, rendering `text[lang]` for the farm languages.
  - `announce_now(session, farm_id, type, slots)` is used by alerts.
  - Endpoints:
    - `POST /api/v1/farms/{id}/announcements` (owner custom text: `{text, lang, scheduled_at | None}`, `custom=True`; translation is Task 16)
    - `POST /api/v1/announcements/{id}/played`
    - `POST /api/v1/irrigation-events` (`IrrigationEventIn(id: UUID, plan_id?, block_id, source_id?, started_at, minutes, method)`, idempotent on `id`; it marks the matching start announcement `acknowledged`)

- [ ] **Step 1:** Write the failing tests:
  - `test_template_keys_match_across_languages`: the `en` and `ur` key sets are equal, and each template's slot names are equal across languages.
  - `test_render_missing_slot_raises`
  - `test_briefing_scheduled_in_farm_timezone`: the draft's `scheduled_at.astimezone(Dubai).strftime("%H:%M") == "05:15"` and `scheduled_at.utcoffset() == timedelta(hours=4)`.
  - `test_two_step_run_yields_start_switch_stop`: types `["irrigation_start", "irrigation_switch_source", "irrigation_stop"]` at 05:03, 05:36 and 05:47 for steps (33, 11) starting at 05:03.
  - `test_zero_minute_plan_has_no_start_stop`: a skipped run gives only the briefing line `briefing_block_skipped`.
  - `test_midday_break_only_in_summer`: present on 2026-07-01, absent on 2026-11-16.
  - `test_heat_warning_threshold`: 45.0 gives a warning, 44.9 does not.
  - `test_rebuild_day_cancels_unplayed_only`
  - `test_irrigation_event_idempotent_and_acknowledges`
- [ ] **Step 2:** Implement. Run the tests and expect PASS.
- [ ] **Step 3:** Commit `feat: announcement templates, day builder, DONE events`.

### Task 15: ElevenLabs TTS with cache (Track 4)

**Files:**
- Create: `backend/milh/announcements/tts.py`, `backend/tests/announcements/test_tts.py`. Modify `service.py` to attach audio.

**Interfaces:**
- Produces:
  ```python
  class TtsClient(Protocol):
      def synthesize(self, text: str, lang: str) -> bytes: ...
  class ElevenLabsTts:   # POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}, header xi-api-key,
      def __init__(self, api_key: str, model_id: str, voice_ids: dict[str, str], http: httpx.Client): ...
      # json {"text", "model_id"}, accept audio/mpeg; voice per lang from voice_ids; KeyError if lang missing
  def audio_for(text: str, lang: str, tts: TtsClient, media_dir: Path, voice_key: str) -> str
      # cache key sha256(f"{lang}|{voice_key}|{text}") -> "audio/<hex>.mp3"; write once; return relpath
  def attach_audio(session, announcement: Announcement, tts: TtsClient | None, media_dir: Path) -> None
      # fills Announcement.audio[lang] for each lang in text; tts None or failure -> leaves missing (kiosk shows text + chime)
  ```
  The API serves `media_dir` at `/media` (StaticFiles). The worker runs a `generate_missing_audio` job every 2 minutes.
- **Day-1 check (manual):** generate `irrigation_start` in `ur` and `en` with the chosen model and voice. Listen for numbers and times. If Urdu is poor, switch the `ur` voice to a Hindi voice per §8 of the spec and record the decision in `docs/decisions.md`.

- [ ] **Step 1:** Write the failing tests:
  - `test_audio_for_caches`: a fake TTS counts calls; calling twice with the same text gives 1 call and the same path.
  - `test_elevenlabs_request_shape`: respx asserts the URL contains the voice id, the header `xi-api-key` is present and the JSON `model_id` matches.
  - `test_attach_audio_tolerates_failure`: the fake raises, `audio` stays empty and no exception propagates.
- [ ] **Step 2:** Implement. Run the tests and expect PASS. Do the manual day-1 check with the real key from `.env`.
- [ ] **Step 3:** Commit `feat: ElevenLabs announcement audio with cache`.

### Task 16: Gemini — wording and translation (Track 4)

**Files:**
- Create: `backend/milh/ai/__init__.py`, `backend/milh/ai/gemini.py`, `backend/tests/ai/test_gemini.py`. Modify `planner.py` (optional rephrase) and the announcements custom endpoint (translate).

**Interfaces:**
- Produces:
  ```python
  class GeminiService:
      def __init__(self, api_key: str | None, model: str, client: Any | None = None): ...  # google-genai Client
      def rephrase(self, explanation: dict[str, Any], template_text: str, lang: str) -> str | None
      def translate(self, text: str, target_lang: str) -> str | None
  ```
  Both return `None` when there is no key or the call fails (logged). `rephrase` returns `None` unless the output contains `str(explanation["minutes"])` and `str(explanation["habit_minutes"])` (the numbers guard) and is at most 300 characters. The planner stores the rephrased text in `text[lang]` when it is not None; otherwise it keeps the template text. Custom announcements are translated into every farm language other than the source; on `None` the original text is used and marked `untranslated`.

- [ ] **Step 1:** Write the failing tests (a fake client object):
  - `test_rephrase_rejects_output_missing_numbers`
  - `test_rephrase_accepts_valid`
  - `test_no_key_returns_none`
  - `test_translate_failure_falls_back_untranslated` (through the API)
- [ ] **Step 2:** Implement. Run the tests and expect PASS.
- [ ] **Step 3:** Commit `feat: Gemini wording and translation with numbers guard`.

### Task 17: Kiosk bundle endpoint (Track 1)

**Files:**
- Create: `backend/milh/api/kiosk.py`, `backend/milh/schemas/kiosk.py`, `backend/tests/api/test_kiosk.py`

**Interfaces:**
- Produces `GET /api/v1/kiosk/bundle` (worker or owner token; the farm comes from the token or `?farm_id`), returning `KioskBundle`:
  ```
  { farm: {id, name, timezone, languages, example_label?},
    day: "YYYY-MM-DD" (farm-local), generated_at,
    weather: {current, daily[7], fetched_at, age_h, source} | null,
    sun: {sunrise, sunset} | null,
    runs: [{plan_id, block_id, block_name, crop_name, slot, start, end, minutes, steps:[{source_id, tap_label, tap_color, minutes}], flush, skip_reason, text: {lang: str}, fallbacks}],
    announcements: [{id, type, scheduled_at, text: {lang}, audio: {lang: url}, status}],
    tanks: [{id, name, level_pct | null, volume_l | null, measured_at | null, source}],
    sources: [{id, name, ec | null, ec_measured_at | null, trend: "up"|"down"|"flat"|null, stale: bool}],
    blocks: [{id, name, crop_name, soil: {ece, ph, moisture_vwc, tested_on, status: "ok"|"warn"|"high"|"none"}, next_test_due | null, next_test_reasons}],
    alerts: [{id, severity, type, message: {lang}, created_at}],
    freshness: [{item, age_h, stale: bool}] }
  ```
  Soil status: `none` with no test; `high` when ece > a; `warn` when ece ≥ 0.8a; otherwise `ok`. Trend comes from the last 3 readings (more than 5 % change counts as up or down).

- [ ] **Step 1:** Write the failing tests:
  - `test_bundle_day_uses_farm_timezone`: at `now` = 2026-11-16 21:30 UTC, `day == "2026-11-17"` for Dubai.
  - `test_bundle_empty_states`: a fresh farm gives `weather is None`, tank `level_pct is None` and soil `status == "none"`, never 0.
  - `test_bundle_includes_audio_urls`
  - `test_worker_token_cannot_fetch_other_farm`
- [ ] **Step 2:** Implement. Run the tests and expect PASS.
- [ ] **Step 3:** Commit `feat: kiosk bundle endpoint`.

### Task 18: Web scaffold — API client, auth, i18n with RTL (Track 3)

**Files:**
- Create: `web/src/api/client.ts`, `web/src/api/hooks.ts`, `web/src/api/schema.d.ts` (generated), `web/src/i18n/{index.ts,en.json,ur.json}`, `web/src/routes.tsx`, `web/src/App.tsx`, `web/src/owner/Login.tsx`, `web/src/kiosk/KioskLogin.tsx`, `web/src/i18n/i18n.test.tsx`

**Interfaces:**
- Produces:
  - `api<T>(path: string, init?: RequestInit): Promise<T>`. Adds the bearer token from `localStorage["milh.token"]` and throws `ApiError(status, body)`.
  - TanStack Query hooks: `useFarms`, `useFarm(id)`, `useWeather(farmId)`, `usePlans(farmId, day)`, `useKioskBundle()`, `useSaltClock(farmId, sourceId)`, `useReport(farmId, from, to)`.
  - `setLanguage(lang)` sets `document.documentElement.dir` (`rtl` for `ur` and `ar`) and `lang`.
  - Routes: `/login` and `/owner/*` (role owner or admin), `/kiosk/login` (device key from `localStorage["milh.deviceKey"]` plus PIN pad), and `/kiosk` (role worker).

- [ ] **Step 1:** Write the failing tests:
  - `i18n.test.tsx › sets dir=rtl for ur and ltr for en`
  - `client.test.ts › throws ApiError with status on 401`
- [ ] **Step 2:** Implement. Run `npx vitest run` and expect PASS.
- [ ] **Step 3:** Commit `feat(web): API client, auth routes, i18n with RTL`.

### Task 19: Kiosk dashboard (Track 3)

**Files:**
- Create: `web/src/kiosk/KioskApp.tsx`, `web/src/kiosk/panels/{WeatherBar,TodayPanel,WaterPanel,SoilPanel,AnnouncementBar}.tsx`, `web/src/kiosk/KioskApp.test.tsx`

**Interfaces:**
- Consumes: `KioskBundle` (Task 17), `useKioskBundle` (refetch every 5 min).
- Layout as in spec §7.1:
  - landscape grid, at least 48 px touch targets, an icon + colour + text status
  - a 🔊 button on every panel
  - a language switcher
  - source labels on tap ("Source: Open-Meteo · 12 min ago")
  - empty states use i18n keys `empty.noReading`, `empty.noTest`, `empty.noForecast`
  - fallback badges render `fallbacks` as plain-language chips

- [ ] **Step 1:** Write the failing tests (render with a fixture bundle object):
  - `shows "No test yet" when soil status none`
  - `renders two step rows with tap labels for a blended run`
  - `shows forecast age badge when age_h > 6`
  - `skipped block shows rain icon and no DONE button`
- [ ] **Step 2:** Implement. Run the tests and expect PASS.
- [ ] **Step 3:** Commit `feat(web): kiosk dashboard panels`.

### Task 20: Kiosk entry, DONE, audio player (Track 3)

**Files:**
- Create: `web/src/kiosk/UnlockScreen.tsx`, `web/src/kiosk/NumberPad.tsx`, `web/src/kiosk/ReadingEntry.tsx`, `web/src/kiosk/player.ts`, `web/src/kiosk/player.test.ts`, `web/src/kiosk/NumberPad.test.tsx`, `web/public/chime.mp3` (a short chime from a CC0 source, credited in `web/public/CREDITS.md`)

**Interfaces:**
- Produces:
  - `NumberPad({ value, onChange, decimals = 2, max })`.
  - `ReadingEntry({ metric })` for `water_ec`, `tank_level_pct` and `flow_l`. It picks the source or tank by icon and colour, generates `reading_id = crypto.randomUUID()`, and POSTs `/api/v1/readings` (Task 21 queues it when offline).
  - DONE button: POSTs `/api/v1/irrigation-events` with `id = randomUUID()`.
  - `createPlayer({ now, setTimer, play }): Player`, where `Player.unlock(): void`, `Player.load(announcements, lang): void` (schedules future items, skips any more than 10 min late, de-duplicates by id) and `Player.onBlocked(cb)`.
  - `UnlockScreen` is a full-screen "Tap to start 🔊" shown until `unlock()`.

- [ ] **Step 1:** Write the failing tests:
  - `player.test.ts › refuses to schedule before unlock and shows banner on NotAllowedError`
  - `player.test.ts › schedules only future items and plays chime then audio`
  - `player.test.ts › reloading same announcements does not double-schedule`
  - `NumberPad.test.tsx › rejects value above max and more decimals`
- [ ] **Step 2:** Implement. Run the tests and expect PASS.
- [ ] **Step 3:** Commit `feat(web): kiosk entry, DONE and scheduled audio`.

### Task 21: Kiosk offline cache (Track 3, P0)

**Files:**
- Create: `web/src/kiosk/offline.ts`, `web/src/kiosk/offline.test.ts`, `web/src/sw.ts`. Modify `vite.config.ts` (vite-plugin-pwa `injectManifest`).

**Interfaces:**
- Produces:
  - Dexie DB `milh` with tables `bundles(day)`, `audio(url → Blob)` and `outbox(id)`. The outbox is used by Task 27; create the table now.
  - `cacheBundle(b: KioskBundle): Promise<void>` stores the bundle and fetches every audio URL as a Blob.
  - `loadCachedBundle(day: string): Promise<KioskBundle | undefined>`.
  - `audioUrl(url): Promise<string>` returns an object URL from the cache, falling back to the network.
  - The service worker precaches the app shell. `useKioskBundle` falls back to `loadCachedBundle(today)` on a network error and shows an "Offline · data from HH:MM" badge.

- [ ] **Step 1:** Write the failing tests (fake-indexeddb):
  - `cacheBundle stores bundle and all audio blobs`
  - `loadCachedBundle returns undefined for other day`
  - `player uses cached audio when offline`
- [ ] **Step 2:** Implement. Run the tests and expect PASS. Manual check: `npm run build && npx vite preview`, open `/kiosk`, load the page, then switch DevTools to Offline and reload. The dashboard renders and a scheduled test announcement plays.
- [ ] **Step 3:** Commit `feat(web): kiosk offline cache`.

### Task 22: Owner views (Track 3)

**Files:**
- Create: `web/src/owner/{OwnerLayout,FarmList,FarmDashboard,PlanDetail,SetupForms,SoilTests,ImportCsv,SaltClockPanel,Alerts}.tsx`, plus tests `web/src/owner/PlanDetail.test.tsx` and `web/src/owner/ImportCsv.test.tsx`

**Interfaces:**
- Consumes: Tasks 3, 4, 5, 7, 12, 13 and 24 endpoints.
- Screens:
  - Farm list with a status dot from alerts.
  - Farm dashboard with the same panels as the kiosk plus charts (Recharts): 7-day ET₀ and tmax, tank level history, water EC per source, soil ECe per block.
  - Plan detail: steps, `text[lang]`, the explanation table, fallbacks, habit vs plan (litres, AED, yield estimate), and a "Recompute" button.
  - Setup forms for farm, blocks, sources (including tap label and colour) and tanks, plus settings.
  - Soil tests: list and form, with next due date and reasons.
  - CSV import: template download links, upload, dry-run table with errors, a "Published data (citation required)" checkbox, and Commit.
  - Salt clock: trend chart, "Collecting (n/4)" state, loss dates, suggested crops.
  - Alerts list with Resolve.
  - Custom announcement form.
  - The example-farm label banner when present.

- [ ] **Step 1:** Write the failing tests:
  - `PlanDetail shows fallback chips and habit comparison`
  - `ImportCsv shows row errors and disables commit until clean`
- [ ] **Step 2:** Implement. Run the tests and expect PASS.
- [ ] **Step 3:** Commit `feat(web): owner dashboard, setup, imports, salt clock`.

### Task 23: Reports (Track 1)

**Files:**
- Create: `backend/milh/reports.py`, `backend/milh/api/reports.py`, `backend/tests/test_reports.py`. Modify `web/src/owner/Reports.tsx`.

**Interfaces:**
- Produces `water_report(session, farm_id, start: date, end: date) -> WaterReport`, where `WaterReport(days: list[DayRow(day, planned_l, actual_l | None, habit_l, saved_l, saved_aed, adherence_pct | None)], totals)`. `actual_l` comes from `IrrigationEvent.minutes × flow/60`.
- Endpoints: `GET /api/v1/farms/{id}/reports/water?from&to` (JSON) and `…/water.csv`.

- [ ] **Step 1:** Write the failing tests:
  - `test_report_sums_planned_vs_habit`
  - `test_adherence_none_without_events`
  - `test_csv_header_and_rows`
- [ ] **Step 2:** Implement. Run the tests and expect PASS. Commit `feat: water report`.

### Task 24: Alerts and scheduled jobs (Track 1)

**Files:**
- Create: `backend/milh/alerts.py` (replaces the stub, keeping the signature), `backend/milh/jobs.py`, `backend/milh/worker.py`, `backend/tests/test_alerts.py`, `backend/tests/test_jobs.py`

**Interfaces:**
- Produces:
  - `raise_alert(session, farm_id, type, severity, slots) -> Alert`. De-duplicates an unresolved alert of the same type and subject, renders `message[lang]` from the templates, and calls `announce_now` for the worker-facing types `tank_low`, `water_ec_jump`, `data_stale` and `device_offline`.
  - `check_staleness(session, farm, now) -> list[Alert]`: tank reading older than 48 h, device `last_seen_at` older than 24 h, soil test overdue by 2 days or more (owner-only alert).
  - Jobs registered in `jobs.register(scheduler, session_factory, http, tts, gemini)`:
    - `refresh_weather` every 60 min per farm
    - `refresh_soil_profile` daily
    - `daily_plan` at 03:00 farm-local per farm
    - `replan_dirty` every 2 min for farms with `needs_replan`
    - `generate_missing_audio` every 2 min
    - `check_staleness` every 15 min
  - `worker.py` builds the dependencies from `Settings` and starts a `BlockingScheduler`.

- [ ] **Step 1:** Write the failing tests:
  - `test_alert_dedup`
  - `test_tank_stale_after_48h`
  - `test_soil_overdue_owner_only_no_announcement`
  - `test_daily_plan_job_runs_at_local_3am` (the trigger's next fire time in Dubai is 03:00)
  - `test_replan_dirty_clears_flag`
- [ ] **Step 2:** Implement. Run the tests and expect PASS. Manual check: `docker compose up worker` and watch the logs show the weather refresh.
- [ ] **Step 3:** Commit `feat: alerts and worker jobs`.

### Task R1: Find and cite real published data (Track 4 or Track 1, starts hour 0)

**Files:**
- Create: `data/published/SOURCES.md`, `data/published/<site>_water_ec.csv`, `data/published/<site>_soil_tests.csv` (Task 7 template format)

**Requirements:**
- Search for published, citable UAE or Gulf data. Candidate publishers to search: Environment Agency – Abu Dhabi (groundwater and soil survey reports), ICBA, UAE Ministry of Climate Change and Environment, and peer-reviewed papers on groundwater salinity in Al Ain, Liwa or the Batinah coast. Look for:
  1. Groundwater EC (or TDS with a stated conversion) for a farm area. Ideally a **time series of at least 4 dates spanning at least 3 weeks** (multi-year series are ideal) for the salt clock.
  2. Soil ECe and pH for agricultural soils near the same area.
- Every CSV row's `note` holds `Author/Org (Year). Title. Table/Figure X. URL`. `SOURCES.md` lists each source with what was taken and any conversion (e.g. TDS mg/L ÷ 640 → dS/m, with that factor cited).
- **No value without a source. Do not interpolate or extrapolate.** If no time series is found, record that in `SOURCES.md`. The salt clock then honestly shows "Collecting readings (n/4)" in the demo, and the pitch says so.
- Set `Block`/`WaterSource` `declared_ec` in `demo_farm.json` only from a cited value, or leave it null.

- [ ] **Step 1:** Research and fill `SOURCES.md`.
- [ ] **Step 2:** Write the CSVs. Run them through `POST /imports?dry_run=true&published=true` and expect zero errors.
- [ ] **Step 3:** Commit `data: cited published salinity and soil data`.

### Task 31: Demo script and end-to-end smoke test (Track 4, final hours)

**Files:**
- Create: `docs/demo-script.md`, `backend/tests/test_e2e_flow.py`

**Interfaces:**
- `test_e2e_flow.py` uses the API only:
  - create an owner, `load-farm`, inject a weather snapshot from the test fixture, POST two water EC readings and one soil test, `recompute`
  - assert plans exist with non-empty `text.en` and `text.ur`
  - assert the announcements include a briefing and irrigation_start
  - POST a DONE event, then assert the report's `actual_l` is greater than 0
- `demo-script.md` follows spec §10. It names which numbers are live and which are cited, includes the offline toggle step, and has the one-minute "why this angle" pitch.

- [ ] **Step 1:** Write the e2e test. Run it and expect PASS.
- [ ] **Step 2:** Do a full run-through on the demo laptop with live Open-Meteo and real keys. Record a backup video.
- [ ] **Step 3:** Commit `docs: demo script and e2e smoke test`.

---

## P1 tasks (only if time allows, in this order)

### Task 25: MQTT bridge

- **Files:** `backend/milh/ingestion/mqtt_bridge.py`, `backend/tests/ingestion/test_mqtt_bridge.py`. Add a Compose service `mqtt-bridge` (`python -m milh.ingestion.mqtt_bridge`).
- **Interfaces:** subscribes to `milh/+/+/+` (`milh/{farm_id}/{device_id}/{metric}`). The payload is `{"value", "unit", "measured_at", "reading_id"?}`. `handle_message(session, topic: str, payload: bytes) -> IngestResult` checks that the device belongs to the farm (a device API key in the payload field `key` is required in MVP), then calls `ingest` with provenance `device:<id>`.
- [ ] Tests: `test_topic_parsed_and_ingested`, `test_wrong_farm_rejected`, `test_bad_json_rejected_without_crash`. Implement. Pass. Commit `feat: MQTT ingestion bridge`.

### Task 26: Gemini lab-report reader

- **Files:** modify `backend/milh/ai/gemini.py`. Create `backend/milh/api/lab.py`, `web/src/owner/LabReport.tsx` and tests.
- **Interfaces:**
  - `GeminiService.extract_lab_report(data: bytes, mime_type: str) -> LabReportExtract | None`, with structured output `LabReportExtract(tested_on: date | None, lab: str | None, samples: list[{label, ece | None, ec_1to5 | None, ph | None, moisture_vwc | None}], water: list[{label, ec | None}])`.
  - `POST /api/v1/farms/{id}/lab-report` (multipart image or PDF) returns the extract preview and stores the file under `media/uploads/`. **It saves nothing as data.** The owner maps the samples to blocks, edits them and confirms. The confirmation goes through `POST /soil-tests` and `/readings` with provenance `gemini_extract`, `confirmed_by_user_id` and `attachment_path`.
- [ ] Tests: `test_extract_preview_saves_no_readings`, `test_confirm_sets_gemini_provenance`. Implement. Pass. Commit `feat: Gemini lab-report reader with human confirmation`.

### Task 27: Offline outbound queue

- **Files:** modify `web/src/kiosk/offline.ts` and `ReadingEntry.tsx` (DONE). Create `web/src/kiosk/outbox.test.ts`.
- **Interfaces:** `enqueue(req: {id, path, body}): Promise<void>` and `flushOutbox(): Promise<{sent, failed}>`, run on `online` events and every 60 s. The server's idempotency (Tasks 4 and 14) makes retries safe. The badge shows "n waiting to send".
- [ ] Tests: `queued reading is sent once when back online`, `server duplicate response removes item`. Implement. Pass. Commit.

### Task 28: Arabic and Hindi

- Add `templates/ar.json`, `templates/hi.json`, `web/src/i18n/ar.json` and `hi.json`, and ElevenLabs voice IDs. `test_template_keys_match_across_languages` covers the new files automatically. Commit.

### Task 29: Web push to the owner

- VAPID keys in `.env`; `POST /api/v1/push/subscribe`; `raise_alert` sends a push for `warning` and `critical` alerts (pywebpush). Test with a mocked sender. Commit.

---

## Self-review notes (done at writing time)

- **Spec coverage:**
  - §7.1 → Tasks 17, 19, 22
  - §7.2 → Tasks 8–10, 13
  - §7.3 → Task 11 (+ due reminders in 14 and 24)
  - §7.4 → Task 12 (+ endpoint in 13, UI in 22)
  - §7.5 → Tasks 14, 15, 16, 20
  - §7.6 → Tasks 4, 7, 25, 26
  - §7.7 → Task 3
  - §7.8 → Task 23
  - §5 policy → Global Constraints, Tasks 3, 4, 7, 17, R1
  - §8 → Tasks 0, 2, 24
  - §10 → Task 31
  - §6 offline → Task 21 (P0) and Task 27 (P1)
  - SoilGrids → Task 6
- **Additions beyond the spec, flagged for the team:**
  - The yield estimate in the habit comparison: habit vs. plan yield %, an FAO-29 rule of thumb shown as an estimate. It's there because with realistic costs the blend can cost more AED than the habit while saving water, so the yield protection is the honest counterweight.
  - `flush_extra_mm = 20` needs agronomic verification by the team.
  - Each source needs a `tap_label`.
