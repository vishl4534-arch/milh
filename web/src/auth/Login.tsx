import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { MilhLogo } from '../brand/Logo'
import { Check, Eye, EyeOff } from '../components/icons'
import type { Lang } from '../api/types'
import { setLanguage } from '../i18n'
import { SkyScene } from '../kiosk/scene/SkyScene'

const DEVICE_KEY = 'milh.deviceKey'

/** The art half: a brand picture with the headline over it. Each page names its pictures in order of
 *  preference (its own, then the shared one); if none loads, the farm's living sky is shown instead, so the
 *  panel never looks empty. */
function ArtPanel({ sources }: { sources: string[] }) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => Date.now())
  const [art, setArt] = useState<'loading' | 'ok' | 'none'>('loading')
  const [pick, setPick] = useState(0)
  const serif = i18n.language === 'ur' ? 'font-urdu' : 'font-serif'
  return (
    <aside className="relative hidden overflow-hidden rounded-2xl bg-[#0c100e] md:block">
      {art !== 'ok' && (
        <div aria-hidden className="absolute inset-0 [&>div]:h-full [&>div]:rounded-none">
          <SkyScene tall now={now} sunrise={null} sunset={null} tz="Asia/Muscat" />
        </div>
      )}
      {pick < sources.length && (
        <img key={sources[pick]} src={sources[pick]} alt="" onLoad={() => setArt('ok')}
          onError={() => { if (pick + 1 < sources.length) setPick(pick + 1); else setArt('none') }}
          className={`absolute inset-0 h-full w-full object-cover ${art === 'ok' ? 'art-in' : 'opacity-0'}`} />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25" />

      <div className="absolute inset-x-10 top-10 flex items-center gap-5 text-xs font-semibold uppercase tracking-[0.3em] text-white/90">
        <span>{t('login.artLabel')}</span>
        <span aria-hidden className="h-px w-24 bg-white/60" />
      </div>
      <div className="absolute inset-x-10 bottom-10 text-white">
        <h2 className={`rise-in max-w-md text-5xl font-semibold leading-[1] tracking-tight lg:text-6xl ${serif}`}>{t('login.artTitle')}</h2>
        <p className="rise-in mt-5 max-w-sm text-base leading-relaxed text-white/85" style={{ animationDelay: '120ms' }}>
          {t('login.artBody')}
        </p>
      </div>
    </aside>
  )
}

const SHARED_ART = '/login-art.webp'

interface DemoOwner { name: string; title: string; role: string; email: string; password: string; note: string }
interface DemoWorker { name: string; title: string; language: string; pin: string; device_key: string; note: string }
interface DemoList { farm: string; owners: DemoOwner[]; workers: DemoWorker[] }

/** Demo accounts from the server (only when it runs in DEMO_MODE); null when there are none. */
function useDemoAccounts(): DemoList | null {
  const [list, setList] = useState<DemoList | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/v1/demo/accounts')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DemoList | null) => { if (live) setList(d) })
      .catch(() => undefined)
    return () => { live = false }
  }, [])
  return list
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

