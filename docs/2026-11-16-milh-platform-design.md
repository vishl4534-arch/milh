# Milh — Desert Farm Operations Platform

**Design document · Hackathon track A-001 "Smart Farming for the Desert" · 16 Nov 2026**
*Working name: "Milh" (ملح, Arabic for "salt").*

---

## 1. In one paragraph

Milh is a farm operations platform for desert farms that irrigate from salty (brackish) wells. It connects the **owner**, who makes decisions but is usually not on the farm, with the **worker**, who is on the farm and opens the valves. A dashboard at the farm shows the weather forecast, water levels, water and soil condition. Every morning the platform turns that data into one decision, **how long to irrigate each block and from which water source**, and explains why. An **announcement system** speaks that schedule out loud in the worker's language, together with sunrise and sunset times, heat warnings, the next soil test date and other alerts. Soil is retested every **7 or 14 days, depending on what the last test showed**. The platform never invents data. Weather and sun times come from live sources, and farm readings are entered manually, imported from files, or sent by sensors through an open API.

---

## 2. Why this, and the problem inside the problem

Most entries will treat desert farming as "how much water does the crop need". We aim at three gaps behind that question:

1. **The water is salty, and salt is the hidden cause of overwatering.** Many Gulf farms irrigate from brackish wells that get saltier every year. Salt builds up around the roots, so growers add extra water to flush it out. Nobody tells them how much is enough, so they guess generously. Milh calculates the right amount of flushing water (the "leaching requirement") and the cheapest mix of well and desalinated water.
2. **The person who decides is not the person who acts.** The owner's habit ("60 minutes every day") reaches the worker once and is never updated. The worker often doesn't read Arabic or English. Milh brings each day's decision to the person holding the valve, spoken in their language, and records what was actually done.
3. **Salinity is noticed after the harvest fails.** The "salt clock" follows the trend in well salinity and warns, a season or two in advance, when the current crop will start losing yield, and what to plant instead.

**What the grower does today vs. what Milh does:**

| | Grower's habit | Milh |
|---|---|---|
| How long to irrigate | Same minutes every day, all year | Changes daily with the forecast, crop stage and salinity |
| Salt flushing | Extra water "just in case" | Calculated leaching requirement, or a flush on a set day |
| Water source | Whatever is cheapest or on hand | Cheapest blend that keeps root salinity under the crop's limit |
| Soil testing | Rarely, or after a problem shows | Every 7 or 14 days, set by the last result |
| Reaching the worker | Verbal, once | Daily spoken announcement in the worker's language, confirmed when done |
| Crop choice | By habit | Salt-clock forecast with a suggested switch date and crop |

---

## 3. Users and roles

| Role | Who | Where | Device | Main needs |
|---|---|---|---|---|
| **Worker** | Farm labourer or foreman; may not read; speaks Urdu, Hindi, Malayalam, Bengali, Arabic or English | On the farm | Shared farm tablet in **kiosk mode**, with a speaker, plus their own phone (optional) | What to do today, when, and on which block; hear it spoken; enter readings without typing; confirm tasks are done |
| **Owner** | Farm owner or manager; may run several farms | Usually away from the farm | Phone or laptop | Overview of all farms, alerts, settings (crops, blocks, water sources, costs), reports on water and money saved |
| **Admin** | Platform operator | Anywhere | Laptop | Manage users, devices, API keys and the crop library |

*Future role (not in scope): an agricultural adviser covering many farms.*

---

## 4. Goals, non-goals, anti-goals

**Goals**
- G1. A live dashboard for each farm: weather now and 7 days ahead, sunrise and sunset, water levels, water salinity, soil condition per block, today's irrigation schedule and announcements.
- G2. A daily irrigation decision for each block (minutes and water-source mix) with a plain-language "why", compared with the grower's habit.
- G3. A soil-testing schedule that adapts (7 or 14 days) to the previous result.
- G4. A scheduled, spoken, multilingual announcement system on the farm kiosk.
- G5. Three ways to inject data (UI forms, CSV import, REST/MQTT API) and the same validation and records for all three.
- G6. Industry-grade engineering: typed code, migrations, tests, role-based access, logging, containerised deployment, documented API.
- G7. Keeps working on a weak or dropped connection.

