# Milh voice assistant for the farm tablet — design

> **Approved scope (16 Nov 2026, trimmed):** spoken questions (today's plan, why, water, soil, weather/sun,
> what's next, help) and **"Block N is done" with a yes check**. **Not in this build:** `log_reading` (voice-entered
> meter values): a misheard number saved as data is the riskiest part. Everything below about `log_reading` is
> deferred.

**16 Nov 2026 · Builds on the platform design (`docs/2026-11-16-milh-platform-design.md`) and reuses the assistant from the team's sea-safe project.**

## 1. What and why

The worker at the valve often can't read, but can talk. The tablet already speaks scheduled announcements. This adds the other direction: the worker taps one big microphone button and **asks in Urdu or English**. Examples:

- "How long for Block 3?"
- "Why less water than usual?"
- "Is the tank full?"
- "When is the soil test?"
- "When is sunset?"

The worker can also **report**, for example "Block 3 is done" or "The well reads 3.6". The tablet answers out loud, in the worker's language, in about a second.

This is Milh's angle in its purest form: the decision reaches the person holding the valve, and the farm's records come back from them, without reading or typing.

## 2. Non-negotiable rules, carried over from Milh and sea-safe

1. **The model never says a number or a decision.** The language model only (a) chooses which tool to call and (b) may write one short intro sentence. A guard rejects that sentence if it contains a digit or a decision word, and a fixed template is used instead. Every minute, litre, EC value, time and date is filled into reviewed per-language templates by code.
2. **Nothing is saved without a spoken yes.** "Block 3 done" and "the well reads 3.6" first produce a read-back ("Block 3, done: is that right?") and are stored only when the worker says yes, or taps ✔. Readings go through the normal ingestion service (`source = "voice"`, same validation and provenance), and DONE goes through the normal irrigation-event path (`method = "voice"`).
3. **No voice means nothing breaks.** Without keys or internet, the microphone button is hidden or greyed with a short message. Scheduled announcements, offline mode and the buttons all keep working.
4. **No simulated data.** The assistant only reads what the platform already holds.

## 3. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **A. Port the sea-safe pipeline:** server speech-to-text (ElevenLabs Scribe) → Gemini with tool calls (Groq as backup) → templated answer → streaming ElevenLabs speech; voice mode in the browser | It is proven in sea-safe: noise handling, talking over the answer, the numbers guard, and roughly 1 s to first sound. It needs porting from vanilla JS to React. | **Chosen** |
| B. ElevenLabs Conversational AI agent with webhook tools | Less code, but the agent writes its own spoken text, so the "no model numbers" rule can't be enforced, and the agent and webhooks need setting up. | Rejected |
| C. Browser Web Speech API | Free, but Urdu recognition is weak and inconsistent, and it still needs internet in Chrome. | Rejected |

## 4. What the worker sees and hears

```
┌──────────────────────────── farm tablet ────────────────────────────┐
│ …existing dashboard…                                    [ 🎙 Ask ]   │  ← big round button, bottom corner
└─────────────────────────────────────────────────────────────────────┘
Tap → full-screen voice mode:
┌─────────────────────────────────────────────────────────────────────┐
│                     ( pulsing orb )                                  │
│      "Block 3 kitne minute?"            ← what was heard             │
│      "Block 3, tomato: 20 minutes, blue tap 15 then green tap 5."    │
│                 [ 🔇 Mute ]        [ ✕ Close ]                        │
└─────────────────────────────────────────────────────────────────────┘
```

- On opening, voice mode greets the worker ("Ask me about today's watering."). It listens, detects the end of speech, says a short filler ("Okay.") at once, and answers.
- The worker can talk over the answer to interrupt. Background noise (pumps, wind) is ignored using the sea-safe method.
- Read-back for actions shows a big ✔ / ✖ as well as listening for yes or no.
- The language is the kiosk's selected language (Urdu or English). Arabic and Hindi follow when their templates exist.

## 5. Tools the model can call

