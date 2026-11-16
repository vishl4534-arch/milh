# Milh worker tablet: design direction

## Who and what
- **Audience:** farm workers on a date / vegetable farm in Oman's Al-Batinah. Many read little; they speak Urdu or English. Used standing, in sun, with dusty fingers, on a 10–11" tablet in landscape.
- **Primary action:** do today's watering job and tap **Done**. Everything else is secondary.
- **Vibe:** calm, warm, airy, confident. Light only (a dark glass version was tried and rejected).
- **Track:** E (redesign existing) applied to an app screen. Lead skill: `redesign-existing-projects`. Style preset: `premium` (precise spacing, few elements, soft depth). Motion lead: `animate`.

## The problem we are fixing
The old screen was one long scrolling stack of equally loud cards: the job was buried, small chips and an engineering paragraph (ET0, Kc) everywhere, 12 px gaps, three button styles.

## Layout: one job at a time
Tablet landscape fits on one screen with no scrolling on the main view.

1. **Top bar (slim):** logo, greeting and farm name, clock, language switch. Nothing else.
2. **Three big tabs:** **Today · Water · Soil**. Each tab is a full, roomy screen instead of everything at once.
3. **Today tab**
   - Left (about 60%): **the job card.** Crop drawing, block name, and the **water dial** (signature moment). Below it the tap steps as large coloured pills ("blue tap 13 min → green tap 4 min"), then a full-width **Done** button.
   - Right (about 40%): **today's timeline.** A vertical line of the day's blocks with times, done ticks, rain skips. Tapping one opens it in the job card.
   - The technical explanation moves behind a small "Why this much?" link (and voice), not on the main screen.
4. **Water tab:** the tank as a large illustration with its level, and one large tile per tap with its salt reading, trend and age, plus a big "Add reading" button.
5. **Soil tab:** one roomy row per block: sprout drawing, salt bar against the crop's limit, next test date.
6. **Bottom dock:** Listen (next announcement, with its text) and the Ask button. Weather lives in the top bar and the dial card's sky.

## Signature moment: the water dial
A large circular dial around the minutes number. While a block is being watered, the ring fills with water (a wave rises inside the circle) and counts down; when it's done, the drop burst plays and the next block slides in. Before the start time it shows the start time; when overdue it turns amber.

## Tokens (taken from the approved concept images)
- **Font:** Nunito (rounded, friendly, very readable), weights 600–900 for headings and numbers; Urdu keeps Noto Nastaliq.
- **Colours** (`.kiosk` in `web/src/index.css`): background `#f6f3ec` with a faint sand and green glow; cards white; sand `#f1e6cf` and `#f7efdf` for chips and the language switch; one accent, palm green `#2f6b4f` (soft `#e3f0e6`); ink `#1d2a24`, muted `#6b746f`. Tap colours come from the farm's setup and appear as soft tints on the tap pills.
- **Shape:** cards 28 px radius, inner pills and buttons 16–20 px; warm, low, wide shadows tinted brown, no borders.
- **Type scale:** block name 48 px black; dial number up to 96 px; tabs and buttons 24 px extra-bold; labels 16–18 px.
- **Spacing:** 16–20 px between cards, 24–32 px inside them; the main view fits one 1280 × 800 screen.

## Motion (animate skill rules: transform and opacity, under 300 ms for UI, gentler with reduced motion)
- Tab change: the green pill glides (320 ms ease-in-out); the new tab's content slides in from the side it came from (260 ms).
- Load: header, tabs, cards and timeline rows settle in one after another (420 ms, 70 ms stagger).
- Water dial: water rises to the current level once, its surface keeps moving; the ring fills as minutes pass.
- Tank: water rises to the reading once; soil bars fill once.
- Done: water-drop burst (rare, so it may delight). Ask: soft breathing ring. Every button presses in.

## Owner screens
Same world as the tablet (`.owner` in `web/src/index.css` shares the tokens and redefines the Tailwind ones, so every form and table follows), a little denser for a laptop.
- Header: logo, farm, "Farm tablet view" (sand pill) and Sign out. Tabs: the tablet's gliding green pill, six equal tabs with icons.
- Today: the focal card is **today's water**: Milh's plan in green over the usual routine in sand, with saved litres, cost and blocks. Weather (ET₀, rain, sun) and an alerts card sit beside it. Each block's card repeats the same usual-vs-Milh bar, its taps as tinted pills, and the reasoning in two soft panels.
- Charts: sand (usual), green (Milh), water blue (confirmed); the salt clock is a green line.