/** One-click demo sign-ins: picking an account fills the form above; the user then signs in. */
function DemoPicker<T extends { name: string; title: string; note: string }>({ farm, items, chosen, onPick, detail }: {
  farm: string; items: T[]; chosen: string | null; onPick: (a: T) => void; detail: (a: T) => string
}) {
  if (!items.length) return null
  return (
    <section aria-label="Demo accounts" className="mt-8">
      <div className="flex items-center gap-3 text-xs font-medium text-ink-soft">
        <span className="h-px flex-1 bg-[#e4e5e1]" />
        <span>Or use a demo account{farm ? ` · ${farm}` : ''}</span>
        <span className="h-px flex-1 bg-[#e4e5e1]" />
      </div>
      <ul className="mt-3 grid gap-2">
        {items.map((a) => {
          const on = chosen === a.name
          return (
            <li key={a.name}>
              <button type="button" onClick={() => onPick(a)} aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-lg border bg-white px-3 py-2.5 text-start transition-[border-color,box-shadow] duration-150 hover:border-[#bfc2bc] ${
                  on ? 'border-[#0e6b4b] shadow-[0_0_0_3px_rgb(14_107_75/0.12)]' : 'border-[#e4e5e1]'}`}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[0.8125rem] font-semibold ${on ? 'bg-[#0e6b4b] text-white' : 'bg-[#eeefeb] text-[#111513]'}`}>
                  {on ? <Check /> : initials(a.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[0.9375rem] font-medium">{a.name}</span>
                    <span className="truncate text-xs text-ink-soft">{a.title}</span>
                  </span>
                  <span className="block truncate font-mono text-xs text-[#8d938f]">{detail(a)}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-[#0e6b4b]">{on ? 'Filled in' : 'Use'}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-[#8d938f]">Demo accounts for judging. Pick one, then sign in.</p>
    </section>
  )
}

interface ShellProps {
  art: string[]
  eyebrow?: string
  title: string
  subtitle: string
  footer: ReactNode
  children: ReactNode
}

function Shell({ art, eyebrow, title, subtitle, footer, children }: ShellProps) {
  const { i18n } = useTranslation()
  const serif = i18n.language === 'ur' ? 'font-urdu' : 'font-serif'
  return (
    <div className="grid min-h-dvh gap-3 bg-[#f5f5f3] p-3 md:grid-cols-2">
      <ArtPanel sources={art} />
      <main className="flex min-h-[calc(100dvh-1.5rem)] flex-col px-4 py-4 sm:px-10">
        <div className="flex"><MilhLogo className="h-8 w-auto" /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="rise-in">
            {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-palm">{eyebrow}</p>}
            <h1 className={`text-3xl font-semibold tracking-tight ${serif}`}>{title}</h1>
            <p className="mt-2 text-ink-soft">{subtitle}</p>
          </div>
          <div className="rise-in mt-8" style={{ animationDelay: '80ms' }}>{children}</div>
        </div>
        <p className="text-sm text-ink-soft">{footer}</p>
      </main>
    </div>
  )
}

const field = 'mt-1.5 h-11 w-full rounded-lg border border-[#d4d6d1] bg-white px-3.5 text-[0.9375rem] transition-[border-color,box-shadow] duration-150 focus:border-[#0e6b4b] focus:outline-none focus:ring-[3px] focus:ring-[#0e6b4b]/15'
const label = 'block text-sm font-medium'
const submitBtn = 'press mt-2 h-11 w-full rounded-lg bg-[#0e6b4b] text-[0.9375rem] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(10_82_57/0.35)] transition-colors duration-150 disabled:opacity-60 [@media(hover:hover)]:hover:bg-[#0a5239]'

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
  const demo = useDemoAccounts()
  const [chosen, setChosen] = useState<string | null>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
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
    <Shell art={['/login-art-owner.webp', SHARED_ART]} eyebrow={t('login.title')} title={t('login.welcome')} subtitle={t('login.subtitle')}
      footer={<>{t('login.toKiosk')} <Link to="/kiosk/login" className="font-semibold text-ink underline-offset-4 hover:underline">{t('login.toKioskLink')}</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className={label}>{t('login.email')}
          <input className={field} type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setChosen(null) }} required />
        </label>
        <label className={label}>{t('login.password')}
          <SecretInput value={password} onChange={(v) => { setPassword(v); setChosen(null) }} autoComplete="current-password" />
        </label>
        <ErrorLine text={error} />
        <button ref={submitRef} className={submitBtn} disabled={busy}>{t('login.submit')}</button>
      </form>
      {demo && (
        <DemoPicker farm={demo.farm} items={demo.owners} chosen={chosen} detail={(o) => o.email}
          onPick={(o) => { setEmail(o.email); setPassword(o.password); setChosen(o.name); setError(''); submitRef.current?.focus() }} />
      )}
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
  const demo = useDemoAccounts()
  const [chosen, setChosen] = useState<string | null>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api<{ access_token: string }>('/api/v1/auth/kiosk', { method: 'POST', json: { device_key: key.trim(), pin } })
      try { localStorage.setItem(DEVICE_KEY, key.trim()) } catch { /* ignore */ }
      setToken(r.access_token)
      // The tablet speaks the signed-in worker's own language.
      try {
        const me = await api<{ language: string }>('/api/v1/me')
        if (me.language) await setLanguage(me.language as Lang)
      } catch { /* keep the current language */ }
      nav('/kiosk')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell art={[SHARED_ART]} title={t('login.kioskTitle')} subtitle={t('login.kioskSubtitle')}
      footer={<>{t('login.toOwner')} <Link to="/login" className="font-semibold text-ink underline-offset-4 hover:underline">{t('login.toOwnerLink')}</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className={label}>{t('login.deviceKey')}
          <input className={field} value={key} onChange={(e) => { setKey(e.target.value); setChosen(null) }} required />
        </label>
        <label className={label}>{t('login.pin')}
          <SecretInput value={pin} onChange={(v) => { setPin(v); setChosen(null) }} pin />
        </label>
        <ErrorLine text={error} />
        <button ref={submitRef} className={submitBtn} disabled={busy}>{t('login.kioskSubmit')}</button>
      </form>
      {demo && (
        <DemoPicker farm={demo.farm} items={demo.workers} chosen={chosen}
          detail={(w) => `PIN ${w.pin} · ${w.note}`}
          onPick={(w) => { setKey(w.device_key); setPin(w.pin); setChosen(w.name); setError(''); submitRef.current?.focus() }} />
      )}
    </Shell>
  )
}
