// When does the worker start and stop talking, and are they talking over the tablet? Ported from the
// sea-safe voice mode. Pure: it only sees the microphone level (RMS of the voice band) and elapsed time.
//
// Background noise (pumps, wind) is kept out by learning the "room level" while nobody speaks: speech must be
// clearly louder than that and last at least a quarter of a second, so a bang or a click never counts.

export type Mode = 'listening' | 'speaking'
export type DetectorEvent = 'speech_start' | 'speech_end' | 'idle_restart' | 'barge'

export const LEVELS = {
  SPEECH_MS: 250, // this long above the room level before it counts as speech
  END_MS: 900, // this long quiet after speech: the question is over
  IDLE_RESTART_MS: 12000, // nothing said: start a fresh recording (keeps files small)
  MIN_LEVEL: 0.012, // never treat anything quieter than this as speech
  OVER_ROOM: 3.2, // speech must be this many times the learnt room level
  BARGE_MS: 300, // talking over the tablet this long interrupts it
  BARGE_OVER: 2.2, // ...and must be this many times louder than ordinary speech detection
  BARGE_MIN: 0.03, // never interrupt for anything quieter than this
  MAX_QUESTION_MS: 15000, // a question is never longer than this (a pump starting up must not hold it open)
} as const

export interface Detector {
  step(rms: number, dtMs: number, mode: Mode): DetectorEvent | null
  reset(): void
  readonly heard: boolean
}

export function createDetector(): Detector {
  const L = LEVELS
  let floor = 0.008 // room level, learnt while nobody speaks
  let sfloor = 0.008 // noise level while the tablet itself is speaking
  let speechMs = 0
  let quietMs = 0
  let recMs = 0
  let bargeMs = 0
  let questionMs = 0
  let heard = false

  const learn = (f: number, r: number) => f * 0.97 + Math.min(r, f * 2) * 0.03

  return {
    get heard() {
      return heard
    },
    reset() {
      speechMs = 0
      quietMs = 0
      recMs = 0
      bargeMs = 0
      questionMs = 0
      heard = false
    },
    step(r, dt, mode) {
      if (mode === 'speaking') {
        const bargeLevel = Math.max(L.BARGE_MIN, floor * L.OVER_ROOM * L.BARGE_OVER, sfloor * L.OVER_ROOM)
        if (r > bargeLevel) bargeMs += dt
        else {
          bargeMs = Math.max(0, bargeMs - dt * 2)
          sfloor = learn(sfloor, r)
        }
        if (bargeMs >= L.BARGE_MS) {
          bargeMs = 0
          return 'barge'
        }
        return null
      }
      recMs += dt
      if (heard) questionMs += dt
      const loud = r > Math.max(L.MIN_LEVEL, floor * L.OVER_ROOM)
      if (loud) {
        speechMs += dt
        quietMs = 0
        if (!heard && speechMs >= L.SPEECH_MS) {
          heard = true
          return 'speech_start'
        }
      } else if (heard) {
        quietMs += dt
      } else {
        speechMs = Math.max(0, speechMs - dt * 2)
        floor = learn(floor, r)
      }
      if (heard && questionMs >= L.MAX_QUESTION_MS) {
        // Too long to be a question: treat this steady sound as the new room level and close the recording.
        floor = Math.max(floor, r / L.OVER_ROOM)
        heard = false
        speechMs = 0
        quietMs = 0
        recMs = 0
        questionMs = 0
        return 'speech_end'
      }
      if (heard && quietMs >= L.END_MS) {
        heard = false // ready for the next question
        speechMs = 0
        quietMs = 0
        recMs = 0
        questionMs = 0
        return 'speech_end'
      }
      if (!heard && recMs > L.IDLE_RESTART_MS) {
        recMs = 0
        return 'idle_restart'
      }
      return null
    },
  }
}
