import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { useAlerts, useFarm, useFarms, useKioskBundle, usePlans, useSources } from '../api/hooks'
import type { Farm, KioskBundle } from '../api/types'
import { Bell, LogOut, MapPin, Rain, Refresh, Sunrise, Sunset, Tablet, Thermo, Warn } from '../components/icons'
import { pick } from '../i18n'
import { ageText, dayMonth, hhmm, litres } from '../lib/format'
import { DataTab } from './DataTab'
import { PlanDetail } from './PlanDetail'
import { ReportsTab } from './ReportsTab'
import { SaltClockTab } from './SaltClockTab'
import { SetupTab } from './SetupTab'
import { TabNav } from './TabNav'
import { MilhLogo } from '../brand/Logo'
import { Ledger } from './Ledger'
import { useTranslation } from 'react-i18next'

export function OwnerApp() {
  return (
    <Routes>
      <Route index element={<FarmList />} />
      <Route path="farms/:farmId/*" element={<FarmDashboard />} />
    </Routes>
  )
}

function useSignOut() {
  const nav = useNavigate()
  const qc = useQueryClient()
  return () => {
    setToken(null)
    qc.clear()
    nav('/login')
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="owner">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-5 md:px-8">{children}</div>
    </div>
  )
}

function FarmList() {
  const farms = useFarms()
  const signOut = useSignOut()
  if (farms.isLoading) return <Shell><p className="p-6 text-[var(--k-muted)]">Loading…</p></Shell>
  if (farms.error) return <Shell><p className="p-6 text-brine">{(farms.error as Error).message} · <button className="underline" onClick={signOut}>Sign in again</button></p></Shell>
  const list = farms.data ?? []
  if (list.length === 1) return <Navigate to={`farms/${list[0].id}`} replace />
  return (
    <Shell>
      <div className="mx-auto w-full max-w-3xl">
        <MilhLogo className="h-10 w-auto" />
        <h1 className="mt-8 text-4xl font-black">Your farms</h1>
        <ul className="mt-5 grid gap-3">
          {list.map((f, i) => (
            <li key={f.id} className="card-in" style={{ animationDelay: `${i * 60}ms` }}>
              <Link className="k-card press flex items-center gap-3 p-5 text-xl font-extrabold" to={`farms/${f.id}`}>
                <MapPin className="text-[var(--k-green)]" />{f.name}
              </Link>
            </li>
          ))}
        </ul>
        {list.length === 0 && <NewFarm />}
      </div>
    </Shell>
  )
}

function NewFarm() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [lat, setLat] = useState('24.2075')
  const [lon, setLon] = useState('55.7447')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api<Farm>('/api/v1/farms', { method: 'POST', json: { name, lat: Number(lat), lon: Number(lon), timezone: 'Asia/Dubai' } })
      await qc.invalidateQueries({ queryKey: ['farms'] })
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <form onSubmit={submit} className="mt-6 grid gap-3 rounded-3xl bg-panel p-6 ring-1 ring-line">
      <h2 className="text-lg font-bold">Add your first farm</h2>
      <input className="rounded-xl border border-line bg-salt px-3 py-2.5" placeholder="Farm name" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Latitude<input className="mt-1 w-full rounded-xl border border-line bg-salt px-3 py-2.5" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label className="text-sm">Longitude<input className="mt-1 w-full rounded-xl border border-line bg-salt px-3 py-2.5" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
      </div>
      {error && <p className="text-brine">{error}</p>}
      <button className="press rounded-xl bg-ink py-3 font-bold text-salt">Create farm</button>
    </form>
  )
}

function FarmDashboard() {
  const { farmId = '' } = useParams()
  const farm = useFarm(farmId)
  const alerts = useAlerts(farmId)
  const signOut = useSignOut()
  if (farm.isLoading) return <Shell><p className="p-6 text-[var(--k-muted)]">Loading…</p></Shell>
  if (!farm.data) return <Shell><p className="p-6 text-brine">Farm not found.</p></Shell>
  const f = farm.data
  return (
    <Shell>
      <header className="card-in flex flex-wrap items-center gap-x-5 gap-y-3">
        <MilhLogo className="h-10 w-auto shrink-0" />
        <span aria-hidden className="hidden h-8 w-px bg-[var(--k-ink)]/10 sm:block" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xl font-extrabold"><MapPin className="shrink-0 text-[var(--k-muted)]" />{f.name}</div>
          {f.example_label && <div className="max-w-xl truncate text-xs text-[var(--k-muted)]" title={f.example_label}>{f.example_label}</div>}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Link to={`/kiosk?farm=${f.id}`} className="press flex items-center gap-2 rounded-full bg-[var(--k-sand)] px-4 py-2.5 font-bold">
            <Tablet /> Farm tablet view
          </Link>
          <button onClick={signOut} className="press flex items-center gap-2 rounded-full px-4 py-2.5 font-bold text-[var(--k-muted)] hover:bg-white">
            <LogOut /> Sign out
          </button>
        </div>
      </header>
      <div className="card-in" style={{ animationDelay: '60ms' }}><TabNav farmId={f.id} alerts={alerts.data?.length ?? 0} /></div>
      <main className="min-w-0">
        <Routes>
          <Route index element={<TodayTab farm={f} openAlerts={alerts.data?.length ?? 0} />} />
          <Route path="data" element={<DataTab farm={f} />} />
          <Route path="salt" element={<SaltClockTab farm={f} />} />
          <Route path="reports" element={<ReportsTab farm={f} />} />
          <Route path="alerts" element={<AlertsTab farm={f} />} />
          <Route path="setup" element={<SetupTab farm={f} />} />
        </Routes>
      </main>
    </Shell>
  )
}