**Non-goals (for the hackathon build)**
- Physical sensor hardware. The API is ready for it, but we won't build devices.
- Automatic valve control. Milh advises and the worker acts, so there is no actuation.
- A real WhatsApp Business integration (stretch only).
- The shared multi-farm aquifer salinity map (pitched as the next step).
- Payments, billing, marketplace.

**Anti-goals: the build fails if any of these happen, even if it "works"**
- **A1. Fake data presented as real.** No hidden simulators and no random-number sensors. If a value is missing, the UI says so.
- A2. A worker-facing screen that needs reading skill to use.
- A3. A dashboard that goes blank when the internet drops.
- A4. A recommendation the platform cannot explain.
- A5. A cost to the grower beyond a basic tablet and a ~AED 50–150 meter.

---

## 5. Data policy: real or injected, never simulated

This is a hard rule for the whole build.

1. **Live external data:** weather forecast, observed weather, reference evapotranspiration (ET₀), sunrise and sunset. These come from the **Open-Meteo Forecast API** (free, no key), which returns `et0_fao_evapotranspiration`, `sunrise`, `sunset`, temperature, humidity, wind, radiation and precipitation for a latitude and longitude.
2. **Injected farm data:** water level, well and source salinity (EC), soil tests, flow-meter readings and irrigation actually done. These enter only through the injection channels in §7.6.
3. **Provenance on every value.** Every stored reading records its `source` (`api:open-meteo`, `manual`, `csv_import`, `device:<id>`), who or what submitted it, the time it was measured and the time it was received. The UI shows this on hover or tap.
4. **Empty states, not defaults.** With no soil test, the soil panel shows "No test yet. Add one" and the engine falls back to a stated conservative rule. It never falls back to an invented value.
5. **Reference data is not farm data.** Crop coefficients (FAO-56) and salt-tolerance values (FAO-29) are published reference tables, stored in the crop library and cited in the UI.
6. **Demo data must be real.** The team has no farm and no meter, so the demo uses **real published and open data, entered through the same injection paths a real farm would use**, with the source cited on screen:
   - **Weather, ET₀, sunrise and sunset:** live from Open-Meteo for the demo farm's real coordinates (e.g. Al Ain). Past real weather for the habit comparison comes from the Open-Meteo Historical Weather API.
   - **Soil properties (texture, pH, etc.):** the ISRIC **SoilGrids** API for the same coordinates (real modelled soil data; no salinity layer).
   - **Water and soil salinity, including a multi-year well-salinity series for the salt clock:** values taken from published UAE groundwater and soil surveys and studies (e.g. Environment Agency – Abu Dhabi, ICBA, peer-reviewed papers). They are imported as CSV with the citation stored in each reading's `note`. **Finding and checking these sources is the first build task**; no number goes in without a citation.
   - **Farm setup** (block sizes, crops, emitter flow, water costs, habit routine) is configuration, not measurement. The demo calls it "an example farm setup" out loud.
   - **Optional:** a basic EC/TDS pen costs about AED 30–60 online. If the team buys one, a live on-stage measurement of tap water vs. salted water makes the injection demo stronger, but it is not required.

---

## 6. Desert rules: how Milh meets them

| Rule | How |
|---|---|
| **Water is the scarcest input** | Irrigation sized to the forecast instead of habit. Leaching water calculated rather than guessed. Expensive desalinated water used only as far as it is needed. Irrigation timed around sunrise to cut evaporation. Every day's savings in litres and AED compared with the declared habit. |
| **Weak connectivity and little time** | The kiosk is an offline-capable PWA that caches the forecast, schedule and announcements for the day. Worker inputs are queued and synced later. Announcements are generated and played on the device, so they need no network. The worker's daily interaction is a few taps, or a spoken number. |
| **Affordable** | Open-source stack, self-hostable on a small VPS or a mini-PC at the farm. Hardware is a ~AED 400 tablet plus a ~AED 50–150 EC meter. Sensors are optional. |

---

## 7. Features

### 7.1 Farm dashboard (worker kiosk and owner view)

The same data appears in two layouts.

