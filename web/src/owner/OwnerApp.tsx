import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, setToken } from '../api/client'
import { useAlerts, useFarm, useFarms, useKioskBundle, usePlans, useSources } from '../api/hooks'
import type { Farm, KioskBundle, Plan, Source } from '../api/types'
import { Bell, Check, LogOut, MapPin, Rain, Refresh, Sunrise, Sunset, Tablet, Thermo, Warn } from '../components/icons'
import { pick } from '../i18n'
import { ageText, dayMonth, hhmm, litres } from '../lib/format'
import { MilhLogo } from '../brand/Logo'
import { DataTab } from './DataTab'
import { PlanDetail } from './PlanDetail'
import { ReportsTab } from './ReportsTab'
import { SaltClockTab } from './SaltClockTab'
import { SetupTab } from './SetupTab'
import { PAGES } from './pages'
import { TabNav } from './TabNav'

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

function Centered({ children }: { children: ReactNode }) {
  return <div className="owner grid min-h-dvh place-items-center p-6">{children}</div>
}

function FarmList() {
  const farms = useFarms()
  const signOut = useSignOut()
  if (farms.isLoading) return <Centered><p className="text-[var(--k-muted)]">Loading…</p></Centered>
  if (farms.error) return <Centered><p className="text-[var(--k-red)]">{(farms.error as Error).message} · <button className="underline" onClick={signOut}>Sign in again</button></p></Centered>
  const list = farms.data ?? []
  if (list.length === 1) return <Navigate to={`farms/${list[0].id}`} replace />
  return (
    <div className="owner">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <MilhLogo className="h-8 w-auto" />
        <h1 className="mt-10 text-2xl font-semibold">Your farms</h1>
        <p className="mt-1 text-[var(--k-muted)]">Choose a farm to see today's irrigation decision.</p>
        <ul className="mt-6 grid gap-2">
          {list.map((f) => (
            <li key={f.id}>
              <Link className="k-card flex items-center gap-3 px-4 py-3.5 font-medium transition-colors hover:border-[var(--k-line-strong)]" to={`farms/${f.id}`}>
                <MapPin className="text-[var(--k-muted)]" />{f.name}
                <span className="ms-auto text-sm text-[var(--k-faint)]">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
        {list.length === 0 && <NewFarm />}
      </div>
    </div>
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
    <form onSubmit={submit} className="k-card mt-6 grid gap-3 p-6">
      <h2 className="font-semibold">Add your first farm</h2>
      <input className="px-3 py-2" placeholder="Farm name" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-[var(--k-muted)]">Latitude<input className="mt-1 w-full px-3 py-2" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label className="text-sm text-[var(--k-muted)]">Longitude<input className="mt-1 w-full px-3 py-2" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
      </div>
      {error && <p className="text-sm text-[var(--k-red)]">{error}</p>}
      <button className="btn btn-primary">Create farm</button>
    </form>
  )
}

function FarmDashboard() {
  const { farmId = '' } = useParams()
  const farm = useFarm(farmId)
  const alerts = useAlerts(farmId)
  const signOut = useSignOut()
  const { pathname } = useLocation()
  if (farm.isLoading) return <Centered><p className="text-[var(--k-muted)]">Loading…</p></Centered>
  if (!farm.data) return <Centered><p className="text-[var(--k-red)]">Farm not found.</p></Centered>
  const f = farm.data
  const base = `/owner/farms/${f.id}`
  const here = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '').split('/')[0] : ''
  const page = PAGES.find(([p]) => p === here) ?? PAGES[0]
  const openAlerts = alerts.data?.length ?? 0
  return (
    <div className="owner lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 border-b border-[var(--k-line)] bg-[#fafaf9] px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:border-e lg:border-b-0 lg:py-5">
        <div className="flex items-center justify-between lg:block">
          <MilhLogo className="h-7 w-auto" />
          <div className="flex gap-1 lg:hidden">
            <Link to={`/kiosk?farm=${f.id}`} className="btn btn-secondary"><Tablet /> Tablet</Link>
            <button onClick={signOut} className="btn btn-ghost" aria-label="Sign out"><LogOut /></button>
          </div>
        </div>
        <div className="hidden rounded-[10px] border border-[var(--k-line)] bg-white p-3 lg:block">
          <div className="eyebrow">Farm</div>
          <div className="mt-1 truncate text-[0.9375rem] font-semibold">{f.name}</div>
          <div className="mono mt-0.5 text-xs text-[var(--k-faint)]">{f.lat.toFixed(3)}, {f.lon.toFixed(3)} · {f.timezone}</div>
          {f.example_label && <span className="chip chip-amber mt-2" title={f.example_label}>Example setup</span>}
        </div>
        <TabNav farmId={f.id} alerts={openAlerts} />
        <div className="mt-auto hidden flex-col gap-1.5 lg:flex">
          <Link to={`/kiosk?farm=${f.id}`} className="btn btn-secondary w-full justify-start"><Tablet /> Open farm tablet</Link>
          <button onClick={signOut} className="btn btn-ghost w-full justify-start"><LogOut /> Sign out</button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-[var(--k-line)] bg-[var(--k-bg)] px-5 py-5 md:px-10 md:py-6">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-end gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[0.8125rem] text-[var(--k-faint)]">
                <span className="truncate">{f.name}</span><span aria-hidden>/</span><span className="text-[var(--k-muted)]">{page[1]}</span>
              </div>
              <h1 className="mt-1 text-[1.625rem] font-semibold leading-tight">{page[1]}</h1>
              <p className="mt-0.5 text-[0.9375rem] text-[var(--k-muted)]">{page[3]}</p>
            </div>
            {here === '' && <TodayActions farm={f} />}
          </div>
        </header>
        <main className="mx-auto max-w-[1200px] px-5 py-6 md:px-10 md:py-8">
          <Routes>
            <Route index element={<TodayTab farm={f} openAlerts={openAlerts} />} />
            <Route path="data" element={<DataTab farm={f} />} />
            <Route path="salt" element={<SaltClockTab farm={f} />} />
            <Route path="reports" element={<ReportsTab farm={f} />} />
            <Route path="alerts" element={<AlertsTab farm={f} />} />
            <Route path="setup" element={<SetupTab farm={f} />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function TodayActions({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
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
  return (
    <div className="ms-auto flex flex-wrap items-center gap-2">
      {msg && <span role="alert" className="chip chip-red">{msg}</span>}
      <button disabled={!!busy} onClick={() => run('weather', `/api/v1/farms/${farm.id}/weather/refresh`)} className="btn btn-secondary">
        <Refresh className={busy === 'weather' ? 'animate-spin' : ''} /> {busy === 'weather' ? 'Fetching…' : 'Fetch live weather'}
      </button>
      <button disabled={!!busy} onClick={() => run('plan', `/api/v1/farms/${farm.id}/plans/recompute`)} className="btn btn-primary">
        {busy === 'plan' ? 'Planning…' : "Recompute plan"}
      </button>
    </div>
  )
}

function TodayTab({ farm, openAlerts }: { farm: Farm; openAlerts: number }) {
  const plans = usePlans(farm.id)
  const sources = useSources(farm.id)
  const bundle = useKioskBundle(farm.id)
  const list = plans.data ?? []
  const planned = list.reduce((a, p) => a + p.gross_l, 0)
  const usual = list.reduce((a, p) => a + p.habit_l, 0)
  const saved = list.reduce((a, p) => a + p.saved_l, 0)
  const aed = list.reduce((a, p) => a + p.saved_aed, 0)
  const pct = usual ? Math.round((saved / usual) * 100) : 0
  const habitWell = list.reduce((a, p) => a + (p.habit_well_l ?? 0), 0)
  const planWell = list.reduce((a, p) => a + (p.plan_well_l ?? 0), 0)
  const aquifer = list.reduce((a, p) => a + (p.aquifer_saved_l ?? 0), 0)
  const aquiferPct = habitWell ? Math.round((aquifer / habitWell) * 100) : 0
  const withYield = list.filter((p) => p.habit_yield_pct != null && p.plan_yield_pct != null)
  const worstHabit = withYield.length ? Math.min(...withYield.map((p) => p.habit_yield_pct as number)) : null
  const worstBlock = withYield.find((p) => p.habit_yield_pct === worstHabit)
  const lossAvoided = worstBlock ? Math.round((worstBlock.plan_yield_pct as number) - (worstHabit as number)) : 0
  const costPerM3 = aed < 0 && aquifer > 0 ? Math.abs(aed) / (aquifer / 1000) : null
  const b = bundle.data?.bundle
  const day = b?.day ?? list[0]?.day
  const srcs = sources.data ?? []

  if (plans.isLoading) return <p className="text-[var(--k-muted)]">Loading today's plan…</p>
  if (!list.length) {
    return (
      <div className="k-card grid place-items-center gap-2 px-6 py-16 text-center">
        <p className="text-lg font-semibold">No plan for today yet</p>
        <p className="max-w-md text-[var(--k-muted)]">Fetch live weather and recompute, or wait for the 03:00 run. Milh needs a water salt reading for each source to decide.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <section aria-label="Today's outcome" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Well water kept in the ground" value={litres(aquifer)} tone={aquifer >= 0 ? 'good' : 'warn'}
          note={habitWell ? <><b className="font-semibold text-[var(--k-green)]">{aquiferPct}% less</b> pumped than the usual {litres(habitWell)}</> : 'No well on this farm'} />
        <Stat label="Total water saved" value={litres(saved)} tone={saved >= 0 ? 'good' : 'warn'}
          note={<><b className="font-semibold text-[var(--k-ink)]">{pct}%</b> below the usual {litres(usual)}</>} />
        <Stat label="Yield lost to salt" value={worstBlock && lossAvoided > 0 ? `${lossAvoided}% → 0%` : '0%'} tone="good"
          note={worstBlock && lossAvoided > 0 ? `${worstBlock.block_name} on the usual routine` : 'Usual routine already leaches enough'} />
        <Stat label="Cost vs usual" value={`${aed >= 0 ? '−' : '+'}AED ${Math.abs(aed).toFixed(2)}`} tone={aed >= 0 ? 'good' : 'neutral'}
          note={costPerM3 != null ? `≈ AED ${costPerM3.toFixed(2)} per m³ of well water kept` : 'Water and pumping, per day'} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Today's plan" className="k-card min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--k-line)] px-5 py-4">
            <h2 className="text-[0.9375rem] font-semibold">Irrigation plan{day ? ` · ${dayMonth(day, farm.timezone)}` : ''}</h2>
            <span className="text-[0.8125rem] text-[var(--k-muted)]">{list.length} blocks · {list.filter((p) => p.skip_reason).length} skipped</span>
            <span className="ms-auto text-[0.8125rem] text-[var(--k-muted)]">Milh <b className="num font-semibold text-[var(--k-ink)]">{litres(planned)}</b> vs usual <span className="num">{litres(usual)}</span></span>
          </div>
          <div className="px-5 pt-4">
            <Compare rows={[['Usual routine', usual, 'var(--k-line-strong)'], ['Milh plan', planned, 'var(--k-green)'],
              ...(habitWell ? [['Usual, from well', habitWell, '#c9d5e3'], ['Milh, from well', planWell, 'var(--k-water)']] as [string, number, string][] : [])]} />
          </div>
          <ul className="mt-4 divide-y divide-[var(--k-line)] border-t border-[var(--k-line)] md:hidden">
            {list.map((p) => <PlanItem key={p.id} plan={p} sources={srcs} tz={farm.timezone} />)}
          </ul>
          <div className="hidden overflow-x-auto px-5 pb-2 md:block">
            <table className="data-table mt-4 w-full min-w-[46rem] text-[0.875rem]">
              <thead><tr><th>Block</th><th>Window</th><th>Taps</th><th className="text-end">Minutes</th><th className="text-end">Water</th><th className="text-end">From well</th><th className="text-end">Yield</th></tr></thead>
              <tbody>
                {list.map((p) => <PlanRow key={p.id} plan={p} sources={srcs} tz={farm.timezone} />)}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid content-start gap-4">
          {b ? <WeatherCard bundle={b} /> : <div className="k-card min-h-40" />}
          <Link to={`/owner/farms/${farm.id}/alerts`} className="k-card flex items-center gap-3 p-4 transition-colors hover:border-[var(--k-line-strong)]">
            <span className={`grid size-9 place-items-center rounded-lg ${openAlerts ? 'bg-[var(--k-amber-soft)] text-[var(--k-amber)]' : 'bg-[var(--k-green-soft)] text-[var(--k-green)]'}`}>
              {openAlerts ? <Bell /> : <Check />}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-semibold">{openAlerts ? `${openAlerts} open alert${openAlerts > 1 ? 's' : ''}` : 'No open alerts'}</span>
              <span className="block text-[0.8125rem] text-[var(--k-muted)]">{openAlerts ? 'Review and resolve' : 'Nothing needs you right now'}</span>
            </span>
            <span aria-hidden className="ms-auto text-[var(--k-faint)]">→</span>
          </Link>
          <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-green-soft)]/50 p-4 text-[0.875rem] leading-relaxed text-[#21352c]">
            <div className="eyebrow mb-1.5 text-[var(--k-green)]">Why this beats the habit</div>
            The usual routine pumps the same salty well water every day: too much where the crop needs little, too little to
            wash salt out where it needs more. Milh sizes each block to today's weather and blends in clean water only where
            salt demands it.
          </div>
        </div>
      </div>

      <section aria-label="Decision detail" className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[0.9375rem] font-semibold">How each block was decided</h2>
          <span className="text-[0.8125rem] text-[var(--k-muted)]">Every input, fallback and comparison</span>
        </div>
        {list.map((p) => <PlanDetail key={p.id} plan={p} sources={srcs} tz={farm.timezone} />)}
      </section>
    </div>
  )
}

function Stat({ label, value, note, tone = 'neutral' }: { label: string; value: string; note?: ReactNode; tone?: 'good' | 'warn' | 'neutral' }) {
  const color = tone === 'good' ? 'text-[var(--k-green)]' : tone === 'warn' ? 'text-[var(--k-amber)]' : 'text-[var(--k-ink)]'
  return (
    <div className="k-card p-4 md:p-5">
      <div className="text-[0.8125rem] font-medium text-[var(--k-muted)]">{label}</div>
      <div className={`num mt-2 whitespace-nowrap text-[clamp(1.25rem,2.1vw,1.875rem)] font-semibold leading-none ${color}`}>{value}</div>
      {note && <div className="mt-2.5 text-[0.8125rem] leading-snug text-[var(--k-muted)]">{note}</div>}
    </div>
  )
}

/** Horizontal comparison bars on one shared scale. */
function Compare({ rows }: { rows: [string, number, string][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  return (
    <div className="grid gap-2">
      {rows.map(([label, v, color]) => (
        <div key={label} className="grid grid-cols-[6.75rem_minmax(0,1fr)_4.75rem] items-center gap-3 text-[0.8125rem] sm:grid-cols-[8.5rem_minmax(0,1fr)_5.5rem]">
          <span className="text-[var(--k-muted)]">{label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-[var(--k-sand-soft)]">
            <span className="grow-x block h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: color }} />
          </span>
          <span className="num text-end font-medium">{litres(v)}</span>
        </div>
      ))}
    </div>
  )
}

function PlanRow({ plan: p, sources, tz }: { plan: Plan; sources: Source[]; tz: string }) {
  const byId = new Map(sources.map((s) => [s.id, s]))
  return (
    <tr>
      <td>
        <div className="font-medium">{p.block_name}</div>
        <div className="text-[0.8125rem] capitalize text-[var(--k-muted)]">{p.crop_key.replace('_', ' ')}</div>
      </td>
      <td className="mono text-[0.8125rem] text-[var(--k-muted)]">{p.start_at ? `${hhmm(p.start_at, tz)}–${hhmm(p.end_at, tz)}` : '—'}</td>
      <td>
        {p.skip_reason ? <span className="chip chip-blue"><Rain /> {p.skip_reason === 'rain' ? 'Rain' : 'Not needed'}</span> : (
          <div className="flex flex-wrap gap-1">
            {p.steps.map((s, i) => {
              const src = byId.get(s.source_id)
              return (
                <span key={i} className="chip chip-neutral">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: src?.tap_color ?? '#888' }} />
                  {src ? pick(src.tap_label, 'en') || src.name : 'tap'} <span className="mono">{s.minutes}m</span>
                </span>
              )
            })}
          </div>
        )}
      </td>
      <td className="text-end"><span className="num font-semibold">{p.minutes}</span><span className="num text-[var(--k-faint)]"> / {String(p.explanation.habit_minutes ?? '—')}</span></td>
      <td className="text-end"><Delta now={p.gross_l} was={p.habit_l} /></td>
      <td className="text-end">{p.plan_well_l != null && p.habit_well_l != null ? <Delta now={p.plan_well_l} was={p.habit_well_l} /> : '—'}</td>
      <td className="num text-end">
        {p.habit_yield_pct != null && p.plan_yield_pct != null
          ? <><span className="text-[var(--k-faint)]">{Math.round(p.habit_yield_pct)}% →</span> <span className="font-semibold">{Math.round(p.plan_yield_pct)}%</span></>
          : '—'}
      </td>
    </tr>
  )
}

/** Phone layout of one plan row: a compact stacked card instead of a wide table row. */
function PlanItem({ plan: p, sources, tz }: { plan: Plan; sources: Source[]; tz: string }) {
  const byId = new Map(sources.map((s) => [s.id, s]))
  return (
    <li className="px-5 py-3.5">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{p.block_name}</span>
        <span className="text-[0.8125rem] capitalize text-[var(--k-muted)]">{p.crop_key.replace('_', ' ')}</span>
        <span className="ms-auto"><span className="num text-lg font-semibold">{p.minutes}</span><span className="num text-[0.8125rem] text-[var(--k-faint)]"> / {String(p.explanation.habit_minutes ?? '—')} min</span></span>
      </div>
      <div className="mono mt-0.5 text-[0.75rem] text-[var(--k-muted)]">{p.start_at ? `${hhmm(p.start_at, tz)}–${hhmm(p.end_at, tz)}` : p.skip_reason ?? '—'}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {p.steps.map((s, i) => {
          const src = byId.get(s.source_id)
          return (
            <span key={i} className="chip chip-neutral">
              <span aria-hidden className="size-2 rounded-full" style={{ background: src?.tap_color ?? '#888' }} />
              {src ? pick(src.tap_label, 'en') || src.name : 'tap'} <span className="mono">{s.minutes}m</span>
            </span>
          )
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[0.75rem] text-[var(--k-muted)]">
        <span>Water<br /><Delta now={p.gross_l} was={p.habit_l} /></span>
        <span>From well<br />{p.plan_well_l != null && p.habit_well_l != null ? <Delta now={p.plan_well_l} was={p.habit_well_l} /> : '—'}</span>
        <span>Yield<br /><span className="num text-[0.875rem] font-semibold text-[var(--k-ink)]">{p.plan_yield_pct != null ? `${Math.round(p.plan_yield_pct)}%` : '—'}</span>
          {p.habit_yield_pct != null && <span className="num"> (was {Math.round(p.habit_yield_pct)}%)</span>}</span>
      </div>
    </li>
  )
}

function Delta({ now, was }: { now: number; was: number }) {
  const d = was ? Math.round(((now - was) / was) * 100) : 0
  return (
    <span className="inline-flex flex-col md:items-end">
      <span className="num font-medium">{litres(now)}</span>
      <span className={`num text-[0.75rem] ${d <= 0 ? 'text-[var(--k-green)]' : 'text-[var(--k-amber)]'}`}>{d > 0 ? '+' : ''}{d}%</span>
    </span>
  )
}

function WeatherCard({ bundle }: { bundle: KioskBundle }) {
  const { t } = useTranslation()
  const tz = bundle.farm.timezone
  const w = bundle.weather
  const today = w?.daily.find((d) => d.day === bundle.day)
  const temp = w?.current.temperature_2m
  return (
    <section aria-label="Weather" className="k-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--k-muted)]"><Thermo /> Weather · Open-Meteo</span>
        {w && <span className={`chip ${w.age_h > 6 ? 'chip-amber' : 'chip-neutral'}`}>{ageText(w.age_h, t)}</span>}
      </div>
      {w ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="num text-[2.5rem] font-semibold leading-none">{typeof temp === 'number' ? Math.round(temp) : '–'}°</span>
            {today && <span className="num text-[var(--k-muted)]">{today.tmin_c != null ? `${Math.round(today.tmin_c)}° – ` : ''}{Math.round(today.tmax_c)}°</span>}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--k-line)] bg-[var(--k-line)] text-[0.8125rem]">
            <Cell label="ET₀ demand" value={today ? `${today.et0_mm.toFixed(1)} mm` : '—'} />
            <Cell label={<><Rain /> Rain</>} value={today ? `${today.rain_mm.toFixed(1)} mm${today.rain_chance_pct != null ? ` · ${today.rain_chance_pct}%` : ''}` : '—'} />
            <Cell label={<><Sunrise /> Sunrise</>} value={hhmm(bundle.sun?.sunrise ?? null, tz)} />
            <Cell label={<><Sunset /> Sunset</>} value={hhmm(bundle.sun?.sunset ?? null, tz)} />
          </dl>
        </>
      ) : <p className="mt-3 text-[0.875rem] text-[var(--k-muted)]">No forecast yet. Use “Fetch live weather”.</p>}
    </section>
  )
}

function Cell({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <dt className="flex items-center gap-1 text-[var(--k-muted)]">{label}</dt>
      <dd className="num mt-0.5 text-[0.9375rem] font-semibold">{value}</dd>
    </div>
  )
}

function AlertsTab({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const alerts = useAlerts(farm.id)
  if (!alerts.data?.length) {
    return (
      <div className="k-card grid place-items-center gap-2 px-6 py-16 text-center">
        <span className="grid size-10 place-items-center rounded-lg bg-[var(--k-green-soft)] text-xl text-[var(--k-green)]"><Check /></span>
        <p className="mt-1 text-lg font-semibold">No open alerts</p>
        <p className="text-[var(--k-muted)]">Stale readings, salty water and missed watering will show up here.</p>
      </div>
    )
  }
  return (
    <ul className="k-card divide-y divide-[var(--k-line)]">
      {alerts.data.map((a) => {
        const tone = a.severity === 'critical' ? 'chip-red' : a.severity === 'warning' ? 'chip-amber' : 'chip-neutral'
        return (
          <li key={a.id} className="flex items-center gap-4 px-5 py-4">
            <span className={`chip ${tone} h-8 w-8 justify-center p-0`}><Warn /></span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{pick(a.message, 'en')}</div>
              <div className="text-[0.8125rem] text-[var(--k-muted)]"><span className="capitalize">{a.severity}</span> · {new Date(a.created_at).toLocaleString()}</div>
            </div>
            <button className="btn btn-secondary" onClick={async () => {
              await api(`/api/v1/alerts/${a.id}/resolve`, { method: 'POST' })
              await qc.invalidateQueries({ queryKey: ['alerts', farm.id] })
            }}>Resolve</button>
          </li>
        )
      })}
    </ul>
  )
}
