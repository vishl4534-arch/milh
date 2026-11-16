// Voice mode on the farm tablet (ported from the sea-safe voice mode): the worker speaks, the tablet notices
// when they start and stop, the question goes to the server, and the answer (made by code, never by the model)
// is read aloud; then it listens again. The worker can talk over the answer to interrupt it. "Block 3 is done"
// is only saved after a spoken yes or the ✔ button.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Cross, Speaker } from '../../components/icons'
import { askAudio, askText, fetchLines, type AssistantReply, type Line, type Turn } from './api'
import { createDetector } from './levels'

type State = 'starting' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'nomic'
const WAIT_MS = 1500
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

export function VoiceMode({ lang, farmId, onClose }: Props) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>(() => (hasMic() ? 'starting' : 'nomic'))
  const [log, setLog] = useState<Exchange[]>([])
  const [pending, setPending] = useState<Record<string, string> | null>(null)
  const [typed, setTyped] = useState('')
  const [level, setLevel] = useState(0)

  const ctx = useRef<Record<string, unknown>>({})
  const history = useRef<Turn[]>([])
  const lines = useRef<Record<string, Line>>({})
  const stream = useRef<MediaStream | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const playing = useRef<HTMLAudioElement | null>(null)
  const saying = useRef('')
  const detector = useRef(createDetector())
  const stateRef = useRef<State>(hasMic() ? 'starting' : 'nomic')
  const alive = useRef(true)
  const raf = useRef(0)

  const set = (s: State) => {
    stateRef.current = s
    setState(s)
  }

  const play = useCallback((url: string | null | undefined, text: string, after?: () => void) => {
    playing.current?.pause()
    if (!url) {
      after?.()
      return
    }
    const a = new Audio(url)
    playing.current = a
    saying.current = text
    set('speaking')
    detector.current.reset()
    a.onended = () => {
      if (playing.current === a) playing.current = null
      after?.()
    }
    a.onerror = () => after?.()
    a.play().catch(() => after?.())
  }, [])

  const listen = useCallback(() => {
    if (!alive.current || !stream.current || typeof MediaRecorder === 'undefined') {
      if (alive.current && stateRef.current !== 'nomic') set(stream.current ? 'listening' : 'nomic')
      return
    }
    if (stateRef.current === 'muted') return
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((x) => MediaRecorder.isTypeSupported(x))
    const rec = new MediaRecorder(stream.current, type ? { mimeType: type } : {})
    recorder.current = rec
    chunks.current = []
    detector.current.reset()
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
    rec.start(250)
    set('listening')
  }, [])

  const handle = useCallback((r: AssistantReply, heard: string) => {
    if (!alive.current) return
    if (r.resume) { listen(); return }
    ctx.current = r.context ?? {}
    setPending(r.pending ?? null)
    if (heard || r.transcript) history.current.push({ role: 'user', content: r.transcript || heard })
    history.current.push({ role: 'assistant', content: r.reply })
    history.current = history.current.slice(-12)
    setLog((l) => [...l.slice(-5), { heard: r.transcript || heard, reply: r.reply }])
    play(r.audio_url, r.reply, listen)
  }, [listen, play])

  const ask = useCallback(async (input: { text?: string; blob?: Blob; interrupted?: string }) => {
    set('thinking')
    const waiting = window.setTimeout(() => play(lines.current.wait?.audio_url, ''), WAIT_MS)
    try {
      const r = input.blob
        ? await askAudio(input.blob, { lang, history: history.current, context: ctx.current, interrupted: input.interrupted, farmId })
        : await askText({ question: input.text ?? '', lang, history: history.current, context: ctx.current, farm_id: farmId })
      window.clearTimeout(waiting)
      handle(r, input.text ?? '')
    } catch (err) {
      window.clearTimeout(waiting)
      if (!alive.current) return
      setLog((l) => [...l, { heard: input.text ?? '', reply: err instanceof Error ? err.message : String(err) }])
      listen()
    }
  }, [farmId, handle, lang, listen, play])

  const finishRecording = useCallback((interrupted = '') => {
    const rec = recorder.current
    if (!rec || rec.state === 'inactive') return
    recorder.current = null
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })
      play(lines.current.ok?.audio_url, '')
      void ask({ blob, interrupted })
    }
    rec.stop()
  }, [ask, play])

  // Microphone, level meter and the frame loop.
  useEffect(() => {
    alive.current = true
    const AC = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext
    void fetchLines(lang, farmId).then((l) => { lines.current = l }).catch(() => undefined)
    if (!hasMic()) return () => { alive.current = false }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      .then((s) => {
        if (!alive.current) { s.getTracks().forEach((tr) => tr.stop()); return }
        stream.current = s
        if (AC) {
          const ac = new AC()
          audioCtx.current = ac
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
        if (greeting?.audio_url) play(greeting.audio_url, greeting.text, listen)
        else listen()
      })
      .catch(() => set('nomic'))

    const buf = new Float32Array(1024)
    let last = performance.now()
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
        if (s === 'listening' || s === 'speaking') {
          const ev = detector.current.step(rms, dt, s === 'speaking' ? 'speaking' : 'listening')
          if (ev === 'speech_end') finishRecording()
          else if (ev === 'idle_restart') { recorder.current?.stop(); recorder.current = null; listen() }
          else if (ev === 'barge' && playing.current) {
            const interrupted = saying.current
            playing.current.pause()
            playing.current = null
            listen()
            saying.current = interrupted
          }
        }
        setLevel((p) => p * 0.6 + Math.min(1, rms * 6) * 0.4)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      alive.current = false
      cancelAnimationFrame(raf.current)
      playing.current?.pause()
      recorder.current?.stop()
      stream.current?.getTracks().forEach((tr) => tr.stop())
      void audioCtx.current?.close()
    }
  }, [farmId, finishRecording, lang, listen, play])

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = typed.trim()
    if (!text) return
    setTyped('')
    recorder.current?.stop()
    recorder.current = null
    void ask({ text })
  }

  function answer(yes: boolean) {
    recorder.current?.stop()
    recorder.current = null
    void ask({ text: yes ? 'yes' : 'no' })
  }

  const label: Record<State, string> = {
    starting: t('voice.starting'), listening: t('voice.listening'), thinking: t('voice.thinking'),
    speaking: t('voice.speaking'), muted: t('voice.muted'), nomic: t('voice.micDenied'),
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
            <button type="button" onClick={() => answer(true)} aria-label={t('voice.yes')}
              className="grid h-20 w-32 place-items-center rounded-2xl bg-palm text-5xl"><Check /></button>
            <button type="button" onClick={() => answer(false)} aria-label={t('voice.no')}
              className="grid h-20 w-32 place-items-center rounded-2xl bg-brine text-5xl"><Cross /></button>
          </div>
        )}
      </div>
      <form aria-label={t('kiosk.ask')} onSubmit={submit} className="flex w-full max-w-2xl gap-2">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('voice.type')}
          className="flex-1 rounded-xl bg-salt/10 px-4 py-3 text-lg text-salt placeholder:text-salt/50" />
        <button className="rounded-xl bg-salt px-5 py-3 font-semibold text-ink">{t('kiosk.ask')}</button>
      </form>
    </div>
  )
}
