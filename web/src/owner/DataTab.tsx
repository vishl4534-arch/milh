import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useBlocks, useReadings, useSoilTests, useSources, useTanks } from '../api/hooks'
import type { Farm, IngestResult } from '../api/types'
import { ImportCsv } from './ImportCsv'

const input = 'mt-1 w-full rounded-xl border border-line bg-salt px-3 py-2'
const METRICS = {
  water_ec: { label: 'Water salt (EC)', units: ['dS/m', 'mS/cm', 'µS/cm'], target: 'source' },
  tank_level_pct: { label: 'Tank level', units: ['%'], target: 'tank' },
  tank_volume_l: { label: 'Tank volume', units: ['L', 'm3'], target: 'tank' },
  flow_l: { label: 'Water meter', units: ['L', 'm3'], target: 'tank' },
  soil_moisture_vwc: { label: 'Soil moisture', units: ['%'], target: 'block' },
} as const
type MetricKey = keyof typeof METRICS

function localNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function DataTab({ farm }: { farm: Farm }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ReadingForm farm={farm} />
      <SoilTestForm farm={farm} />
      <div className="lg:col-span-2"><ImportCsv farmId={farm.id} /></div>
      <div className="lg:col-span-2"><RecentReadings farm={farm} /></div>
      <AnnouncementForm farm={farm} />
    </div>
  )
}

