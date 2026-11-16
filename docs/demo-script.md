# Milh demo script (about 3 minutes)

**Before the demo:**
1. Follow the README to set up the example farm. It sits on Oman's Al-Batinah coastal plain, the same
   area as the cited salinity data.
2. Fill `.env` with the ElevenLabs and Gemini keys.
3. Import the cited published data (Owner → Add data → Import, with "Published data" ticked):
   - `data/published/batinah_well_T52_water_ec.csv`: **one** well, 1991–2010. Don't import the 18-well
     file into the single "Well" source, because it would mix wells into one line.
   - `data/published/batinah_soil_tests.csv` (soil tests).
4. **Give today's plan a current water reading.** The newest published value is from 2010. The app marks it
   as old, but today's minutes should come from today's water. Enter a meter reading on stage, or a recent
   cited value, as the newest Well reading.
5. Open the farm tablet once while online so it caches today's plan and audio.
6. Record a backup video of the full run.

Say this out loud: **the farm layout is an example setup on Oman's Batinah coast. Weather is live for that
spot, the well history is from a peer-reviewed study of Batinah monitoring wells, and today's reading is
entered on stage.**

## 1. Why this angle (1 minute)

> Desert farms don't only lack water: the water they have is salty. Salt builds up around the roots,
> so growers pour on extra water "just in case". Nobody tells them how much is enough. Second, the
> person who decides is not the person at the valve: the owner's habit reaches the worker once, as
> "60 minutes, every day", and is never updated. Third, salinity is noticed after the harvest fails.
> On the Batinah coast, one monitoring well went from 2.5 to 15.4 dS/m between 1991 and 2010, as seawater
> pushed inland. Milh fixes all three.

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
- Owner → Salt clock (Well): the 1991–2010 history, clearly labelled as old data and **not today**.
  Show when date-palm yield would have crossed 10% and 25% loss, and which crops still fit that water.
  This is the warning a grower never got. With current readings, the same view becomes the forward warning.

## 7. Offline (10 s)

- Turn Wi-Fi off and reload the tablet. Today's plan and audio are still there, with an "Offline" badge.