**Worker kiosk (on the farm, landscape tablet, large icons, little text):**
```
┌──────────────────────────────────────────────────────────────┐
│  ☀ 41°C  💧18%  🌬 12 km/h      🌅 06:31   🌇 17:38   [اردو ▾] │
├───────────────────────────┬──────────────────────────────────┤
│  TODAY                    │  WATER                           │
│  ▶ Block 3 · Tomato       │  Tank   ███████░░░  68%          │
│    05:45 – 06:23  38 min  │  Well   EC 3.6 ▲                 │
│    🔵 80% well 20% desal  │  Desal  EC 0.4                   │
│    [ ✔ DONE ]  [ 🔊 ]      │                                  │
│  ▷ Block 1 · Dates 06:30  │  SOIL                            │
│                           │  B3  ⚠ salt rising · test in 3d  │
├───────────────────────────┴──────────────────────────────────┤
│  📢 Heat warning: no outdoor work 12:30–15:00     [ 🔊 Play ] │
└──────────────────────────────────────────────────────────────┘
```
- Every panel has a 🔊 button that reads it aloud in the selected language.
- Status uses colour **and** an icon (✔ ⚠ ✖), never colour alone.
- Data entry is a large number pad, with optional voice entry (stretch).

**Owner view (phone or laptop):** a list of farms with status, the same panels with charts (7-day forecast, tank level history, salinity trend, soil-test history), the irrigation plan with its full reasoning, a log of irrigation done vs. planned, reports and settings.

**Widgets:**

| Widget | Shows | Source |
|---|---|---|
| Weather now | Temp, humidity, wind, radiation | Open-Meteo current |
| Forecast | 7-day max/min, ET₀, rain chance, heat days | Open-Meteo daily |
| Sun | Sunrise, sunset, day length | Open-Meteo daily |
| Water levels | Tank %, volume; well depth (if measured) | Injected |
| Water quality | EC of each water source, trend arrow | Injected |
| Soil per block | Latest EC (ECe or 1:5), moisture, pH, test date, status, next test due | Injected |
| Today's plan | Per block: start, duration, source mix, reason | Engine |
| Announcements | Today's feed with playback | Announcement service |
| Data freshness | Age of every input; flags stale data | System |

### 7.2 Irrigation decision engine

Runs every day (default 03:00 local) and whenever new data arrives (a new forecast, soil test or water-EC reading). For each block:

1. **Crop water need.** `ETc = ET₀ × Kc(stage)`, with ET₀ from Open-Meteo (FAO Penman-Monteith) and Kc from the FAO-56 crop library based on the block's planting date.
2. **Net irrigation.** `Net = ETc − effective rain` (rain under 5 mm/day is ignored as ineffective in sandy soil; the builder may refine this).
3. **Leaching requirement.** `LR = ECw / (5·ECe_t − ECw)` (FAO-29), where `ECw` is the salinity of the irrigation water (blended) and `ECe_t` is the crop's salinity threshold.
4. **Gross volume.** `Gross = Net / ((1 − LR) × Ea)`, where `Ea` is the application efficiency of the irrigation system (drip default 0.9).
5. **Runtime.** `minutes = Gross × block_area / system_flow_rate`.
6. **Water-source blend.** When a farm has two or more sources, choose the cheapest fraction mix so that blended `ECw` keeps `LR` within a cap (default 0.3), using the linear mix `ECw = Σ fᵢ·ECᵢ`. If no mix meets the cap, recommend the lowest-EC mix and raise an owner alert. **How it is delivered (proposed default):** each source has its own tap or valve on the block's line, so the engine outputs **minutes per source** (e.g. "30 min blue tap (well), then 8 min green tap (desal)"). The announcement and the DONE confirmation work per source step. A farm with a mixing tank can be set to "mixing tank" mode instead; the output is then the fill ratio for the tank plus one runtime.
7. **Soil salinity check.** If the latest soil EC is above the crop threshold, schedule a **flush day** (one larger leaching irrigation) instead of adding extra every day, and announce it.
8. **Timing.** Start so irrigation ends before or shortly after sunrise (low evaporation and wind). Blocks are staggered by the system's flow capacity. Starts must fall inside the farm's **worker hours** (default earliest start 05:00, set per farm). If the blocks don't fit before sunrise + 2 h, the rest moves to an evening slot after sunset, and the reason is shown.
9. **Habit comparison.** The owner records the current routine per block (minutes/day and source). Using the same real weather, the engine reports `habit volume − recommended volume` in litres and AED.
10. **Explanation.** Each plan stores its inputs and the main reason in plain words, for example *"38 min instead of 60: forecast ET₀ is 6.1 mm, tomato is at flowering (Kc 1.15), well water is salty (EC 3.6) so 21% extra is added to flush salt; 20% desalinated water lowers that extra from 31%."*

