import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, setToken } from '../api/client'
import { useKioskBundle } from '../api/hooks'
import type { KAnnouncement, KRun, Lang } from '../api/types'
import { savedLanguage, setLanguage } from '../i18n'
import { enqueue, flushOutbox } from './outbox'
import { browserPlayer } from './player'
import { KioskView } from './KioskView'
import { ReadingEntry } from './ReadingEntry'
import { assistantStatus } from './voice/api'
import { VoiceMode } from './voice/VoiceMode'
import { MilhLogo, MilhMark } from '../brand/Logo'

function StartFact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <span className="block px-5 py-4">
      <span className="block text-xs font-medium uppercase tracking-[0.08em] text-white/45">{label}</span>
      <span className="num mt-1 block text-3xl font-semibold">{value}</span>
      {sub && <span className="block text-sm text-white/50">{sub}</span>}
    </span>
  )
}

export function KioskApp({ farmId }: { farmId?: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, error, isLoading, refetch } = useKioskBundle(farmId)
  const player = useMemo(() => browserPlayer(), [])
  const [unlocked, setUnlocked] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [entry, setEntry] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const lang = (i18n.language as Lang) || 'en'
  const voice = useQuery({ queryKey: ['assistant', lang, farmId], queryFn: () => assistantStatus(lang, farmId),
    retry: false, staleTime: 5 * 60_000 })

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    player.onBlocked(() => setBlocked(true))
    player.onPlayed((a) => {
      if (a.id.startsWith('run-')) return // read on demand, not a scheduled announcement
      void api(`/api/v1/announcements/${a.id}/played`, { method: 'POST' }).catch(() => undefined)
    })
    return () => player.stop()
  }, [player])

  useEffect(() => {
    if (!data) return
    const first = savedLanguage() ?? data.bundle.farm.languages.find((l) => l !== 'en') ?? 'en'
    if (!i18n.language || !data.bundle.farm.languages.includes(i18n.language as Lang)) void setLanguage(first)
  }, [data, i18n])

  useEffect(() => {
    if (data) player.load(data.bundle.announcements, lang)
  }, [data, lang, player])

  useEffect(() => {
    const send = () => void flushOutbox().then((r) => { if (r.sent) void refetch() })
    window.addEventListener('online', send)
    const id = window.setInterval(send, 60_000)
    send()
    return () => {
      window.removeEventListener('online', send)
      window.clearInterval(id)
    }
  }, [refetch])

  async function done(run: KRun) {
    const body = { id: crypto.randomUUID(), plan_id: run.plan_id, block_id: run.block_id,
      source_id: run.steps[0]?.source_id ?? null, started_at: run.start ?? new Date().toISOString(),
      minutes: run.minutes, method: 'tap' }
    try {
      await api('/api/v1/irrigation-events', { method: 'POST', json: body })
    } catch {
      await enqueue({ id: body.id, path: '/api/v1/irrigation-events', body })
    }
    await qc.invalidateQueries({ queryKey: ['bundle'] })
  }

  /** Play an announcement. With none (e.g. the plan was made after the block's start time), read the
   *  block's own instruction: the farm's voice from the server, or the tablet's voice when offline. */
  async function listen(a: KAnnouncement | null, run?: KRun) {
    if (a) {
      void player.playNow(a)
      return
    }
    if (!run) return
    let text = run.text[lang] || run.text.en || ''
    let audio: string | null = null
    try {
      const r = await api<{ text: string; audio_url: string | null }>(`/api/v1/kiosk/runs/${run.plan_id}/speech?lang=${lang}`)
      text = r.text || text
      audio = r.audio_url
    } catch { /* offline: the tablet's own voice reads the text */ }
    void player.playNow({
      id: `run-${run.plan_id}`, type: 'irrigation_start', scheduled_at: new Date().toISOString(),
      text: { [lang]: text }, audio: audio ? { [lang]: audio } : {}, status: 'scheduled', plan_id: run.plan_id,
    })
  }

  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      setToken(null)
      navigate(farmId ? '/login' : '/kiosk/login', { replace: true })
    }
  }, [error, farmId, navigate])

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-salt">
        <span className="flex flex-col items-center gap-3 text-xl text-ink-soft">
          <MilhMark className="rise-in h-24 w-20" />
          {t('common.loading')}
        </span>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="grid min-h-dvh place-items-center gap-4 p-6 text-center">
        <p className="text-xl">{error instanceof Error ? error.message : t('kiosk.noPlan')}</p>
        <button type="button" className="press rounded-xl bg-ink px-6 py-3 text-salt" onClick={() => refetch()}>{t('common.retry')}</button>
      </div>
    )
  }

  if (!unlocked) {
    // The first tap of the day (it also lets the browser play sound).
    const b = data.bundle
    const tz = b.farm.timezone
    const runs = b.runs.filter((r) => r.steps.length > 0)
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now))
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now))
    return (
      <button type="button" onClick={() => { player.unlock(); setUnlocked(true) }}
        className="kiosk-start group relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden px-6 text-center text-white">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(14_107_75/0.35),transparent_70%)]" />
        <span className="relative flex w-full max-w-xl flex-col items-center">
          <MilhLogo color="#ffffff" className="fade-in h-9 w-auto" />
          <span className="num mt-12 text-[clamp(4.5rem,13vw,8rem)] font-semibold leading-none tracking-tight">{clock}</span>
          <span className="mt-3 text-lg text-white/60">{date} · {b.farm.name}</span>
          <span className="mt-10 grid w-full grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-start">
            <StartFact label={t('kiosk.today')} value={`${runs.length}`} sub={t('kiosk.blocksToWater', { defaultValue: 'blocks to water' })} />
            <StartFact label={t('kiosk.water')} value={`${runs.reduce((a, r) => a + r.minutes, 0)}`} sub={t('common.minutes')} />
            <StartFact label={t('kiosk.sunrise')} value={b.sun?.sunrise ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(b.sun.sunrise)) : '—'} sub="" />
          </span>
          <span className="mt-10 inline-flex h-16 items-center gap-3 rounded-xl bg-white px-8 text-xl font-semibold text-[#0e1311] shadow-[0_10px_40px_-10px_rgb(14_107_75/0.7)] transition-transform group-active:scale-[0.98]">
            {t('kiosk.tapToStart')}
          </span>
          <span className="mt-4 text-[0.9375rem] text-white/50">{t('kiosk.tapToStartHint')}</span>
        </span>
      </button>
    )
  }

  return (
    <>
      <KioskView state={data} lang={lang} now={now} onDone={done} onListen={listen}
        onLang={(l) => void setLanguage(l)} onAddReading={() => setEntry(true)} soundBlocked={blocked}
        onUnblockSound={() => { setBlocked(false); player.unlock() }}
        canAsk={voice.data?.available === true} onAsk={() => setVoiceOpen(true)} />
      {voiceOpen && (
        <VoiceMode lang={lang} farmId={farmId}
          onClose={() => { setVoiceOpen(false); void qc.invalidateQueries({ queryKey: ['bundle'] }) }} />
      )}
      {entry && (
        <ReadingEntry bundle={data.bundle} lang={lang} onClose={() => setEntry(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['bundle'] })} />
      )}
    </>
  )
}
