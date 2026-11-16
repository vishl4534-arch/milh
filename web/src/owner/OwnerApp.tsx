import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { useAlerts, useFarm, useFarms, useKioskBundle, usePlans, useSources } from '../api/hooks'
import type { Farm, KioskBundle, Plan } from '../api/types'
import { Bell, Chart, ChevronLeft, ChevronRight, Flask, Gear, Home, LogOut, Refresh, Tablet, Upload, Warn } from '../components/icons'
import { Bar, EarthShell, FarmView, Rail, Stat, WeatherCard } from '../earth/Earth'
import { pick } from '../i18n'
import { CropArt } from '../kiosk/art/CropArt'
import { DropIcon, SoilSprout } from '../kiosk/art/Tank'
import { PipeBar } from '../kiosk/PipeBar'
import { dayMonth, hhmm, litres } from '../lib/format'
import { DataTab } from './DataTab'
import { PlanDetail } from './PlanDetail'
import { ReportsTab } from './ReportsTab'
import { SaltClockTab } from './SaltClockTab'
import { SetupTab } from './SetupTab'
import { TabNav } from './TabNav'
import { MilhLogo } from '../brand/Logo'

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

function FarmList() {
  const farms = useFarms()
  const signOut = useSignOut()
  if (farms.isLoading) return <EarthShell><p className="p-6">Loading…</p></EarthShell>
  if (farms.error) return <EarthShell><p className="p-6 text-brine">{(farms.error as Error).message} · <button className="underline" onClick={signOut}>Sign in again</button></p></EarthShell>
  const list = farms.data ?? []
  if (list.length === 1) return <Navigate to={`farms/${list[0].id}`} replace />
  return (
    <EarthShell>
      <div className="mx-auto w-full max-w-3xl">
        <MilhLogo color="#f7f8f4" className="h-10 w-auto" />
        <h1 className="mt-6 text-3xl font-bold">Your farms</h1>
        <ul className="mt-4 grid gap-3">
          {list.map((f, i) => (
            <li key={f.id} className="card-in" style={{ animationDelay: `${i * 60}ms` }}>
              <Link className="glass press block rounded-[1.5rem] p-5 text-xl font-semibold" to={`farms/${f.id}`}>{f.name}</Link>
            </li>
          ))}
        </ul>
        {list.length === 0 && <NewFarm />}
      </div>
    </EarthShell>
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
    <form onSubmit={submit} className="mt-6 grid gap-3 rounded-3xl bg-panel p-5 ring-1 ring-line">
      <h2 className="text-lg font-bold">Add your first farm</h2>
      <input className="rounded-xl border border-line bg-salt px-3 py-2" placeholder="Farm name" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Latitude<input className="mt-1 w-full rounded-xl border border-line bg-salt px-3 py-2" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label className="text-sm">Longitude<input className="mt-1 w-full rounded-xl border border-line bg-salt px-3 py-2" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
      </div>
      {error && <p className="text-brine">{error}</p>}
      <button className="rounded-xl bg-ink py-2.5 font-semibold text-salt">Create farm</button>
    </form>
  )
}

const TAB_ICONS = [
  ['', 'Today', <Home key="h" />], ['data', 'Add data', <Upload key="u" />], ['salt', 'Salt clock', <Flask key="f" />],
  ['reports', 'Report', <Chart key="c" />], ['alerts', 'Alerts', <Bell key="b" />], ['setup', 'Setup', <Gear key="g" />],
] as const