function ReadingForm({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const sources = useSources(farm.id)
  const tanks = useTanks(farm.id)
  const blocks = useBlocks(farm.id)
  const [metric, setMetric] = useState<MetricKey>('water_ec')
  const [target, setTarget] = useState('')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<string>('dS/m')
  const [at, setAt] = useState(localNow)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const m = METRICS[metric]
  const options = m.target === 'source' ? sources.data ?? [] : m.target === 'tank' ? tanks.data ?? [] : blocks.data ?? []
  async function submit(e: FormEvent) {
    e.preventDefault()
    const ref = target || options[0]?.id
    const body = { reading_id: crypto.randomUUID(), farm_id: farm.id, metric, value: Number(value), unit,
      measured_at: new Date(at).toISOString(), note: note || null, [`${m.target}_id`]: ref }
    try {
      const r = await api<{ results: IngestResult[] }>('/api/v1/readings', { method: 'POST', json: body })
      const res = r.results[0]
      setMsg(res.status === 'rejected' ? `Not saved: ${res.message}` : `Saved${res.flags.includes('jump') ? ' — big change from last reading, owner alerted' : ''}.`)
      if (res.status !== 'rejected') { setValue(''); await qc.invalidateQueries() }
    } catch (err) { setMsg((err as Error).message) }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-3xl bg-panel p-5 ring-1 ring-line">
      <h3 className="text-lg font-bold">Add a reading</h3>
      <label className="text-sm">What was measured
        <select className={input} value={metric} onChange={(e) => { const k = e.target.value as MetricKey; setMetric(k); setUnit(METRICS[k].units[0]); setTarget('') }}>
          {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <label className="text-sm">{m.target === 'source' ? 'Water source' : m.target === 'tank' ? 'Tank' : 'Block'}
        <select className={input} value={target} onChange={(e) => setTarget(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="text-sm">Value<input className={`${input} num`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required /></label>
        <label className="text-sm">Unit<select className={input} value={unit} onChange={(e) => setUnit(e.target.value)}>{m.units.map((u) => <option key={u}>{u}</option>)}</select></label>
      </div>
      <label className="text-sm">Measured at<input type="datetime-local" className={input} value={at} onChange={(e) => setAt(e.target.value)} required /></label>
      <label className="text-sm">Note or citation (for published data)<input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {msg && <p className="text-sm font-semibold">{msg}</p>}
      <button className="rounded-xl bg-ink py-2.5 font-semibold text-salt">Save reading</button>
    </form>
  )
}

function SoilTestForm({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const blocks = useBlocks(farm.id)
  const tests = useSoilTests(farm.id)
  const [block, setBlock] = useState('')
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [ece, setEce] = useState('')
  const [ec15, setEc15] = useState('')
  const [ph, setPh] = useState('')
  const [lab, setLab] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const num = (s: string) => (s === '' ? null : Number(s))
    try {
      await api(`/api/v1/farms/${farm.id}/soil-tests`, { method: 'POST', json: {
        id: crypto.randomUUID(), block_id: block || blocks.data?.[0]?.id, tested_on: day, ece: num(ece), ec_1to5: num(ec15),
        ph: num(ph), lab: lab || null, note: note || null } })
      setMsg('Saved. The next test date is updated.')
      setEce(''); setEc15(''); setPh('')
      await qc.invalidateQueries()
    } catch (err) { setMsg((err as Error).message) }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-3xl bg-panel p-5 ring-1 ring-line">
      <h3 className="text-lg font-bold">Add a soil test</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">Block<select className={input} value={block} onChange={(e) => setBlock(e.target.value)}>{blocks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="text-sm">Test date<input type="date" className={input} value={day} onChange={(e) => setDay(e.target.value)} /></label>
        <label className="text-sm">ECe (dS/m)<input className={`${input} num`} inputMode="decimal" value={ece} onChange={(e) => setEce(e.target.value)} /></label>
        <label className="text-sm">or EC 1:5 (dS/m)<input className={`${input} num`} inputMode="decimal" value={ec15} onChange={(e) => setEc15(e.target.value)} /></label>
        <label className="text-sm">pH<input className={`${input} num`} inputMode="decimal" value={ph} onChange={(e) => setPh(e.target.value)} /></label>
        <label className="text-sm">Lab<input className={input} value={lab} onChange={(e) => setLab(e.target.value)} /></label>
      </div>
      <label className="text-sm">Note or citation<input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {msg && <p className="text-sm font-semibold">{msg}</p>}
      <button className="rounded-xl bg-ink py-2.5 font-semibold text-salt" disabled={!ece && !ec15}>Save soil test</button>
      {tests.data && tests.data.length > 0 && (
        <table className="text-sm">
          <thead><tr className="text-ink-soft"><th className="text-start font-normal">Date</th><th className="text-start font-normal">Block</th><th className="text-end font-normal">ECe</th><th className="text-end font-normal">pH</th><th className="text-start font-normal ps-3">Source</th></tr></thead>
          <tbody>{tests.data.slice(0, 6).map((t) => (
            <tr key={t.id} className="border-t border-line"><td className="num">{t.tested_on}</td><td>{blocks.data?.find((b) => b.id === t.block_id)?.name}</td><td className="num text-end">{t.ece.toFixed(2)}</td><td className="num text-end">{t.ph ?? '—'}</td><td className="ps-3 text-ink-soft" title={t.note ?? ''}>{t.source}</td></tr>
          ))}</tbody>
        </table>
      )}
    </form>
  )
}

function RecentReadings({ farm }: { farm: Farm }) {
  const r = useReadings(farm.id, 'limit=15')
  if (!r.data?.length) return <p className="rounded-2xl bg-panel p-5 text-ink-soft ring-1 ring-line">No readings yet. Every number on the dashboard will come from readings added here, by CSV, by API or by sensors.</p>
  return (
    <section className="rounded-3xl bg-panel p-5 ring-1 ring-line">
      <h3 className="text-lg font-bold">Latest readings</h3>
      <table className="mt-2 w-full text-sm">
        <thead><tr className="text-ink-soft"><th className="text-start font-normal">When</th><th className="text-start font-normal">What</th><th className="text-end font-normal">Value</th><th className="text-start font-normal ps-3">Where it came from</th></tr></thead>
        <tbody>{r.data.map((x) => (
          <tr key={x.id} className="border-t border-line align-top">
            <td className="num whitespace-nowrap">{new Date(x.measured_at).toLocaleString()}</td>
            <td>{x.metric}{x.flags.includes('jump') && <span className="ms-1 text-dune">▲ jump</span>}</td>
            <td className="num text-end">{x.value} {x.unit}</td>
            <td className="ps-3 text-ink-soft">{x.source}{x.note && <div className="text-xs">{x.note}</div>}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  )
}

function AnnouncementForm({ farm }: { farm: Farm }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const a = await api<{ untranslated: string[] }>(`/api/v1/farms/${farm.id}/announcements`, { method: 'POST', json: { text, lang: 'en' } })
      setMsg(a.untranslated.length ? `Sent. Not translated into: ${a.untranslated.join(', ')} (no Gemini key).` : 'Sent to the farm tablet in every language.')
      setText('')
    } catch (err) { setMsg((err as Error).message) }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-3xl bg-panel p-5 ring-1 ring-line lg:col-span-2">
      <h3 className="text-lg font-bold">Announce something now</h3>
      <textarea className={input} rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. The fertiliser truck arrives at 10." required />
      {msg && <p className="text-sm font-semibold">{msg}</p>}
      <button className="justify-self-start rounded-xl bg-ink px-4 py-2.5 font-semibold text-salt">Announce on the farm tablet</button>
    </form>
  )
}
