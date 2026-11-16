# Milh Voice Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, chosen by the user for this project). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A worker on the farm tablet taps 🎙 Ask, speaks in Urdu or English, and hears a spoken answer about today's watering, water, soil, weather and what's next. "Block N is done" is recorded after a spoken or tapped yes.

**Architecture:** Port of the sea-safe assistant. The server pipeline is ElevenLabs Scribe speech-to-text → Gemini tool calling (Groq optional backup) → Milh tools → per-language templates → ElevenLabs speech, streamed and cached. The tablet runs a React port of sea-safe's voice mode: noise floor, end-of-speech detection, talking over the answer, fillers.

**Tech:** existing FastAPI/SQLAlchemy backend and React kiosk; httpx for Gemini/Groq through OpenAI-compatible endpoints (no new SDK).

**Spec:** `docs/2026-11-16-voice-assistant-design.md` (trimmed scope at the top), plus the platform spec `docs/2026-11-16-milh-platform-design.md`.

## Global Constraints

- The model never puts a digit or a decision into what is shown or spoken. The guard drops any model sentence containing a digit, or longer than 200 characters after a tool call. Every number comes from templates filled by code.
- Nothing is saved without a yes. `mark_done` only proposes. The event is written by `confirm(yes)`, or by a deterministic yes word or the ✔ tap, with `method="voice"`, through the same rules as `POST /irrigation-events`.
- No keys, or no internet: the Ask button is hidden or greyed, and every other kiosk feature is unchanged.
- No new simulated data. Tools read only what the platform stores.
- Settings come from `.env` only: `GEMINI_API_KEY`, `GROQ_API_KEY` (optional), `ASSISTANT_MODEL` (default `gemini-3.5-flash-lite`, the fastest in sea-safe's measurements), `GROQ_MODEL` (default `openai/gpt-oss-120b`), `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_IDS`, `ELEVENLABS_STT_MODEL` (default `scribe_v3`), `ELEVENLABS_TTS_MODEL_ASSISTANT` (default `eleven_v4_turbo`, sea-safe's choice for low latency), `ASSISTANT_ENABLED` (default true).
- Languages: `en`, `ur`. Scribe codes `eng` and `urd`.
- Every assistant endpoint needs a worker or owner token and is scoped to that farm.

## Review Focus

1. **Misheard or unknown block** ("Block 9" on a three-block farm): ask which block, never pick one. Test: V3 `test_unknown_block_asks_which`.
2. **"Yes" with nothing pending**, or a pending action from a different farm or plan: no event is written. Test: V4 `test_yes_without_pending_does_nothing`, `test_pending_for_other_farm_rejected`.
3. **Empty or noise-only audio, and the worker's own voice echoed back:** a "didn't catch that" line or a resume, never a model call. Test: V5 `test_empty_transcript_says_not_heard`, `test_echo_resumes`.
4. **Model unavailable or returns a malformed tool call:** a fixed "voice help is not available right now" line, never a 500. Test: V4 `test_llm_unavailable_fixed_line`.
5. **Done twice** (worker says it again): one event only, and the second answer says it is already recorded. Test: V4 `test_done_twice_one_event`.

---

### Task V1: Settings and model client (`milh/assistant/llm.py`)

- Port sea-safe `app/llm.py`: provider order (gemini, groq), per-call time limit 4 s, hedge after 1.5 s, `call_problem` schema check, `_clean`, `complete(messages, tools) -> (message, label)`, `LLMUnavailable`.
- Settings fields are added to `Settings`, not read from `os.getenv`.
- Tests (respx):
  - `test_gemini_answers`
  - `test_bad_tool_call_falls_back_to_groq`
  - `test_no_keys_raises_unavailable`
  - `test_call_problem_rejects_extra_and_wrong_types`

### Task V2: Voice (`milh/assistant/voice.py`)

- Port sea-safe `app/voice.py`: `available(lang)`, `transcribe(...)` (`tag_audio_events=false`, key terms), `without_sound_tags`, `is_echo`, `audio_id`, `audio_path`, `prepare`, streaming `_Fetch` and `open_stream`. Audio goes to `media_dir/assistant/`, and voices come from `elevenlabs_voice_ids`.
- Tests:
  - `test_transcribe_request_shape` (respx)
  - `test_sound_tags_removed`
  - `test_is_echo`
  - `test_audio_path_rejects_bad_id`
  - `test_prepare_cached_skips_fetch`