function FarmDashboard() {
  const { farmId = '' } = useParams()
  const farm = useFarm(farmId)
  const alerts = useAlerts(farmId)
  const signOut = useSignOut()
  const nav = useNavigate()
  const { pathname } = useLocation()
  if (farm.isLoading) return <EarthShell><p className="p-6">Loading…</p></EarthShell>
  if (!farm.data) return <EarthShell><p className="p-6 text-brine">Farm not found.</p></EarthShell>
  const f = farm.data
  const base = `/owner/farms/${f.id}`
  const here = pathname.replace(base, '').replace(/^\//, '').split('/')[0]
  const open = alerts.data?.length ?? 0
  const rail = (
    <Rail label="Farm" items={[
      ...TAB_ICONS.map(([path, label, icon]) => ({
        key: path || 'today', label: path === 'alerts' && open ? `${label} (${open})` : label, icon,
        active: here === path, onClick: () => nav(path ? `${base}/${path}` : base),
      })),
      { key: 'tablet', label: 'Tablet', icon: <Tablet />, onClick: () => nav(`/kiosk?farm=${f.id}`), end: true },
      { key: 'out', label: 'Sign out', icon: <LogOut />, onClick: signOut, end: true },
    ]} />
  )
  return (
    <EarthShell rail={rail}>
      <header className="glass card-in flex flex-wrap items-center gap-3 rounded-[1.75rem] py-2.5 ps-4 pe-2.5">
        <MilhLogo color="#f7f8f4" className="h-9 w-auto shrink-0" />
        <div className="min-w-0 border-s border-white/10 ps-3">
          <div className="font-semibold leading-tight">{f.name}</div>
          {f.example_label && <div className="max-w-xs truncate text-xs text-ink-soft" title={f.example_label}>{f.example_label}</div>}
        </div>
        <div className="mx-auto min-w-0 max-w-full"><TabNav farmId={f.id} alerts={open} /></div>
        <Link to={`/kiosk?farm=${f.id}`} className="press glass-chip hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold xl:flex">
          <Tablet /> Open farm tablet view
        </Link>
      </header>
      <main className="min-w-0">
        <Routes>
          <Route index element={<TodayTab farm={f} openAlerts={open} />} />
          <Route path="data" element={<DataTab farm={f} />} />
          <Route path="salt" element={<SaltClockTab farm={f} />} />
          <Route path="reports" element={<ReportsTab farm={f} />} />
          <Route path="alerts" element={<AlertsTab farm={f} />} />
          <Route path="setup" element={<SetupTab farm={f} />} />
        </Routes>
      </main>
    </EarthShell>
  )
}

function TodayTab({ farm, openAlerts }: { farm: Farm; openAlerts: number }) {
  const qc = useQueryClient()
  const plans = usePlans(farm.id)
  const sources = useSources(farm.id)
  const bundle = useKioskBundle(farm.id)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
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
  const sel = list.find((p) => p.id === picked) ?? list[0] ?? null
  const planned = list.reduce((a, p) => a + p.gross_l, 0)
  const usual = list.reduce((a, p) => a + p.habit_l, 0)
  const saved = list.reduce((a, p) => a + p.saved_l, 0)
  const aed = list.reduce((a, p) => a + p.saved_aed, 0)
  const b = bundle.data?.bundle
  return (
    <div className="grid gap-3 md:gap-4">
      <div className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2.4fr)]">
        {b ? <WeatherCard bundle={b} now={now} delay={60} /> : <div className="glass card-in min-h-[15rem] rounded-[1.75rem]" />}
        <FarmView ariaLabel="Blocks" delay={120}
          top={list.length > 1 && sel ? <PlanPicker plans={list} sel={sel} onPick={setPicked} /> : undefined}>
          {sel ? <PlanCard plan={sel} bundle={b} tz={farm.timezone} />
            : <div className="glass sheet-in max-w-md rounded-[1.5rem] p-5">No plan for today yet. Fetch the weather and recompute, or wait for the 03:00 run.</div>}
        </FarmView>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat delay={180} icon={<DropIcon className="size-5" color="currentColor" />} label="Water planned today" value={litres(planned).replace(/\s?L$/, '')} unit="L"
          sub={<>usual <span className="num">{litres(usual)}</span></>}>
          <Bar value={usual ? planned / usual : 0} color="var(--color-water)" label="planned compared with usual" />
        </Stat>
        <Stat delay={240} icon={<DropIcon className="size-5" color="currentColor" />} label="Water saved" value={litres(saved).replace(/\s?L$/, '')} unit="L" tone="good"
          sub={usual ? <><span className="num text-leaf">{Math.round((saved / usual) * 100)}%</span> less than usual</> : undefined} />
        <Stat delay={300} icon={<Chart />} label="Cost vs usual" value={`${aed >= 0 ? '−' : '+'}${Math.abs(aed).toFixed(2)}`} unit="AED" tone={aed >= 0 ? 'good' : 'warn'}
          sub="water and pumping, today" />
        <Stat delay={360} icon={<Bell />} label="Open alerts" value={openAlerts} tone={openAlerts ? 'warn' : undefined}
          sub={openAlerts ? 'see the Alerts tab' : 'nothing needs you'} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-xl font-semibold">Plan details</h2>
        <button disabled={!!busy} onClick={() => run('weather', `/api/v1/farms/${farm.id}/weather/refresh`)}
          className="press glass-chip flex items-center gap-2 rounded-full px-4 py-2 font-semibold disabled:opacity-50"><Refresh />{busy === 'weather' ? 'Fetching…' : 'Fetch live weather'}</button>
        <button disabled={!!busy} onClick={() => run('plan', `/api/v1/farms/${farm.id}/plans/recompute`)}
          className="press rounded-full bg-[#f7f8f4] px-4 py-2 font-semibold text-[#0b0e07] disabled:opacity-50">{busy === 'plan' ? 'Planning…' : "Recompute today's plan"}</button>
      </div>
      {msg && <p className="text-brine">{msg}</p>}
      {plans.data?.length === 0 && <p className="glass rounded-[1.5rem] p-5">No plan for today yet. Fetch the weather and recompute, or wait for the 03:00 run.</p>}
      {plans.data?.map((p, i) => (
        <div key={p.id} className="card-in" style={{ animationDelay: `${420 + i * 70}ms` }}>
          <PlanDetail plan={p} sources={sources.data ?? []} tz={farm.timezone} />
        </div>
      ))}
    </div>
  )
}

