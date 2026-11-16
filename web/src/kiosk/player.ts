import type { KAnnouncement } from '../api/types'
import { pick } from '../i18n'
import { audioUrl } from './offline'

/** How late an announcement may be and still play (e.g. the tablet woke up a little late). */
const LATE_LIMIT_MS = 10 * 60 * 1000
const PLAYABLE = new Set(['scheduled'])

type Timer = unknown

export interface PlayerDeps {
  now: () => number
  setTimer: (fn: () => void, ms: number) => Timer
  clearTimer: (t: Timer) => void
  play: (a: KAnnouncement, lang: string) => Promise<void>
}

export interface Player {
  unlock(): void
  isUnlocked(): boolean
  load(list: KAnnouncement[], lang: string): void
  playNow(a: KAnnouncement): Promise<void>
  onBlocked(cb: () => void): void
  onPlayed(cb: (a: KAnnouncement) => void): void
  stop(): void
}

export function createPlayer(deps: PlayerDeps): Player {
  let unlocked = false
  let lang = 'en'
  let pending: KAnnouncement[] = []
  const timers = new Map<string, Timer>()
  const blockedCbs: (() => void)[] = []
  const playedCbs: ((a: KAnnouncement) => void)[] = []

  async function run(a: KAnnouncement): Promise<void> {
    try {
      await deps.play(a, lang)
      playedCbs.forEach((cb) => cb(a))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') blockedCbs.forEach((cb) => cb())
    }
  }

  function schedule(): void {
    if (!unlocked) return
    const now = deps.now()
    for (const a of pending) {
      if (!PLAYABLE.has(a.status) || timers.has(a.id)) continue
      const wait = Date.parse(a.scheduled_at) - now
      if (wait < -LATE_LIMIT_MS) continue
      timers.set(a.id, deps.setTimer(() => void run(a), Math.max(0, wait)))
    }
  }

  return {
    unlock() {
      unlocked = true
      schedule()
    },
    isUnlocked: () => unlocked,
    load(list, l) {
      lang = l
      pending = list
      schedule()
    },
    playNow: (a) => run(a),
    onBlocked: (cb) => void blockedCbs.push(cb),
    onPlayed: (cb) => void playedCbs.push(cb),
    stop() {
      timers.forEach((t) => deps.clearTimer(t))
      timers.clear()
    },
  }
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = new Audio(url)
    el.onended = () => resolve()
    el.onerror = () => reject(new Error(`cannot play ${url}`))
    el.play().catch(reject)
  })
}

function speak(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

/** Chime, then the cached ElevenLabs clip. With no clip, the browser's own voice reads the text. */
export async function playAnnouncement(a: KAnnouncement, lang: string): Promise<void> {
  await playUrl('/chime.wav')
  const url = pick(a.audio, lang)
  if (url) {
    try {
      await playUrl(await audioUrl(url))
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') throw err
    }
  }
  await speak(pick(a.text, lang), lang)
}

export const browserPlayer = (): Player =>
  createPlayer({
    now: () => Date.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (t) => window.clearTimeout(t as number),
    play: playAnnouncement,
  })
