import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { useAlerts, useFarm, useFarms, usePlans, useSources } from '../api/hooks'
import type { Farm } from '../api/types'
import { pick } from '../i18n'
import { DataTab } from './DataTab'
import { PlanDetail } from './PlanDetail'
import { ReportsTab } from './ReportsTab'
import { SaltClockTab } from './SaltClockTab'
import { SetupTab } from './SetupTab'
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

function FarmList() {
  const farms = useFarms()
  const signOut = useSignOut()
  if (farms.isLoading) return <p className="p-6">Loading…</p>
  if (farms.error) return <p className="p-6 text-brine">{(farms.error as Error).message} · <button className="underline" onClick={signOut}>Sign in again</button></p>
  const list = farms.data ?? []
  if (list.length === 1) return <Navigate to={`farms/${list[0].id}`} replace />
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-3xl font-black">Your farms</h1>
      <ul className="mt-4 grid gap-3">
        {list.map((f) => (
          <li key={f.id}><Link className="block rounded-2xl bg-panel p-4 text-xl font-semibold ring-1 ring-line" to={`farms/${f.id}`}>{f.name}</Link></li>
        ))}
      </ul>
      {list.length === 0 && <NewFarm />}
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

function FarmDashboard() {
  const { farmId = '' } = useParams()
  const farm = useFarm(farmId)
  const alerts = useAlerts(farmId)
  const signOut = useSignOut()
  if (farm.isLoading) return <p className="p-6">Loading…</p>
  if (!farm.data) return <p className="p-6 text-brine">Farm not found.</p>
  const f = farm.data
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="font-display text-2xl font-black">Milh</div>
          <div className="min-w-0">
            <div className="font-semibold">{f.name}</div>
            {f.example_label && <div className="max-w-xl truncate text-xs text-ink-soft" title={f.example_label}>{f.example_label}</div>}
          </div>
          <div className="ms-auto flex items-center gap-2">
            <Link to={`/kiosk?farm=${f.id}`} className="rounded-xl bg-palm px-3 py-2 font-semibold text-white">Open farm tablet view</Link>
            <button onClick={signOut} className="rounded-xl px-3 py-2 ring-1 ring-line">Sign out</button>
          </div>
        </div>
        <TabNav farmId={f.id} alerts={alerts.data?.length ?? 0} />
      </header>
      <main className="mx-auto max-w-6xl p-4">
        <Routes>
          <Route index element={<TodayTab farm={f} />} />
          <Route path="data" element={<DataTab farm={f} />} />
          <Route path="salt" element={<SaltClockTab farm={f} />} />
          <Route path="reports" element={<ReportsTab farm={f} />} />
          <Route path="alerts" element={<AlertsTab farm={f} />} />
          <Route path="setup" element={<SetupTab farm={f} />} />
        </Routes>
      </main>
    </div>
  )
}

function TodayTab({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const plans = usePlans(farm.id)
  const sources = useSources(farm.id)
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
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => run('weather', `/api/v1/farms/${farm.id}/weather/refresh`)}
          className="rounded-xl bg-panel px-4 py-2 font-semibold ring-1 ring-line disabled:opacity-50">{busy === 'weather' ? 'Fetching…' : 'Fetch live weather'}</button>
        <button disabled={!!busy} onClick={() => run('plan', `/api/v1/farms/${farm.id}/plans/recompute`)}
          className="rounded-xl bg-ink px-4 py-2 font-semibold text-salt disabled:opacity-50">{busy === 'plan' ? 'Planning…' : "Recompute today's plan"}</button>
      </div>
      {msg && <p className="text-brine">{msg}</p>}
      {plans.data?.length === 0 && <p className="rounded-2xl bg-panel p-5 ring-1 ring-line">No plan for today yet. Fetch the weather and recompute, or wait for the 03:00 run.</p>}
      {plans.data?.map((p) => <PlanDetail key={p.id} plan={p} sources={sources.data ?? []} tz={farm.timezone} />)}
    </div>
  )
}

function AlertsTab({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const alerts = useAlerts(farm.id)
  if (!alerts.data?.length) return <p className="rounded-2xl bg-panel p-5 ring-1 ring-line">No open alerts.</p>
  return (
    <ul className="grid gap-2">
      {alerts.data.map((a) => (
        <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-panel p-4 ring-1 ring-line">
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