function TodayTab({ farm, openAlerts }: { farm: Farm; openAlerts: number }) {
  const qc = useQueryClient()
  const plans = usePlans(farm.id)
  const sources = useSources(farm.id)
  const bundle = useKioskBundle(farm.id)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  async function run(label: string, path: string) {
    setBusy(label)
    setMsg('')
    try {
      await api(path, { method: 'POST' })
      await qc.invalidateQueries()
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy('')
    }
  }
  const list = plans.data ?? []
  const planned = list.reduce((a, p) => a + p.gross_l, 0)
  const usual = list.reduce((a, p) => a + p.habit_l, 0)
  const saved = list.reduce((a, p) => a + p.saved_l, 0)
  const aed = list.reduce((a, p) => a + p.saved_aed, 0)
  const pct = usual ? Math.round((saved / usual) * 100) : 0
  const b = bundle.data?.bundle
  const day = b?.day ?? list[0]?.day
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(18rem,1fr)]">
        <section aria-label="Today's water" className="k-card card-in flex flex-col p-6 md:p-8" style={{ animationDelay: '100ms' }}>
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <div className="text-sm font-bold uppercase tracking-wider text-[var(--k-muted)]">Today's water{day ? ` · ${dayMonth(day, farm.timezone)}` : ''}</div>
              <h1 className="mt-1 text-3xl font-black md:text-4xl">
                {list.length ? <>Milh plans <span className="num">{litres(planned)}</span></> : 'No plan for today yet'}
              </h1>
            </div>
            <div className="ms-auto flex flex-wrap gap-2">
              <button disabled={!!busy} onClick={() => run('weather', `/api/v1/farms/${farm.id}/weather/refresh`)}
                className="press flex items-center gap-2 rounded-full bg-[var(--k-sand)] px-4 py-2.5 font-bold disabled:opacity-50">
                <Refresh /> {busy === 'weather' ? 'Fetching…' : 'Fetch live weather'}
              </button>
              <button disabled={!!busy} onClick={() => run('plan', `/api/v1/farms/${farm.id}/plans/recompute`)}
                className="press rounded-full bg-[var(--k-green)] px-5 py-2.5 font-bold text-white shadow-[0_10px_22px_-12px_rgba(47,107,79,.9)] disabled:opacity-50">
                {busy === 'plan' ? 'Planning…' : "Recompute today's plan"}
              </button>
            </div>
          </div>
          {msg && <p role="alert" className="mt-3 rounded-xl bg-brine/10 px-3 py-2 text-brine">{msg}</p>}
          {list.length > 0 ? (
            <>
              <Ledger usual={usual} planned={planned} className="mt-6" big />
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Figure label="Usual routine" value={litres(usual)} />
                <Figure label="Water saved" value={litres(saved)} note={`${pct}% less`} tone="good" />
                <Figure label="Cost vs usual" value={`${aed >= 0 ? '−' : '+'}${Math.abs(aed).toFixed(2)} AED`} note="water and pumping" tone={aed >= 0 ? 'good' : 'warn'} />
                <Figure label="Blocks today" value={String(list.length)} note={`${list.filter((p) => p.skip_reason).length} skipped`} />
              </dl>
            </>
          ) : (
            <p className="mt-4 max-w-prose text-lg text-[var(--k-muted)]">Fetch the weather and recompute, or wait for the 03:00 run.</p>
          )}
        </section>
        <div className="grid gap-5">
          {b ? <WeatherCard bundle={b} /> : <div className="k-card card-in min-h-40" />}
          <Link to={`/owner/farms/${farm.id}/alerts`}
            className={`press card-in flex items-center gap-4 rounded-[1.5rem] p-5 ${openAlerts ? 'bg-dune text-white' : 'k-card'}`} style={{ animationDelay: '220ms' }}>
            <span className={`grid size-12 place-items-center rounded-2xl text-2xl ${openAlerts ? 'bg-white/20' : 'bg-[var(--k-green-soft)] text-[var(--k-green)]'}`}><Bell /></span>
            <span>
              <span className="num block text-2xl font-black">{openAlerts ? `${openAlerts} open alert${openAlerts > 1 ? 's' : ''}` : 'No open alerts'}</span>
              <span className={`text-sm ${openAlerts ? 'text-white/85' : 'text-[var(--k-muted)]'}`}>{openAlerts ? 'Tap to review' : 'Nothing needs you right now'}</span>
            </span>
          </Link>
        </div>
      </div>

      {list.length > 0 && <h2 className="card-in mt-2 text-2xl font-black" style={{ animationDelay: '260ms' }}>Each block today</h2>}
      {list.map((p, i) => (
        <div key={p.id} className="card-in" style={{ animationDelay: `${300 + i * 80}ms` }}>
          <PlanDetail plan={p} sources={sources.data ?? []} tz={farm.timezone} />
        </div>
      ))}
    </div>
  )
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-[var(--k-green)]' : tone === 'warn' ? 'text-dune' : ''
  return (
    <div>
      <dt className="text-sm font-semibold text-[var(--k-muted)]">{label}</dt>
      <dd className={`num mt-0.5 text-2xl font-black ${color}`}>{value}</dd>
      {note && <dd className="text-sm text-[var(--k-muted)]">{note}</dd>}
    </div>
  )
}