**Fallbacks (stated in the UI, never silent):** with no soil test, use the water-EC-only leaching requirement. With no water EC, use the owner's last known value, flagged stale. If the forecast is unavailable, use the last cached forecast and label its age.

### 7.3 Adaptive soil-testing schedule

After each soil test, the next test date is set by:

| Condition from latest result | Next test |
|---|---|
| No previous test, or first two tests | 7 days |
| Soil EC ≥ 80% of the crop threshold, **or** changed by > 15% since the last test, **or** pH outside 6.0–8.5, **or** a flush day happened since the last test | **7 days** |
| Otherwise (stable and in range) | **14 days** |

All thresholds can be set per farm. The due date shows on the dashboard. An announcement plays 1 day before and on the day, and an owner alert is sent if the test is overdue by 2 days or more.

### 7.4 Salt clock (well-salinity trend)

- Needs **at least 4 water-EC readings over at least 3 weeks** per source. Before that, it shows "Collecting readings (n/4)".
- Fits a linear trend (with a confidence band) to the well's EC over time.
- Projects the soil EC (ECe) that this water will produce, and expected yield using the Maas-Hoffman relation `Yield% = 100 − b·(ECe − a)` with `a` and `b` taken from FAO-29.
- Output on the owner view: the current yield loss estimate, the projected date the loss crosses 10% and 25%, and salt-tolerant crops from the library that fit the projected salinity.

### 7.5 Announcement system

A scheduler builds each day's announcements from the plan, the forecast and alerts. The kiosk plays them at the right time (chime, then speech), repeats them on demand, and shows them in the feed.

| Type | When | Example |
|---|---|---|
| Daily briefing | Fixed time (default 05:15) | "Good morning. Today 41 degrees. Three blocks to irrigate…" |
| Irrigation start/stop | At each block's start and end | "Block 3 tomato: open the valve now. 38 minutes. Blue tap." |
| Sunrise / sunset | At the time from Open-Meteo, or a set offset before it | "Sunrise in 15 minutes." |
| Heat warning | Forecast max ≥ 45 °C, or during the UAE midday outdoor work break (15 Jun–15 Sep, 12:30–15:00) | "Midday break: no outdoor work until 3 pm." |
| Soil test due | Day before and day of | "Soil test for Block 3 is due tomorrow." |
| Water alerts | Tank below threshold; water EC jumps | "Tank is at 20%. Tell the owner." |
| Flush day | Morning of | "Today Block 3 gets a long watering to wash out salt." |
| Data stale / device offline | When detected | "No tank reading for 2 days." |
| Custom | Owner-written, scheduled or immediate | Any text, translated |

- **Languages:** P0 English and Urdu. P1 Arabic and Hindi. **Stretch:** Malayalam, Bengali. Each worker or kiosk has a set language.
- **Speech:** built from templates per language (filled-in slots, not machine translation of free text). Audio is created on the server with ElevenLabs and cached on the kiosk, so playback works offline. Owner custom messages are translated (stretch) or recorded by the owner as a voice clip.
- **Confirmation:** irrigation announcements come with a **DONE** button, or the worker can say the number. This creates an `IrrigationEvent` record of what was actually done, which feeds the plan-vs-actual report.
- **Other channels:** owner push notifications (web push). SMS/WhatsApp is stretch.

### 7.6 Data injection

All channels write through **one ingestion service** with the same validation, unit normalisation and provenance.

| Channel | For | Details |
|---|---|---|
| **UI forms** | Workers and owners | Number pad; per-metric forms (tank level, water EC, soil test, flow meter, irrigation done); photo of a lab report attached as evidence (optional) |
| **CSV import** | Lab results, historical logs, bulk entry | Downloadable template per metric; dry-run preview with row-level errors before commit |
| **REST API** | Sensors, gateways, other systems | `POST /api/v1/readings` (single or batch), authenticated with a per-device API key; OpenAPI docs |
| **MQTT** | Low-power sensors | Topic `milh/{farm_id}/{device_id}/{metric}`, JSON payload; a bridge maps it to the same ingestion service |

