import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useBlocks, useCrops, useKioskBundle, useSources, useTanks } from '../api/hooks'
import type { Farm } from '../api/types'
import { pick } from '../i18n'
import { TankArt } from '../kiosk/art/Tank'
import { Card, Field } from './ui'
import { ageText, hoursSince } from '../lib/format'

interface DeviceRow {
  id: string
  name: string
  kind: string
  key_prefix: string
  created_at: string
  last_seen_at: string | null
}

const fmt = (n: number) => n.toLocaleString('en-US')

export function SetupTab({ farm }: { farm: Farm }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SettingsForm farm={farm} />
        <Devices farm={farm} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Sources farm={farm} />
        <Tanks farm={farm} />
      </div>
      <Blocks farm={farm} />
    </div>
  )
}

function SettingsForm({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const s = farm.settings
  const [form, setForm] = useState({ earliest_start: s.earliest_start, briefing_time: s.briefing_time, lr_cap: String(s.lr_cap),
    heat_c: String(s.heat_c), tank_low_pct: String(s.tank_low_pct), flush_extra_mm: String(s.flush_extra_mm) })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api(`/api/v1/farms/${farm.id}`, { method: 'PATCH', json: { settings: {
        earliest_start: form.earliest_start, briefing_time: form.briefing_time, lr_cap: Number(form.lr_cap),
        heat_c: Number(form.heat_c), tank_low_pct: Number(form.tank_low_pct), flush_extra_mm: Number(form.flush_extra_mm) } } })
      setMsg({ ok: true, text: 'Saved. Today’s plan will be recomputed.' })
      await qc.invalidateQueries({ queryKey: ['farm', farm.id] })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const input = (k: keyof typeof form, type: string, extra: Record<string, string> = {}, padEnd = false) => (
    <input type={type} required className={`num no-spin h-10 w-full px-3 ${padEnd ? 'pe-12' : ''}`} value={form[k]} {...extra}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  )
  return (
    <form onSubmit={submit} className="flex h-full flex-col rounded-3xl bg-panel p-6 ring-1 ring-line">
      <header className="mb-5">
        <h3 className="text-base font-semibold">Farm rules</h3>
        <p className="mt-0.5 text-sm text-ink-soft">How Milh plans the day on this farm.</p>
      </header>
      <div className="mb-6 grid gap-x-5 gap-y-5 sm:grid-cols-2">
        <Field label="Workers start" hint="No watering is planned before this.">{input('earliest_start', 'time')}</Field>
        <Field label="Morning briefing" hint="When the tablet reads out the day.">{input('briefing_time', 'time')}</Field>
        <Field label="Max extra water for salt" hint="0.3 means up to 30% extra to wash salt out.">
          {input('lr_cap', 'number', { min: '0', max: '0.9', step: '0.05' })}
        </Field>
        <Field label="Flush day extra" unit="mm" hint="Added once on a salt-flush day.">
          {input('flush_extra_mm', 'number', { min: '0', step: '1' }, true)}
        </Field>
        <Field label="Heat warning at" unit="°C" hint="Announces the midday break above this.">
          {input('heat_c', 'number', { min: '30', max: '60', step: '1' }, true)}
        </Field>
        <Field label="Tank low below" unit="%" hint="Raises an alert under this level.">
          {input('tank_low_pct', 'number', { min: '0', max: '100', step: '1' }, true)}
        </Field>
      </div>
      <footer className="mt-auto flex flex-wrap items-center justify-end gap-3 border-t hairline pt-5">
        {msg && <p role="status" className={`me-auto text-sm ${msg.ok ? 'text-palm' : 'text-brine'}`}>{msg.text}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save rules'}</button>
      </footer>
    </form>
  )
}

function Devices({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['devices', farm.id], queryFn: () => api<DeviceRow[]>(`/api/v1/farms/${farm.id}/devices`) })
  const [kind, setKind] = useState<'kiosk' | 'sensor'>('kiosk')
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  async function create() {
    setMsg('')
    setCopied(false)
    try {
      const d = await api<{ api_key: string }>(`/api/v1/farms/${farm.id}/devices`, { method: 'POST', json: { name: kind === 'kiosk' ? 'Farm tablet' : 'Sensor', kind } })
      setKey(d.api_key)
      await qc.invalidateQueries({ queryKey: ['devices', farm.id] })
    } catch (err) { setMsg((err as Error).message) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(key); setCopied(true) } catch { setCopied(false) }
  }
  const rows = list.data ?? []
  return (
    <Card title="Tablets and sensors"
      hint="A farm tablet signs in with its key plus a worker's PIN. Sensors send readings with theirs.">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Device type" className="h-9 px-3" value={kind} onChange={(e) => setKind(e.target.value as 'kiosk' | 'sensor')}>
          <option value="kiosk">Farm tablet</option>
          <option value="sensor">Sensor</option>
        </select>
        <button type="button" onClick={create} className="btn btn-primary">Create key</button>
      </div>
      {key && (
        <div className="mt-4 rounded-xl border border-dune/30 bg-dune/5 p-4">
          <p className="text-sm font-medium">Copy this key now. It is shown only once.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="mono min-w-0 flex-1 truncate rounded-lg bg-panel px-3 py-2 text-sm ring-1 ring-line">{key}</code>
            <button type="button" onClick={copy} className="btn btn-secondary">{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      )}
      {msg && <p className="mt-3 text-sm text-brine">{msg}</p>}
      <div className="mt-5">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">
            No tablets or sensors yet. Create a key for the farm tablet first.
          </p>
        ) : (
          <table className="data-table w-full text-sm">
            <thead><tr><th>Name</th><th>Type</th><th>Key starts</th><th className="text-end">Added</th><th className="text-end">Last seen</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.name}</td>
                  <td><span className={`chip ${d.kind === 'kiosk' ? 'chip-green' : 'chip-blue'}`}>{d.kind === 'kiosk' ? 'Tablet' : 'Sensor'}</span></td>
                  <td className="mono text-ink-soft">{d.key_prefix}…</td>
                  <td className="num text-end">{new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                  <td className="num text-end text-ink-soft">{d.last_seen_at ? new Date(d.last_seen_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-5 rounded-xl bg-salt p-4">
        <h4 className="eyebrow">Set up a farm tablet</h4>
        <ol className="mt-3 grid gap-2.5 text-sm">
          {[
            <>Create a <span className="font-medium">Farm tablet</span> key above and copy it.</>,
            <>On the tablet, open<code className="mono mt-1 block w-fit max-w-full overflow-x-auto whitespace-nowrap rounded bg-panel px-1.5 py-0.5 ring-1 ring-line">{window.location.origin}/kiosk/login</code></>,
            <>Enter the key and a worker's PIN. The tablet remembers the key; each day the worker signs in with just their PIN.</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-palm text-[0.6875rem] font-semibold text-white">{i + 1}</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-auto pt-4 text-xs text-ink-soft">Sensors post to <code className="mono">/api/v1/readings</code> with the header <code className="mono">X-Api-Key</code>.</p>
    </Card>
  )
}

function Sources({ farm }: { farm: Farm }) {
  const sources = useSources(farm.id)
  return (
    <Card title="Water sources" hint="Where the farm's water comes from, the tap the workers see, and what it costs.">
      <div className="overflow-x-auto">
        <table className="data-table w-full min-w-[34rem] text-sm">
          <thead><tr><th>Source</th><th>Tap on the tablet</th><th className="text-end">Cost</th><th className="text-end">Declared salt (EC)</th></tr></thead>
          <tbody>
            {sources.data?.map((s) => (
              <tr key={s.id}>
                <td className="font-medium"><span className="me-2.5 inline-block size-2.5 rounded-full align-middle" style={{ background: s.tap_color }} />{s.name}</td>
                <td>{pick(s.tap_label, 'en')}</td>
                <td className="num text-end">{s.cost_per_m3} <span className="text-ink-soft">AED/m³</span></td>
                <td className="num text-end">{s.declared_ec != null ? <>{s.declared_ec} <span className="text-ink-soft">dS/m</span></> : <span className="text-ink-soft">not declared</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-auto pt-4 text-xs text-ink-soft">Each morning Milh blends these taps to keep salt under every crop's limit at the lowest water cost.</p>
    </Card>
  )
}

function Blocks({ farm }: { farm: Farm }) {
  const blocks = useBlocks(farm.id)
  const crops = useCrops()
  const cropOf = (key: string) => crops.data?.find((c) => c.key === key)
  const used = [...new Set((blocks.data ?? []).map((b) => b.crop_key))].map(cropOf).filter((c) => c?.citation)
  return (
    <Card title="Blocks" hint="Each block's crop, size and drip system, and how long it used to be watered.">
      <div className="overflow-x-auto">
        <table className="data-table w-full min-w-[40rem] text-sm">
          <thead><tr><th>Block</th><th>Crop</th><th className="text-end">Area</th><th className="text-end">Drip flow</th><th className="text-end">Usual watering</th><th className="text-end">Planted</th></tr></thead>
          <tbody>
            {blocks.data?.map((b) => (
              <tr key={b.id}>
                <td className="font-medium">{b.name}</td>
                <td>{pick(cropOf(b.crop_key)?.names, 'en') || b.crop_key}</td>
                <td className="num text-end">{fmt(b.area_m2)} <span className="text-ink-soft">m²</span></td>
                <td className="num text-end">{fmt(b.flow_l_per_h)} <span className="text-ink-soft">L/h</span></td>
                <td className="num text-end">{b.habit_minutes} <span className="text-ink-soft">min</span></td>
                <td className="num text-end text-ink-soft">{b.planting_date ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {used.length > 0 && (
        <details className="mt-4 text-xs text-ink-soft">
          <summary className="cursor-pointer select-none font-medium">Where the crop values come from</summary>
          <ul className="mt-2 grid gap-1">
            {used.map((c) => <li key={c!.key}><span className="font-medium text-ink">{pick(c!.names, 'en')}:</span> {c!.citation}</li>)}
          </ul>
        </details>
      )}
    </Card>
  )
}

function Tanks({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const tanks = useTanks(farm.id)
  const bundle = useKioskBundle(farm.id)
  const [now] = useState(() => Date.now())
  const low = farm.settings.tank_low_pct
  return (
    <Card title="Tanks" hint="Storage the workers read the level of.">
      <ul className="grid gap-4">
        {tanks.data?.map((tk) => {
          const live = bundle.data?.bundle.tanks.find((x) => x.id === tk.id)
          const pct = live?.level_pct ?? null
          const isLow = pct !== null && pct < low
          return (
            <li key={tk.id} className="flex items-center gap-4">
              <TankArt pct={pct} className="h-20 w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{tk.name}</span>
                  <span className="num text-sm text-ink-soft">{fmt(tk.capacity_l)} L</span>
                </div>
                {pct === null ? (
                  <p className="mt-1 text-sm text-ink-soft">No level reading yet.</p>
                ) : (
                  <>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className={`num text-2xl font-semibold ${isLow ? 'text-dune' : ''}`}>{Math.round(pct)}%</span>
                      {live?.volume_l != null && <span className="num text-sm text-ink-soft">{fmt(Math.round(live.volume_l))} L</span>}
                    </div>
                    <div className="relative mt-2 h-2 rounded-full bg-salt">
                      <div className={`h-full rounded-full ${isLow ? 'bg-dune' : 'bg-water'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      <span aria-hidden title={`Low below ${low}%`} className="absolute -top-1 h-4 w-px bg-ink-soft/60" style={{ insetInlineStart: `${low}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-soft">
                      {live?.measured_at ? `Read ${t('common.ago', { age: ageText(hoursSince(live.measured_at, now), t) })}` : 'Reading time unknown'} · low below {low}%
                    </p>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-auto pt-4 text-xs text-ink-soft">Workers add tank readings on the farm tablet; sensors can send them too.</p>
    </Card>
  )
}
