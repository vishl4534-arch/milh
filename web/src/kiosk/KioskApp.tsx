import { useQueryClient } from '@tanstack/react-query'
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

export function KioskApp({ farmId }: { farmId?: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, error, isLoading, refetch } = useKioskBundle(farmId)
  const player = useMemo(() => browserPlayer(), [])
  const [unlocked, setUnlocked] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [entry, setEntry] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const lang = (i18n.language as Lang) || 'en'

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

  if (isLoading) return <div className="grid min-h-dvh place-items-center text-2xl">{t('common.loading')}</div>
  if (error || !data) {
    return (
      <div className="grid min-h-dvh place-items-center gap-4 p-6 text-center">
        <p className="text-xl">{error instanceof Error ? error.message : t('kiosk.noPlan')}</p>
        <button type="button" className="rounded-xl bg-ink px-6 py-3 text-salt" onClick={() => refetch()}>{t('common.retry')}</button>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <button type="button" onClick={() => { player.unlock(); setUnlocked(true) }}
        className="grid min-h-dvh w-full place-items-center bg-ink text-salt">
        <span className="flex flex-col items-center gap-4">
          <span className="grid size-40 place-items-center rounded-full bg-palm text-7xl"><Speaker /></span>
          <span className="font-display text-4xl font-bold">{t('kiosk.tapToStart')}</span>
          <span className="text-lg text-salt/70">{t('kiosk.tapToStartHint')}</span>
        </span>
      </button>
    )
  }

  return (
    <>
      <KioskView state={data} lang={lang} now={now} onDone={done} onListen={listen}
        onLang={(l) => void setLanguage(l)} onAddReading={() => setEntry(true)} soundBlocked={blocked}
        onUnblockSound={() => { setBlocked(false); player.unlock() }} />
      {entry && (
        <ReadingEntry bundle={data.bundle} lang={lang} onClose={() => setEntry(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['bundle'] })} />
      )}
    </>
  )
}