function WeatherCard({ bundle }: { bundle: KioskBundle }) {
  const { t } = useTranslation()
  const tz = bundle.farm.timezone
  const w = bundle.weather
  const today = w?.daily.find((d) => d.day === bundle.day)
  const temp = w?.current.temperature_2m
  return (
    <section aria-label="Weather" className="k-card card-in p-6" style={{ animationDelay: '160ms' }}>
      <div className="flex items-center justify-between text-sm font-bold uppercase tracking-wider text-[var(--k-muted)]">
        <span className="flex items-center gap-1.5"><Thermo /> Weather</span>
        {w && <span className={`normal-case tracking-normal ${w.age_h > 6 ? 'rounded-full bg-dune px-2 py-0.5 text-white' : ''}`}>{t('kiosk.forecastAge', { age: ageText(w.age_h, t) })}</span>}
      </div>
      {w ? (
        <>
          <div className="mt-2 flex items-end gap-3">
            <span className="num text-6xl font-black leading-none">{typeof temp === 'number' ? Math.round(temp) : '–'}°</span>
            {today && <span className="num pb-1 text-lg text-[var(--k-muted)]">{today.tmin_c != null ? `${Math.round(today.tmin_c)}° – ` : ''}{Math.round(today.tmax_c)}°</span>}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-[var(--k-muted)]">Crop water demand (ET₀)</dt><dd className="num text-lg font-extrabold">{today ? `${today.et0_mm.toFixed(1)} mm` : '—'}</dd></div>
            <div><dt className="flex items-center gap-1 text-[var(--k-muted)]"><Rain /> Rain</dt><dd className="num text-lg font-extrabold">{today ? `${today.rain_mm.toFixed(1)} mm${today.rain_chance_pct != null ? ` · ${today.rain_chance_pct}%` : ''}` : '—'}</dd></div>
            <div><dt className="flex items-center gap-1 text-[var(--k-muted)]"><Sunrise /> Sunrise</dt><dd className="num text-lg font-extrabold">{hhmm(bundle.sun?.sunrise ?? null, tz)}</dd></div>
            <div><dt className="flex items-center gap-1 text-[var(--k-muted)]"><Sunset /> Sunset</dt><dd className="num text-lg font-extrabold">{hhmm(bundle.sun?.sunset ?? null, tz)}</dd></div>
          </dl>
        </>
      ) : <p className="mt-3 text-[var(--k-muted)]">No forecast yet. Use “Fetch live weather”.</p>}
    </section>
  )
}

function AlertsTab({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const alerts = useAlerts(farm.id)
  if (!alerts.data?.length) {
    return (
      <div className="k-card card-in grid place-items-center gap-3 p-12 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-[var(--k-green-soft)] text-3xl text-[var(--k-green)]"><Bell /></span>
        <p className="text-2xl font-black">No open alerts</p>
        <p className="text-[var(--k-muted)]">Milh will list stale readings, salty water and missed watering here.</p>
      </div>
    )
  }
  return (
    <ul className="grid gap-3">
      {alerts.data.map((a, i) => {
        const tone = a.severity === 'critical' ? 'bg-brine' : a.severity === 'warning' ? 'bg-dune' : 'bg-[var(--k-muted)]'
        return (
          <li key={a.id} className="k-card card-in flex items-center gap-4 p-4 ps-5" style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-xl text-white ${tone}`}><Warn /></span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{pick(a.message, 'en')}</div>
              <div className="text-sm text-[var(--k-muted)]"><span className="capitalize">{a.severity}</span> · {new Date(a.created_at).toLocaleString()}</div>
            </div>
            <button className="press rounded-full bg-[var(--k-sand)] px-4 py-2 font-bold" onClick={async () => {
              await api(`/api/v1/alerts/${a.id}/resolve`, { method: 'POST' })
              await qc.invalidateQueries({ queryKey: ['alerts', farm.id] })
            }}>Resolve</button>
          </li>
        )
      })}
    </ul>
  )
}
