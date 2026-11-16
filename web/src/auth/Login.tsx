import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { MilhLogo } from '../brand/Logo'

const DEVICE_KEY = 'milh.deviceKey'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-dvh place-items-center bg-salt p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="flex items-center gap-4"><MilhLogo className="h-14 w-auto" /><span className="font-urdu text-3xl leading-[2.2] text-ink-soft" lang="ur">ملح</span></div>
          <div className="text-ink-soft">{t('app.tagline')}</div>
        </div>
        <div className="rounded-3xl bg-panel p-6 ring-1 ring-line">
          <h1 className="mb-4 text-xl font-bold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  )
}

const field = 'mt-1 w-full rounded-xl border border-line bg-salt px-3 py-2.5 text-lg'

export function OwnerLogin() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const r = await api<{ access_token: string }>('/api/v1/auth/login', { method: 'POST', json: { email, password } })
      setToken(r.access_token)
      nav('/owner')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Shell title={t('login.title')}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label>{t('login.email')}<input className={field} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>{t('login.password')}<input className={field} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p role="alert" className="text-brine">{error}</p>}
        <button className="mt-2 rounded-xl bg-ink py-3 text-lg font-semibold text-salt">{t('login.submit')}</button>
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
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const r = await api<{ access_token: string }>('/api/v1/auth/kiosk', { method: 'POST', json: { device_key: key.trim(), pin } })
      try { localStorage.setItem(DEVICE_KEY, key.trim()) } catch { /* ignore */ }
      setToken(r.access_token)
      nav('/kiosk')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Shell title={t('login.kioskTitle')}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label>{t('login.deviceKey')}<input className={field} value={key} onChange={(e) => setKey(e.target.value)} required /></label>
        <label>{t('login.pin')}<input className={`${field} num text-2xl tracking-[0.5em]`} inputMode="numeric" type="password" value={pin} onChange={(e) => setPin(e.target.value)} required /></label>
        {error && <p role="alert" className="text-brine">{error}</p>}
        <button className="mt-2 rounded-xl bg-palm py-3 text-lg font-semibold text-white">{t('login.kioskSubmit')}</button>
      </form>
    </Shell>
  )
}
