/** The tablet's own voice, used when there is no recorded clip (no ElevenLabs key, or offline).
 *
 *  A browser voice reading a whole instruction as one utterance sounds flat and robotic. Here the text is
 *  read phrase by phrase, like a person would: the best natural voice on the device, a lift at the start,
 *  a slight rise before commas and colons, emphasis on "!", a falling cadence on the last phrase, numbers
 *  a touch slower, and real pauses between phrases. */

export interface Phrase {
  text: string
  pitch: number
  rate: number
  pauseMs: number
}

const BASE_RATE = 0.95
// Words that make a voice clearly better than the default robotic one, best first.
const QUALITY: RegExp[] = [/natural/i, /neural/i, /premium|enhanced/i, /online/i, /google/i, /siri/i]

/** Units and symbols spelled the way a person says them. */
export function forSpeech(text: string): string {
  return text
    .replace(/(\d)\s*%/g, '$1 percent')
    .replace(/\bdS\/m\b/g, 'deci-siemens per metre')
    .replace(/\bmin\b/g, 'minutes')
    .replace(/\bET0\b|ET₀/g, 'E T zero')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split into spoken phrases and give each its own pitch, pace and following pause. */
export function phrases(raw: string): Phrase[] {
  const text = forSpeech(raw)
  // A decimal or thousands separator between digits ("4.01", "1,000") is part of the number, not a break.
  const parts = text.match(/(?:\d[.,]\d|[^.!?…:;,،۔])+(?:\.\.\.|…|[.!?:;,،۔])*/g) ?? []
  const list = parts.map((p) => p.trim()).filter(Boolean)
  return list.map((p, i) => {
    const end = p.endsWith('...') || p.endsWith('…') ? '...' : p.slice(-1)
    const first = i === 0
    const last = i === list.length - 1
    let pitch = 1.0
    let rate = BASE_RATE
    if (first) pitch += 0.06 // heading: "Block 1, Date palm"
    if (end === ',' || end === '،') pitch += 0.03 // continuation rise
    if (end === ':' || end === ';') pitch += 0.04
    if (end === '!') { pitch += 0.1; rate += 0.03 } // emphasis
    if (/\d/.test(p)) rate -= 0.06 // numbers slower, so they are heard right
    if (last && end !== '!' && end !== '?') pitch -= 0.07 // falling cadence: the announcement ends
    else if (end === '.' || end === '۔') pitch -= 0.04 // each sentence steps down a little
    const pauseMs = last ? 0
      : end === '...' ? 650
        : end === '.' || end === '!' || end === '?' || end === '۔' ? 420
          : end === ':' || end === ';' ? 300
            : 170
    return { text: p.replace(/\.\.\.$|…$/, '.'), pitch: round(pitch), rate: round(rate), pauseMs }
  })
}

const round = (n: number) => Math.round(n * 100) / 100

function voices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis
  const now = synth.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices())
    synth.addEventListener('voiceschanged', done, { once: true })
    window.setTimeout(done, 1500)
  })
}

/** The most natural-sounding voice for the language, or null to let the browser choose. */
export function pickVoice(all: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const want = lang.toLowerCase()
  const pool = all.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(want))
  if (!pool.length) return null
  const score = (v: SpeechSynthesisVoice) => {
    const q = QUALITY.findIndex((re) => re.test(v.name))
    let s = q === -1 ? 0 : (QUALITY.length - q) * 10
    if (!v.localService) s += 3 // network voices are usually the higher-quality ones
    if (want === 'en' && /en-(gb|us)/i.test(v.lang)) s += 2
    if (v.default) s += 1
    return s
  }
  return [...pool].sort((a, b) => score(b) - score(a))[0]
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

function say(p: Phrase, lang: string, voice: SpeechSynthesisVoice | null): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(p.text)
    u.lang = voice?.lang ?? lang
    if (voice) u.voice = voice
    u.pitch = p.pitch
    u.rate = p.rate
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

let speaking = 0

/** Speak text with natural phrasing. A newer call interrupts an older one. */
export async function speakNatural(text: string, lang: string): Promise<void> {
  if (!('speechSynthesis' in window) || !text) return
  const id = ++speaking
  window.speechSynthesis.cancel()
  const voice = pickVoice(await voices(), lang)
  for (const p of phrases(text)) {
    if (id !== speaking) return
    await say(p, lang, voice)
    if (p.pauseMs) await sleep(p.pauseMs)
  }
}