**Reading payload (canonical):**
```json
{
  "farm_id": "uuid",
  "block_id": "uuid | null",
  "source_id": "uuid | null",
  "metric": "water_ec | tank_level_pct | tank_volume_l | well_depth_m | soil_ec_1to5 | soil_ece | soil_moisture_vwc | soil_ph | flow_l | irrigation_minutes",
  "value": 3.6,
  "unit": "dS/m",
  "measured_at": "2026-11-16T05:10:00+04:00",
  "device_id": "uuid | null",
  "note": "optional"
}
```
- **Validation:** plausible ranges per metric (e.g. water EC 0–60 dS/m, pH 0–14). Out-of-range values are rejected. Implausible jumps are accepted but flagged for owner review.
- **Units:** conversions are stored (mS/cm ↔ dS/m, µS/cm). Soil EC 1:5 is converted to ECe with a soil-texture factor; the factor and its source are shown.
- **Idempotency:** a client-generated `reading_id` lets offline queues retry safely.

### 7.7 Owner configuration

Farms (name, coordinates, timezone), blocks (area, crop, planting date, irrigation system, emitter flow), water sources (type, cost per m³, latest EC, max flow), tanks (capacity), the habit routine per block, thresholds (heat, tank low, LR cap, soil-test rules), announcement times and the worker language. A farm can be set up in under 10 minutes.

### 7.8 Reports

- Water used: recommended vs. actual vs. habit, by day, week and season, in m³ and AED.
- Plan adherence: planned vs. confirmed irrigation.
- Salinity history: water EC and soil EC per block, with test dates.
- Export to CSV and PDF.

---

## 8. Architecture

```
          ┌──────────────┐        ┌───────────────────┐
          │ Open-Meteo   │        │ Sensors / gateways│
          │ forecast API │        │ (REST or MQTT)    │
          └──────┬───────┘        └─────────┬─────────┘
                 │ hourly pull               │
┌────────────────▼───────────────────────────▼──────────────────┐
│                         Backend (Python)                       │
│  API (FastAPI) · Ingestion service · Decision engine ·         │
│  Scheduler (jobs: weather pull, daily plan, announcements,     │
│  soil-test due, staleness checks) · TTS worker · Auth/RBAC     │
└───────────┬───────────────────────────────┬───────────────────┘
            │                               │
   ┌────────▼────────┐            ┌─────────▼─────────┐
   │ PostgreSQL      │            │ MQTT broker       │
   │ (+ TimescaleDB  │            │ (Mosquitto)       │
   │  for readings)  │            └───────────────────┘
   └─────────────────┘
            ▲  REST + WebSocket (live updates)
┌───────────┴──────────────────────────────────────────────────┐
│ Web app (React + TypeScript PWA)                             │
│  • Kiosk mode (worker): offline cache, audio playback        │
│  • Owner/admin mode                                          │
└──────────────────────────────────────────────────────────────┘
```

