import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { MilhLogo } from '../brand/Logo'
import { Eye, EyeOff } from '../components/icons'
import { SkyScene } from '../kiosk/scene/SkyScene'

const DEVICE_KEY = 'milh.deviceKey'

/** The art half: the brand picture from web/public/login-art.webp, with the headline over it. Until that
 *  picture exists (or if it fails to load) the farm's living sky is shown instead, so it never looks empty. */
function ArtPanel() {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => Date.now())
  const [art, setArt] = useState<'loading' | 'ok' | 'none'>('loading')
  const serif = i18n.language === 'ur' ? 'font-urdu' : 'font-serif'
  return (
    <aside className="relative hidden overflow-hidden rounded-[2rem] bg-[#0e1f18] md:block">
      {art !== 'ok' && (
        <div aria-hidden className="absolute inset-0 [&>div]:h-full [&>div]:rounded-none">
          <SkyScene tall now={now} sunrise={null} sunset={null} tz="Asia/Muscat" />
        </div>
      )}
      <img src="/login-art.webp" alt="" onLoad={() => setArt('ok')} onError={() => setArt('none')}
        className={`absolute inset-0 h-full w-full object-cover ${art === 'ok' ? 'art-in' : 'opacity-0'}`} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25" />

      <div className="absolute inset-x-10 top-10 flex items-center gap-5 text-xs font-semibold uppercase tracking-[0.3em] text-white/90">
        <span>{t('login.artLabel')}</span>
        <span aria-hidden className="h-px w-24 bg-white/60" />
      </div>
      <div className="absolute inset-x-10 bottom-10 text-white">
        <h2 className={`rise-in max-w-md text-6xl leading-[0.95] lg:text-7xl xl:text-8xl ${serif}`}>{t('login.artTitle')}</h2>
        <p className="rise-in mt-5 max-w-sm text-base leading-relaxed text-white/85" style={{ animationDelay: '120ms' }}>
          {t('login.artBody')}
        </p>
      </div>
    </aside>
  )
}

interface ShellProps {
  eyebrow?: string
  title: string
  subtitle: string
  footer: ReactNode
  children: ReactNode
}

function Shell({ eyebrow, title, subtitle, footer, children }: ShellProps) {
  const { i18n } = useTranslation()
  const serif = i18n.language === 'ur' ? 'font-urdu' : 'font-serif'
  return (
    <div className="grid min-h-dvh gap-3 bg-panel p-3 md:grid-cols-2">
      <ArtPanel />
      <main className="flex min-h-[calc(100dvh-1.5rem)] flex-col px-4 py-4 sm:px-10">
        <div className="flex justify-center"><MilhLogo className="h-10 w-auto" /></div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="rise-in text-center">
            {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-palm">{eyebrow}</p>}
            <h1 className={`text-5xl leading-none sm:text-6xl ${serif}`}>{title}</h1>
            <p className="mt-4 text-ink-soft">{subtitle}</p>
          </div>
          <div className="rise-in mt-10" style={{ animationDelay: '80ms' }}>{children}</div>
        </div>
        <p className="text-center text-ink-soft">{footer}</p>
      </main>
    </div>
  )
}

const field = 'mt-2 h-12 w-full rounded-xl bg-salt px-4 text-base ring-1 ring-line/80 transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-palm'
const label = 'block text-sm font-medium'
const submitBtn = 'press mt-3 h-12 w-full rounded-xl bg-ink text-base font-semibold text-salt shadow-[0_10px_24px_-12px_rgba(27,36,33,.9)] transition-colors duration-150 disabled:opacity-60 [@media(hover:hover)]:hover:bg-palm-deep'

function SecretInput({ value, onChange, autoComplete, pin = false }:
  { value: string; onChange: (v: string) => void; autoComplete?: string; pin?: boolean }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input className={`${field} pe-12 ${pin ? 'num text-2xl tracking-[0.5em]' : ''}`} type={shown ? 'text' : 'password'}
        inputMode={pin ? 'numeric' : undefined} autoComplete={autoComplete} value={value}
        onChange={(e) => onChange(e.target.value)} required />
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? t('login.hide') : t('login.show')}
        aria-pressed={shown}
        className="press absolute end-2 top-1/2 mt-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-xl text-ink-soft">
        {shown ? <EyeOff /> : <Eye />}
      </button>
    </div>
  )
}

function ErrorLine({ text }: { text: string }) {
  return text ? <p role="alert" className="rounded-xl bg-brine/10 px-3 py-2 text-sm text-brine">{text}</p> : null
}

export function OwnerLogin() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api<{ access_token: string }>('/api/v1/auth/login', { method: 'POST', json: { email, password } })
      setToken(r.access_token)
      nav('/owner')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell eyebrow={t('login.title')} title={t('login.welcome')} subtitle={t('login.subtitle')}
      footer={<>{t('login.toKiosk')} <Link to="/kiosk/login" className="font-semibold text-ink underline-offset-4 hover:underline">{t('login.toKioskLink')}</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className={label}>{t('login.email')}
          <input className={field} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={label}>{t('login.password')}
          <SecretInput value={password} onChange={setPassword} autoComplete="current-password" />
        </label>
        <ErrorLine text={error} />
        <button className={submitBtn} disabled={busy}>{t('login.submit')}</button>
      </form>
    </Shell>
  )
}

export function KioskLogin() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [key, setKey] = useState(() => {
    try { return localStorage.getItem(DEVICE_KEY) ?? '' } catch { return '' }
  })
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api<{ access_token: string }>('/api/v1/auth/kiosk', { method: 'POST', json: { device_key: key.trim(), pin } })
      try { localStorage.setItem(DEVICE_KEY, key.trim()) } catch { /* ignore */ }
      setToken(r.access_token)
      nav('/kiosk')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell title={t('login.kioskTitle')} subtitle={t('login.kioskSubtitle')}
      footer={<>{t('login.toOwner')} <Link to="/login" className="font-semibold text-ink underline-offset-4 hover:underline">{t('login.toOwnerLink')}</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className={label}>{t('login.deviceKey')}
          <input className={field} value={key} onChange={(e) => setKey(e.target.value)} required />
        </label>
        <label className={label}>{t('login.pin')}
          <SecretInput value={pin} onChange={setPin} pin />
        </label>
        <ErrorLine text={error} />
        <button className={`${submitBtn} bg-palm`} disabled={busy}>{t('login.kioskSubmit')}</button>
      </form>
    </Shell>
  )
}