### Task V3: Tools and answer templates (`milh/assistant/tools.py`, `milh/assistant/templates/{en,ur}.json`)

- `schemas(block_names) -> list[dict]`: `today_plan(block)`, `why_plan(block)`, `water_status()`, `soil_status(block)`, `weather_now(detail: temp|rain|sun|midday|all)`, `next_announcement()`, `mark_done(block)`, `confirm(answer: yes|no)`, `help()`. `block` is a string, matched by code.
- `match_block(text, blocks) -> Block | None`: exact name, "block 3", "3", "teen", crop name (en and ur); None if ambiguous.
- `run_tool(session, farm, name, args, lang, now, context) -> ToolResult(text, spoken, pending, kind)`. All values come from the stored plan, readings, soil tests, weather snapshot and announcements, rendered through the templates.
- Tests on a DB fixture:
  - `test_today_plan_minutes_and_taps`
  - `test_today_plan_rain_skip`
  - `test_no_plan_yet`
  - `test_why_uses_plan_text`
  - `test_water_status_empty_state`
  - `test_soil_next_test`
  - `test_sunset_time`
  - `test_next_announcement`
  - `test_unknown_block_asks_which`
  - `test_mark_done_proposes_only`

### Task V4: Conversation (`milh/assistant/chat.py`)

- `turn(session, farm, user, lang, history, context, question, now, complete=llm.complete) -> TurnResult(reply, spoken, pending, context, provider)`.
- A deterministic yes/no check (en/ur words, ✔ tap sends "yes") runs before the model when something is pending.
- At most 3 tool rounds. The guard is applied, and the model sentence is used only for small talk.
- Tests (fake `complete`):
  - `test_question_runs_tool_and_templates_answer`
  - `test_model_digits_dropped`
  - `test_yes_without_pending_does_nothing`
  - `test_done_then_yes_writes_voice_event`
  - `test_done_then_no_writes_nothing`
  - `test_done_twice_one_event`
  - `test_pending_for_other_farm_rejected`
  - `test_llm_unavailable_fixed_line`

### Task V5: API (`milh/api/assistant.py`)

- Endpoints:
  - `GET /api/v1/assistant/status?lang=`: `{available, reason}`
  - `GET /api/v1/assistant/lines?lang=`: greeting, `ok`, `wait` and `not_heard`, with audio URLs
  - `POST /api/v1/assistant/ask` (multipart `audio`, `lang`, `history`, `context`, `interrupted`)
  - `POST /api/v1/assistant/text` (JSON)
  - `GET /api/v1/assistant/audio/{aid}`
- Tests:
  - `test_status_unavailable_without_keys`
  - `test_text_turn`
  - `test_empty_transcript_says_not_heard`
  - `test_echo_resumes`
  - `test_ask_requires_token`
  - `test_audio_bad_id_404`

### Task V6: Tablet voice mode (`web/src/kiosk/voice/`)

- `levels.ts`: a pure state machine `createDetector(opts) -> { step(rms, dtMs, mode): Event | null }`. Modes are `listening` and `speaking`. Events are `speech_start`, `speech_end`, `idle_restart`, `barge`. It uses sea-safe's constants.
- `api.ts`: `assistantStatus`, `askAudio`, `askText`, `lines`.
- `VoiceMode.tsx`: a full-screen overlay with the orb, what was heard, the answer, Mute, Close, and ✔/✖ when something is pending. It manages the mic and MediaRecorder, plays answers through `Audio`, and supports talking over the answer. Without a mic it shows a message.
- `KioskView`: an Ask button, shown when the status is available and the tablet is online.
- Tests:
  - `levels.test.ts`: noise does not start speech; speech then 900 ms of quiet ends the question; barge after 300 ms loud
  - `VoiceMode.test.tsx`: pending shows ✔/✖ and ✔ sends "yes"
  - `KioskView` Ask hidden when unavailable

### Task V7: Check, review, ship

- Run both suites, lint and types.
- Browser check of the Ask button and overlay; typed mode only, since the pane has no mic and there are no keys here.
- Fresh reviewer on the diff, fix pass, README section, commit, push.