function PlanPicker({ plans, sel, onPick }: { plans: Plan[]; sel: Plan; onPick: (id: string) => void }) {
  const i = plans.indexOf(sel)
  const go = (d: number) => onPick(plans[(i + d + plans.length) % plans.length].id)
  const btn = 'press glass-chip grid size-10 place-items-center rounded-full text-lg text-white'
  return (
    <div className="flex items-center gap-2" dir="ltr">
      <button type="button" className={btn} onClick={() => go(-1)} aria-label="Previous block"><ChevronLeft /></button>
      <span key={sel.id} className="fade-in min-w-28 rounded-full bg-[#f7f8f4] px-5 py-2 text-center font-semibold text-[#0b0e07]">{sel.block_name}</span>
      <button type="button" className={btn} onClick={() => go(1)} aria-label="Next block"><ChevronRight /></button>
    </div>
  )
}

/** The selected block over the farm picture: today's decision and the block's soil, all from real records. */
function PlanCard({ plan, bundle, tz }: { plan: Plan; bundle: KioskBundle | undefined; tz: string }) {
  const block = bundle?.blocks.find((x) => x.id === plan.block_id)
  const run = bundle?.runs.find((r) => r.plan_id === plan.id)
  const steps = run?.steps ?? []
  const soilColor = block?.soil.status === 'high' ? 'var(--color-brine)' : block?.soil.status === 'warn' ? 'var(--color-dune)' : 'var(--color-palm)'
  const rows: [string, ReactNode][] = [
    ['Water today', <><span className="num">{litres(plan.gross_l)}</span> <span className="text-ink-soft">/ usual {litres(plan.habit_l)}</span></>],
    ['Yield (estimate)', plan.plan_yield_pct != null ? <span key="v" className="num">{Math.round(plan.plan_yield_pct)}%</span> : '—'],
    ['Water salt (mix)', plan.ecw != null ? <span key="v" className="num">{plan.ecw.toFixed(2)} dS/m</span> : '—'],
    ['Next soil test', block?.next_test_due ? <span key="v" className="num">{dayMonth(block.next_test_due, tz)}</span> : '—'],
  ]
  return (
    <div key={plan.id} className="glass sheet-in w-full max-w-[34rem] rounded-[1.5rem] p-4 md:p-5">
      <div className="flex items-start gap-3">
        <CropArt crop={plan.crop_key} className="size-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold">{plan.block_name}</div>
          <div className="text-ink-soft">{block ? pick(block.crop_names, 'en') : plan.crop_key} · <span className="num">{plan.start_at ? `${hhmm(plan.start_at, tz)}–${hhmm(plan.end_at, tz)}` : plan.skip_reason ?? '—'}</span></div>
        </div>
        <div className="text-end"><span className="num text-5xl leading-none">{plan.minutes}</span><span className="ms-1 text-ink-soft">min</span></div>
      </div>
      {steps.length > 0 && <div className="mt-3"><PipeBar steps={steps} lang="en" /></div>}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-ink-soft">{k}</dt><dd className="text-end">{v}</dd></div>))}
      </dl>
      {block && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/6 px-3 py-2">
          <SoilSprout status={block.soil.status} className="h-7 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-sm"><span>Soil salt</span>
              <span className="num">{block.soil.ece != null ? `ECe ${block.soil.ece.toFixed(1)} / ${block.salt_threshold.toFixed(1)}` : 'no test yet'}</span></div>
            {block.soil.ece != null && <Bar value={block.soil.ece / (block.salt_threshold * 1.5)} color={soilColor} className="mt-1" />}
          </div>
        </div>
      )}
      {plan.cap_exceeded && <p className="mt-3 flex items-center gap-2 rounded-xl bg-brine/15 px-3 py-2 text-sm font-semibold text-brine"><Warn /> No water mix keeps salt under this crop's limit.</p>}
    </div>
  )
}

function AlertsTab({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const alerts = useAlerts(farm.id)
  if (!alerts.data?.length) return <p className="glass card-in rounded-[1.5rem] p-5">No open alerts.</p>
  return (
    <ul className="grid gap-2">
      {alerts.data.map((a) => (
        <li key={a.id} className="glass card-in flex items-center gap-3 rounded-[1.5rem] p-4">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${a.severity === 'critical' ? 'bg-brine' : a.severity === 'warning' ? 'bg-dune' : 'bg-ink-soft'}`}>{a.severity}</span>
          <span className="flex-1">{pick(a.message, 'en')}</span>
          <span className="text-xs text-ink-soft">{new Date(a.created_at).toLocaleString()}</span>
          <button className="rounded-xl px-3 py-1.5 ring-1 ring-line" onClick={async () => {
            await api(`/api/v1/alerts/${a.id}/resolve`, { method: 'POST' })
            await qc.invalidateQueries({ queryKey: ['alerts', farm.id] })
          }}>Resolve</button>
        </li>
      ))}
    </ul>
  )
}
