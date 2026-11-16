import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, setToken } from '../api/client'
import { useKioskBundle } from '../api/hooks'
import type { KAnnouncement, KRun, Lang } from '../api/types'
import { Speaker } from '../components/icons'
import { savedLanguage, setLanguage } from '../i18n'
import { enqueue, flushOutbox } from './outbox'
import { browserPlayer } from './player'
import { KioskView } from './KioskView'
import { ReadingEntry } from './ReadingEntry'
import { assistantStatus } from './voice/api'
import { VoiceMode } from './voice/VoiceMode'
import { MilhLogo, MilhMark } from '../brand/Logo'
import { dayMonth, hhmm } from '../lib/format'
import { greetingKey } from './greeting'
import { LoopVideo } from '../earth/LoopVideo'

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

  function listen(a: KAnnouncement | null) {
    if (a) void player.playNow(a)
  }

  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      setToken(null)
      navigate(farmId ? '/login' : '/kiosk/login', { replace: true })
    }
  }, [error, farmId, navigate])

  if (isLoading) {
    return (
      <div className="earth grid place-items-center">
        <div aria-hidden className="earth-backdrop" />
        <span className="flex flex-col items-center gap-3 text-xl text-ink-soft">
          <MilhMark color="#f7f8f4" className="rise-in h-24 w-20" />
          {t('common.loading')}
        </span>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="earth grid place-items-center gap-4 p-6 text-center">
        <div aria-hidden className="earth-backdrop" />
        <p className="text-xl">{error instanceof Error ? error.message : t('kiosk.noPlan')}</p>
        <button type="button" className="press rounded-xl bg-ink px-6 py-3 text-salt" onClick={() => refetch()}>{t('common.retry')}</button>
      </div>
    )
  }

  if (!unlocked) {
    // The first tap of the day (it also lets the browser play sound): a sunrise on a date farm, a greeting,
    // and one big button.
    const tz = data.bundle.farm.timezone
    return (
      <button type="button" onClick={() => { player.unlock(); setUnlocked(true) }}
        className="earth relative block w-full overflow-hidden bg-[#0b0e07] text-start">
        <LoopVideo src="/scenes/farm-hero.mp4" poster="/scenes/farm-hero.webp" className="kenburns absolute inset-0" />
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,14,7,.85)_0%,rgba(11,14,7,.55)_45%,rgba(11,14,7,.05)_80%)] rtl:bg-[linear-gradient(270deg,rgba(11,14,7,.85)_0%,rgba(11,14,7,.55)_45%,rgba(11,14,7,.05)_80%)]" />
        <span className="relative flex min-h-dvh flex-col justify-between gap-8 p-6 md:p-12">
          <MilhLogo color="#f7f8f4" className="card-in h-11 w-auto self-start" />
          <span className="flex max-w-xl flex-col gap-4">
            <span className="card-in text-3xl text-white/85 md:text-4xl" style={{ animationDelay: '120ms' }}>{t(greetingKey(now, tz))},</span>
            <span className="card-in text-5xl font-bold leading-[1.05] text-white md:text-7xl" style={{ animationDelay: '200ms' }}>{data.bundle.farm.name}</span>
            <span className="card-in text-xl text-white/80" style={{ animationDelay: '280ms' }}>{t('login.artTitle')}</span>
            <span className="card-in num text-lg text-white/70" style={{ animationDelay: '340ms' }}>{dayMonth(now, tz)} · {hhmm(now, tz)}</span>
          </span>
          <span className="card-in flex items-center gap-5" style={{ animationDelay: '420ms' }}>
            <span className="relative grid size-24 shrink-0 place-items-center md:size-28">
              <span aria-hidden className="ring absolute inset-0 rounded-full bg-sun" />
              <span className="relative grid size-24 place-items-center rounded-full bg-sun text-5xl text-[#0b0e07] shadow-[0_20px_50px_-15px_rgba(246,183,60,.8)] md:size-28">
                <Speaker />
              </span>
            </span>
            <span className="flex flex-col">
              <span className="text-3xl font-bold text-white md:text-4xl">{t('kiosk.tapToStart')}</span>
              <span className="text-lg text-white/75">{t('kiosk.tapToStartHint')}</span>
            </span>
          </span>
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
        <div className="earth-scope">
          <ReadingEntry bundle={data.bundle} lang={lang} onClose={() => setEntry(false)}
            onSaved={() => void qc.invalidateQueries({ queryKey: ['bundle'] })} />
        </div>
      )}
    </>
  )
}