**Stack (builder's call where marked):**
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 + Alembic migrations, Pydantic v2, APScheduler (or a task queue; *builder's call*). Python is chosen because the agronomy maths is easy to write and test in it.
- **Database:** PostgreSQL 16. TimescaleDB hypertable for `readings` is optional (*builder's call*; plain Postgres with indexes is fine at this scale).
- **Messaging:** Mosquitto MQTT plus a small bridge service.
- **Frontend:** React + TypeScript + Vite, PWA (service worker + IndexedDB for offline cache and outbound queue), a charting library (*builder's call*), i18n with RTL support for Arabic and Urdu.
- **Voice (TTS and STT): ElevenLabs** (the team already has access). Announcement audio is generated on the server with an ElevenLabs multilingual model and **cached on the kiosk**, so playback works offline. Templates have fixed phrases plus number and time slots, so the full set is small and costs few credits. Generate each filled-in announcement once and reuse it. ElevenLabs speech-to-text is used for voice entry of readings (P2). The builder checks Urdu output quality on the first day. If Urdu is weak, use Hindi audio with Urdu script on screen (spoken Hindi and Urdu are largely mutually understood) and raise it with the team.
- **Gemini (Google AI):** used only for language, never for the decision. (1) It translates owner-written custom announcements into the worker's language. (2) It rewrites the engine's structured explanation into a short, friendly sentence per language. (3) **Lab-report reader (P1):** the owner photographs or uploads a soil or water lab report, Gemini extracts the values into the soil-test form, and a person checks and confirms them before they are saved (provenance `gemini_extract` + `confirmed_by`). This is a fourth injection channel that fits real farms, where results usually arrive as paper or PDF. The numbers always come from the engine, and the explanation falls back to the template text if Gemini is unavailable. This also suits a GDG event.
- **API keys:** the ElevenLabs and Gemini keys live only in the server's `.env`, never in the frontend, never committed (`.env` in `.gitignore`, `.env.example` with empty values). Every external call goes through the backend.
- **Auth:** JWT sessions, role-based access (owner, worker, admin), farm-scoped permissions. Kiosk logs in with a device token plus a worker PIN; API keys are per device.
- **Delivery:** Docker Compose (api, worker, db, mqtt, web). Single-command start. `.env` configuration. Runs on a laptop for the demo and on a small cloud VPS in production. "Offline" therefore means **the kiosk loses its connection to the server**: the kiosk must carry today's plan, forecast and announcement audio itself and play them on schedule. A mini-PC on the farm LAN is a supported alternative, not the default.
- **Quality:** pytest with the FAO worked examples as engine tests, API tests, frontend component tests for the kiosk, lint and type checks (ruff, mypy, eslint, tsc), CI workflow, structured logging, health endpoint, seed script for the **crop library only**.

---

## 9. Data model (core entities)

| Entity | Key fields |
|---|---|
| `User` | id, name, role, language, phone, PIN hash |
| `Farm` | id, owner_id, name, lat, lon, timezone, settings (JSON) |
| `Block` | id, farm_id, name, area_m², crop_id, planting_date, irrigation_type, flow_l_per_h, Ea, habit_minutes, habit_source_id |
| `Crop` (library) | id, names (multi-language), Kc stages (ini, dev, mid, late + stage lengths), salinity threshold `a` (dS/m ECe), slope `b` (%/dS/m), citation |
| `WaterSource` | id, farm_id, type (well, desal, TSE, municipal), cost_per_m³, max_flow |
| `Tank` | id, farm_id, capacity_l, source_id |
| `Device` | id, farm_id, kind, api_key hash, last_seen |
| `Reading` | id, farm_id, block_id?, source_id?, tank_id?, metric, value, unit, measured_at, received_at, provenance (source, user/device), flags |
| `SoilTest` | id, block_id, date, ec_1to5?, ece, moisture, pH, lab, attachment, next_due (computed) |
| `WeatherSnapshot` | farm_id, fetched_at, forecast JSON (hourly + daily), current |
| `IrrigationPlan` | id, block_id, date, start, minutes, source_mix, volume_l, inputs JSON, explanation, habit_volume_l |
| `IrrigationEvent` | id, plan_id?, block_id, started_at, minutes, confirmed_by, method (tap, voice, sensor) |
| `Announcement` | id, farm_id, type, scheduled_at, template_key, slots JSON, audio refs per language, status (scheduled, played, acknowledged) |
| `Alert` | id, farm_id, severity, type, message, resolved_at |

---

## 10. The demo (about 3 minutes)

1. **Why this angle (1 min):** salty water is why growers overwater; the decider and the doer are different people; salt is noticed only after the harvest fails.
2. **Live farm (Al Ain coordinates):** the dashboard loads the live forecast and sunrise and sunset times. We point out the source labels.
3. **Inject real data:** a team member enters a published well-water EC value on the kiosk number pad (or a live meter reading, if the team bought a pen). We import a CSV of published soil and well-salinity values, with citations visible, and send one reading through the API with `curl` to show the sensor path.
4. **The decision:** the plan recalculates. Block 3 shows its minutes vs. the habit's 60, the source split and the explanation. (Numbers in this document are illustrative; on the day they come from live weather and the real readings, and the demo script must not depend on exact values.) The habit comparison shows litres and AED saved today and projected over the season.
5. **The announcement:** the kiosk plays the irrigation announcement in Urdu, then Arabic. The worker taps DONE.
6. **Soil schedule and salt clock:** the next test is due in 7 days because salt is rising. The owner view shows the salt clock trend (from real readings collected beforehand).
7. **Offline:** turn off Wi-Fi. The kiosk keeps the schedule and still plays the announcements.

---

## 11. Build priority

The team has **24–48 hours and 2–4 people**, so the target is **P0 plus the salt clock** (confirmed by the team). Everything else in P1 is done only if time allows. Suggested parallel tracks:

- **Track 1 — Backend and data:** schema and migrations, auth and roles, ingestion API and forms backend, Open-Meteo, SoilGrids and CSV import, finding and citing the published salinity data.
- **Track 2 — Engine:** irrigation decision (§7.2), blend, soil schedule (§7.3), salt clock (§7.4), with unit tests built from the FAO worked examples.
- **Track 3 — Kiosk and owner UI:** dashboard, number-pad entry, announcements and audio, offline cache, RTL.
- **(Person 4, if available) — Voice and demo:** TTS templates, Gemini wording and translation, demo script, pitch.

Build from the top down.

| Priority | Scope |
|---|---|
| **P0 — must demo** | Farm/block/source setup · Open-Meteo pull + dashboard (weather, sun, forecast) · ingestion (UI forms + REST) with provenance · water levels and water EC panels · soil test entry + adaptive schedule · decision engine with explanation and habit comparison · announcement scheduler + kiosk playback in **English and Urdu** (so RTL layout is P0) · **kiosk offline cache of today's plan, forecast and announcement audio** (anti-goal A3) · owner and worker roles · Docker Compose |
| **P1 — should** | CSV import · Gemini lab-report reader · MQTT bridge · offline outbound queue for worker entries · Arabic and Hindi voices · salt clock · reports · web push to owner |
| **P2 — stretch** | Voice entry of readings · Malayalam/Bengali · SMS/WhatsApp delivery · owner voice-clip announcements · PDF export · multi-farm owner overview polish |

---

## 12. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **A. Single in-browser app with a bundled dataset** (earlier proposal) | Fastest and demo-proof, but no backend, no roles, no live ingestion, and it relies on a replayed season. | **Rejected.** The team wants an industry-grade platform with no simulated data. |
| **B. Full platform: backend + DB + PWA kiosk + ingestion API** | More to build. Real roles, live data, real ingestion paths, and it can be deployed. | **Chosen.** It matches the team's brief: a worker/owner platform, live data, injectable inputs, built from top to bottom. |
| C. WhatsApp-bot-only | Familiar to users and no app install, but weak for dashboards and kiosk announcements, and the Business API needs approval. | Kept as a stretch delivery channel. |

---

## 13. Decided vs. left to the builder

**Decided by the team:** a platform for the on-farm worker and the owner. A dashboard with weather forecast, water levels and soil condition. Soil testing every 1–2 weeks depending on the previous check. An announcement system for irrigation timings, sunrise, sunset and other information. Industry-grade, built from scratch. **No simulated data**, with data-injection options.

**Also confirmed by the team:** the salty-water angle and leaching calculation, the water-source blend, the salt clock, spoken announcements in workers' languages with a DONE confirmation. The build has 24–48 h and 2–4 people. The team has no farm or meter, so demo data comes from live, open and published sources (§5.6).

**Proposed in this document (calls to check):** Python/FastAPI + PostgreSQL + React PWA + MQTT. Open-Meteo as the weather source. The 7/14-day rule thresholds in §7.3. The UAE midday-break heat announcement. Language list. Daily plan at 03:00 and briefing at 05:15. Rain under 5 mm ignored. LR cap 0.3. Drip efficiency 0.9. Blend delivered as separate taps (minutes per source), with mixing-tank mode as an option. Worker hours start at 05:00, with an evening overflow slot. P0 languages: English and Urdu. Kiosk offline cache is P0. Production server is a cloud VPS. ElevenLabs for voices (the team has it). Gemini (the team has a key) for wording, translation and lab-report extraction only, never the decision. SoilGrids for soil properties. Salt clock moved into the target scope.

**Left to the builder:** task queue vs. APScheduler, TimescaleDB or not, charting library, component library, exact UI styling, ECe conversion factor table, verifying FAO-29/FAO-56 table values against the source documents, exact ElevenLabs model and voice IDs per language, Gemini model choice, hosting the demo locally or on Cloud Run.