All tools read the same data as the kiosk bundle and return structured results. Templates turn them into speech.

| Tool | Answers | Example |
|---|---|---|
| `today_plan(block?)` | Minutes, tap order, start time, or "no watering today, rain" | "How long for Block 3?" |
| `why_plan(block?)` | The plan's explanation in the worker's language: weather, crop stage, salt, the mix used | "Why less than usual?" |
| `water_status(source?/tank?)` | Tank level and the water-salt reading with its age, or "no reading yet" | "Is the tank full?" |
| `soil_status(block?)` | Soil salt status and the next test date | "When is the soil test?" |
| `weather_now(detail)` | Temperature, today's maximum, rain, sunrise or sunset, and the midday break | "When is sunset?" |
| `next_announcement()` | What comes next and when | "What's next?" |
| `mark_done(block)` | **Proposes** DONE for that block's plan, then waits for confirmation | "Block 3 is done" |
| `log_reading(metric, target?, value, unit?)` | **Proposes** a water EC or tank level reading, then waits for confirmation | "The well reads 3.6" |
| `confirm(answer: yes/no)` | Saves or drops the pending action | "Yes" / "No" |
| `help()` | What the assistant can do, as a fixed line | "What can you do?" |

Block, source and tank names are matched loosely ("teen number", "Block 3", "tomato wala"). Their names are given to Scribe as key terms so it hears them correctly. If nothing matches, the assistant asks which block, and never guesses.

## 6. Architecture

- **Backend** (`backend/milh/assistant/`):
  - `llm.py`: the sea-safe client ported to Milh settings: Gemini through its OpenAI-compatible endpoint, Groq as optional backup, hedging, hard time limits, tool-call schema checks.
  - `voice.py`: Scribe speech-to-text (`urd`, `eng`) with sound tags off, key terms and echo detection, plus streaming text-to-speech cached by text. Voice IDs per language come from `.env`.
  - `tools.py`: the schemas and the code that runs them.
  - `chat.py`: the conversation loop, the guard, and the pending action carried in the conversation context.
  - `templates/{en,ur}.json`: answer lines for the screen and for speech.
- **API:**
  - `POST /api/v1/assistant/ask`: multipart audio, plus `history`, `context`, `lang` and `interrupted`.
  - `POST /api/v1/assistant/text`: the same, typed (for development and as a fallback).
  - `GET /api/v1/assistant/audio/{id}`: streamed or cached speech.
  - `GET /api/v1/assistant/lines`: greeting and filler clips.
  - `GET /api/v1/assistant/status`: whether voice is available for this language.
  - Worker or owner token, scoped to the farm.
- **Web** (`web/src/kiosk/voice/`): a React port of `voicemode.js`, covering microphone handling, noise learning, end-of-speech detection, talking over the answer, the orb, and the confirm buttons. The pure audio-level logic sits in a testable module.
- **Settings** (`.env`):
  - `GEMINI_API_KEY` (required for the assistant)
  - `GROQ_API_KEY` (optional backup)
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_IDS` (now also used for the assistant)
  - `ELEVENLABS_STT_MODEL` (default `scribe_v1`; the builder checks which current Scribe model supports Urdu)
  - `ASSISTANT_ENABLED`

## 7. Goals and anti-goals

- **Goals:** answers to the common questions in Urdu and English with sound starting in about a second; DONE and two reading types by voice with confirmation; no crash or silence on bad audio, no network, or a model failure (a fixed "I didn't catch that" or "voice is not available" line is played instead).
- **Anti-goals:** the model speaking a number; anything saved without a yes; voice breaking the offline tablet.
- **Not in scope:** an owner chat (cheap to add later on the same backend), and Arabic and Hindi templates (they follow the template files).

## 8. Left to the builder

- The exact Scribe and TTS model IDs.
- The filler and greeting wording (reviewed per language).
- The audio thresholds: start from sea-safe's values.
- How much of `voicemode.js` to port as-is or refactor.

Urdu template text must be checked by an Urdu reader, as for announcements.
