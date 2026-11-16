# Milh demo script (about 3 minutes)

**Before the demo:** follow the README to set up the example farm. Fill `.env` with the ElevenLabs and
Gemini keys. Import the cited published data from `data/published/` (Owner → Add data → Import, with
"Published data" ticked). Then open the farm tablet once while online so it caches today's plan and audio.
Record a backup video of the full run.

Say this out loud: **the farm layout is an example setup. Weather is live, and every reading is cited
published data or entered on stage.**

## 1. Why this angle (1 minute)

> Desert farms don't only lack water: the water they have is salty. Salt builds up around the roots,
> so growers pour on extra water "just in case". Nobody tells them how much is enough. Second, the
> person who decides is not the person at the valve: the owner's habit reaches the worker once, as
> "60 minutes, every day", and is never updated. Third, salinity is noticed after the harvest fails.
> Milh fixes all three.

## 2. Live farm (20 s)

- Owner → Today → **Fetch live weather**. Point at the source labels: Open-Meteo, fetched minutes ago.

## 3. Inject real data (40 s)

- Owner → Add data → enter a cited well EC value (or read a meter on stage if you have one).
- Show the CSV import dry run: row errors appear before anything is saved, and citations are required.
- Optional: send one reading with `curl` and an `X-Api-Key` header to show the sensor path (README).

## 4. The decision (30 s)

- **Recompute today's plan.** Show the minutes versus the habit's 60, the split between taps, the
  sentence explaining why, and the table: water saved, cost, estimated yield.
- Numbers come from live weather and the real readings, so **don't promise exact values**.
- Be honest about cost: desalinated water can cost more than the habit. The estimated yield the
  grower keeps is the argument.

## 5. The farm tablet (30 s)

- Open the farm tablet view, then **Tap to start**. Switch to **اردو** to show right-to-left Nastaliq script.
- Play the irrigation announcement (🔊). Tap **DONE**.

## 6. Soil schedule and salt clock (20 s)

- The soil panel shows the next test in 7 days because salt is rising (or 14 days when stable).
- Owner → Salt clock: the trend and the date yield loss passes 10% and 25%, with crops that still fit.
  If no cited time series exists, it honestly shows "Collecting readings (n/4)". Say so.

## 7. Offline (10 s)

- Turn Wi-Fi off and reload the tablet. Today's plan and audio are still there, with an "Offline" badge.
