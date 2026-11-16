// Voice mode on the farm tablet (ported from the sea-safe voice mode): the worker speaks, the tablet notices
// when they start and stop, the question goes to the server, and the answer (made by code, never by the model)
// is read aloud; then it listens again. The worker can talk over the answer to interrupt it. "Block 3 is done"
// is only saved after a spoken yes or the ✔ button.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Cross, Speaker } from '../../components/icons'
import { askAudio, askText, fetchLines, type AssistantReply, type Line, type Turn } from './api'
import { createDetector } from './levels'

type State = 'starting' | 'listening' | 'thinking' | 'speaking' | 'nomic'
const WAIT_MS = 1500
const LEVEL_EVERY_MS = 80 // the orb is redrawn at most this often
const hasMic = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

interface Props {
  lang: string
  farmId?: string
  onClose: () => void
}

interface Exchange {
  heard: string
  reply: string
}

interface Recording {
  rec: MediaRecorder
  parts: Blob[] // each recording keeps its own pieces, so a late piece never leaks into the next question
}

export function VoiceMode({ lang, farmId, onClose }: Props) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>(() => (hasMic() ? 'starting' : 'nomic'))
  const [log, setLog] = useState<Exchange[]>([])
  const [pending, setPending] = useState<Record<string, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState('')
  const [level, setLevel] = useState(0)

  const ctx = useRef<Record<string, unknown>>({})
  const history = useRef<Turn[]>([])
  const lines = useRef<Record<string, Line>>({})
  const stream = useRef<MediaStream | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const recording = useRef<Recording | null>(null)
  const answerAudio = useRef<HTMLAudioElement | null>(null)
  const fillerAudio = useRef<HTMLAudioElement | null>(null)
  const saying = useRef('') // the answer being read aloud, sent with a recording that talked over it
  const interrupted = useRef('')
  const detector = useRef(createDetector())
  const stateRef = useRef<State>(state)
  const busyRef = useRef(false)
  const open = useRef(true)
  const waitTimer = useRef(0)

  const set = (s: State) => {
    stateRef.current = s
    setState(s)
  }

  const stopRecording = () => {
    const r = recording.current
    recording.current = null
    if (r && r.rec.state !== 'inactive') {
      r.rec.onstop = null
      r.rec.stop()
    }
  }

  /** Short fixed lines ("Okay.", "One moment.") play over whatever is happening and never change the state. */
  const playFiller = (url: string | null | undefined) => {
    if (!url || !open.current) return
    fillerAudio.current?.pause()
    const a = new Audio(url)
    fillerAudio.current = a
    a.play().catch(() => undefined)
  }

  const listen = useCallback(() => {
    if (!open.current) return
    stopRecording()
    if (!stream.current || typeof MediaRecorder === 'undefined') {
      set(stream.current ? 'listening' : 'nomic')
      return
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((x) => MediaRecorder.isTypeSupported(x))
    const rec = new MediaRecorder(stream.current, type ? { mimeType: type } : {})
    const r: Recording = { rec, parts: [] }
    rec.ondataavailable = (e) => { if (e.data.size) r.parts.push(e.data) }
    recording.current = r
    detector.current.reset()
    rec.start(250)
    set('listening')
  }, [])

  /** Read an answer aloud, then call `after` exactly once (on end, error or refusal). */
  const speak = useCallback((url: string | null | undefined, text: string, after: () => void) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (answerAudio.current === a) answerAudio.current = null
      if (open.current) after()
    }
    answerAudio.current?.pause()
    if (!url || !open.current) {
      after()
      return
    }
    stopRecording()
    const a = new Audio(url)
    answerAudio.current = a
    saying.current = text
    detector.current.reset()
    set('speaking')
    a.onended = finish
    a.onerror = finish
    a.play().catch(finish)
  }, [])

  const ask = useCallback(async (input: { text?: string; blob?: Blob; interrupted?: string }) => {
    if (busyRef.current || !open.current) return
    busyRef.current = true
    setBusy(true)
    stopRecording()
    set('thinking')
    waitTimer.current = window.setTimeout(() => playFiller(lines.current.wait?.audio_url), WAIT_MS)
    let r: AssistantReply | null = null
    let failure = ''
    try {
      r = input.blob
        ? await askAudio(input.blob, { lang, history: history.current, context: ctx.current, interrupted: input.interrupted, farmId })
        : await askText({ question: input.text ?? '', lang, history: history.current, context: ctx.current, farm_id: farmId })
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err)
    }
    window.clearTimeout(waitTimer.current)
    busyRef.current = false
    setBusy(false)
    if (!open.current) return
    if (!r) {
      setLog((l) => [...l.slice(-5), { heard: input.text ?? '', reply: failure }])
      listen()
      return
    }
    if (r.resume) { listen(); return }
    const heard = r.transcript || input.text || ''
    ctx.current = r.context ?? {}
    setPending(r.pending ?? null)
    if (heard) history.current.push({ role: 'user', content: heard })
    history.current.push({ role: 'assistant', content: r.reply })
    history.current = history.current.slice(-12)
    setLog((l) => [...l.slice(-5), { heard, reply: r.reply }])
    speak(r.audio_url, r.reply, listen)
  }, [farmId, lang, listen, speak])

  const finishRecording = useCallback(() => {
    const r = recording.current
    if (!r || r.rec.state === 'inactive') return
    recording.current = null
    const over = interrupted.current
    interrupted.current = ''
    r.rec.onstop = () => {
      const blob = new Blob(r.parts, { type: r.rec.mimeType || 'audio/webm' })
      playFiller(lines.current.ok?.audio_url)
      void ask({ blob, interrupted: over })
    }
    r.rec.stop()
  }, [ask])

  // Microphone, level meter and the frame loop.
  useEffect(() => {
    open.current = true
    let cancelled = false
    let ac: AudioContext | null = null
    let raf = 0
    void fetchLines(lang, farmId).then((l) => { lines.current = l }).catch(() => undefined)
    if (hasMic()) {
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
        .then((s) => {
          if (cancelled) { s.getTracks().forEach((tr) => tr.stop()); return }
          stream.current = s
          const AC = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext
          if (AC) {
            ac = new AC()
            const src = ac.createMediaStreamSource(s)
            const band = ac.createBiquadFilter() // the voice band only
            band.type = 'bandpass'
            band.frequency.value = 1000
            band.Q.value = 0.6
            const an = ac.createAnalyser()
            an.fftSize = 1024
            src.connect(band)
            band.connect(an)
            analyser.current = an
          }
          const greeting = lines.current.greeting
          speak(greeting?.audio_url, greeting?.text ?? '', listen)
        })
        .catch(() => { if (!cancelled) set('nomic') })
    }

    const buf = new Float32Array(1024)
    let last = performance.now()
    let lastDraw = 0
    let smooth = 0
    const tick = (now: number) => {
      const dt = Math.min(100, now - last)
      last = now
      const an = analyser.current
      if (an) {
        an.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        const s = stateRef.current
        if (!busyRef.current && (s === 'listening' || s === 'speaking')) {
          const ev = detector.current.step(rms, dt, s === 'speaking' ? 'speaking' : 'listening')
          if (ev === 'speech_end') finishRecording()
          else if (ev === 'idle_restart') listen()
          else if (ev === 'barge' && answerAudio.current) {
            interrupted.current = saying.current // the server checks whether this was only the tablet's own voice
            const a = answerAudio.current
            answerAudio.current = null
            a.onended = null
            a.onerror = null
            a.pause()
            listen()
          }
        }
        smooth = smooth * 0.6 + Math.min(1, rms * 6) * 0.4
        if (now - lastDraw > LEVEL_EVERY_MS) {
          lastDraw = now
          setLevel(smooth)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      open.current = false
      cancelAnimationFrame(raf)
      window.clearTimeout(waitTimer.current)
      answerAudio.current?.pause()
      fillerAudio.current?.pause()
      stopRecording()
      stream.current?.getTracks().forEach((tr) => tr.stop())
      stream.current = null
      analyser.current = null
      void ac?.close()
    }
  }, [farmId, finishRecording, lang, listen, speak])

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = typed.trim()
    if (!text || busy) return
    setTyped('')
    void ask({ text })
  }

  const label: Record<State, string> = {
    starting: t('voice.starting'), listening: t('voice.listening'), thinking: t('voice.thinking'),
    speaking: t('voice.speaking'), nomic: t('voice.micDenied'),
  }
  const last = log[log.length - 1]

  return (
    <div role="dialog" aria-modal="true" aria-label={t('kiosk.ask')}
      className="fixed inset-0 z-30 flex flex-col items-center justify-between gap-4 bg-ink p-6 text-salt">
      <div className="flex w-full justify-end">
        <button type="button" onClick={onClose} aria-label={t('voice.close')}
          className="grid size-14 place-items-center rounded-full bg-salt/10 text-3xl"><Cross /></button>
      </div>
      <div className="flex flex-col items-center gap-6 text-center">
        <div aria-hidden className="grid size-48 place-items-center rounded-full bg-palm transition-transform duration-150"
          style={{ transform: `scale(${1 + level * 0.35})` }}>
          <Speaker className="text-7xl" />
        </div>
        <p role="status" className="text-2xl font-semibold">{label[state]}</p>
        {last && (
          <div className="max-w-3xl space-y-3" aria-live="polite">
            {last.heard && <p className="text-xl text-salt/70">“{last.heard}”</p>}
            <p className="text-2xl leading-relaxed md:text-3xl">{last.reply}</p>
          </div>
        )}
        {pending && (
          <div className="flex gap-4">
            <button type="button" onClick={() => void ask({ text: 'yes' })} disabled={busy} aria-label={t('voice.yes')}
              className="grid h-20 w-32 place-items-center rounded-2xl bg-palm text-5xl disabled:opacity-40"><Check /></button>
            <button type="button" onClick={() => void ask({ text: 'no' })} disabled={busy} aria-label={t('voice.no')}
              className="grid h-20 w-32 place-items-center rounded-2xl bg-brine text-5xl disabled:opacity-40"><Cross /></button>
          </div>
        )}
      </div>
      <form aria-label={t('kiosk.ask')} onSubmit={submit} className="flex w-full max-w-2xl gap-2">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('voice.type')}
          className="flex-1 rounded-xl bg-salt/10 px-4 py-3 text-lg text-salt placeholder:text-salt/50" />
        <button disabled={busy} className="rounded-xl bg-salt px-5 py-3 font-semibold text-ink disabled:opacity-40">{t('kiosk.ask')}</button>
      </form>
    </div>
  )
}
