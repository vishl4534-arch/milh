import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useBlocks, useKioskBundle, useReadings, useSoilTests, useSources, useTanks } from '../api/hooks'
import type { Farm, IngestResult } from '../api/types'
import { dayMonth, hhmm } from '../lib/format'
import { ImportCsv } from './ImportCsv'
import { LabReport } from './LabReport'
import { Card, CardFooter, Field } from './ui'

const METRICS = {
  water_ec: { label: 'Water salt (EC)', short: 'Water salt', units: ['dS/m', 'mS/cm', 'µS/cm'], target: 'source' },
  tank_level_pct: { label: 'Tank level', short: 'Tank level', units: ['%'], target: 'tank' },
  tank_volume_l: { label: 'Tank volume', short: 'Tank volume', units: ['L', 'm3'], target: 'tank' },
  flow_l: { label: 'Water meter', short: 'Water meter', units: ['L', 'm3'], target: 'tank' },
  soil_moisture_vwc: { label: 'Soil moisture', short: 'Soil moisture', units: ['%'], target: 'block' },
} as const
type MetricKey = keyof typeof METRICS

const ORIGIN: Record<string, [string, string]> = {
  manual: ['Typed in', 'chip-neutral'], csv_import: ['CSV', 'chip-blue'], sensor: ['Sensor', 'chip-green'],
  mqtt: ['Sensor', 'chip-green'], api: ['API', 'chip-blue'], lab_report: ['Lab report', 'chip-amber'], kiosk: ['Tablet', 'chip-green'],
}
const originChip = (src: string) => {
  const [text, cls] = ORIGIN[src] ?? [src.replace(/_/g, ' '), 'chip-neutral']
  return <span className={`chip ${cls}`}>{text}</span>
}

function localNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const box = 'h-10 w-full px-3'

export function DataTab({ farm }: { farm: Farm }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ReadingForm farm={farm} />
        <SoilTestForm farm={farm} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ImportCsv farmId={farm.id} />
        <LabReportSection farm={farm} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <RecentReadings farm={farm} />
        <RecentSoilTests farm={farm} />
      </div>
      <AnnouncementForm farm={farm} />
    </div>
  )
}

function LabReportSection({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const blocks = useBlocks(farm.id)
  return <LabReport farmId={farm.id} blocks={blocks.data ?? []} onSaved={() => void qc.invalidateQueries()} />
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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const m = METRICS[metric]
  const options = m.target === 'source' ? sources.data ?? [] : m.target === 'tank' ? tanks.data ?? [] : blocks.data ?? []
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const ref = target || options[0]?.id
    const body = { reading_id: crypto.randomUUID(), farm_id: farm.id, metric, value: Number(value), unit,
      measured_at: new Date(at).toISOString(), note: note || null, [`${m.target}_id`]: ref }
    try {
      const r = await api<{ results: IngestResult[] }>('/api/v1/readings', { method: 'POST', json: body })
      const res = r.results[0]
      if (res.status === 'rejected') setMsg({ ok: false, text: `Not saved: ${res.message}` })
      else {
        setMsg({ ok: true, text: `Saved${res.flags.includes('jump') ? ' — a big change from the last reading, so you were alerted' : ''}.` })
        setValue('')
        await qc.invalidateQueries()
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Add a reading" hint="Water salt, tank level, the water meter or soil moisture." onSubmit={submit}>
      <div className="mb-6 grid gap-x-5 gap-y-5 sm:grid-cols-2">
        <Field label="What was measured">
          <select className={box} value={metric} onChange={(e) => { const k = e.target.value as MetricKey; setMetric(k); setUnit(METRICS[k].units[0]); setTarget('') }}>
            {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label={m.target === 'source' ? 'Water source' : m.target === 'tank' ? 'Tank' : 'Block'}>
          <select className={box} value={target} onChange={(e) => setTarget(e.target.value)}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Value" hint={m.units.length > 1 ? 'Any of these units; Milh converts it.' : undefined}>
          <span className="flex">
            <input className={`num ${box} rounded-e-none`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required
              aria-label="Value" placeholder="0.0" />
            {m.units.length > 1 ? (
              <select aria-label="Unit" className="h-10 w-28 shrink-0 rounded-s-none border-s-0 px-2" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {m.units.map((u) => <option key={u}>{u}</option>)}
              </select>
            ) : (
              <span className="grid h-10 w-16 shrink-0 place-items-center rounded-e-lg border border-s-0 border-line bg-salt text-sm text-ink-soft">{m.units[0]}</span>
            )}
          </span>
        </Field>
        <Field label="Measured at">
          <input type="datetime-local" className={box} value={at} onChange={(e) => setAt(e.target.value)} required />
        </Field>
        <Field className="sm:col-span-2" label="Note or citation" hint="Only for published data: author, year, table.">
          <input className={box} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <CardFooter message={msg?.text} ok={msg?.ok}>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save reading'}</button>
      </CardFooter>
    </Card>
  )
}

function SoilTestForm({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const blocks = useBlocks(farm.id)
  const [block, setBlock] = useState('')
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [ece, setEce] = useState('')
  const [ec15, setEc15] = useState('')
  const [ph, setPh] = useState('')
  const [lab, setLab] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const num = (s: string) => (s === '' ? null : Number(s))
    try {
      await api(`/api/v1/farms/${farm.id}/soil-tests`, { method: 'POST', json: {
        id: crypto.randomUUID(), block_id: block || blocks.data?.[0]?.id, tested_on: day, ece: num(ece), ec_1to5: num(ec15),
        ph: num(ph), lab: lab || null, note: note || null } })
      setMsg({ ok: true, text: 'Saved. The next test date is updated.' })
      setEce(''); setEc15(''); setPh('')
      await qc.invalidateQueries()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Add a soil test" hint="Salt in a block's soil, from the lab or a field meter." onSubmit={submit}>
      <div className="mb-6 grid gap-x-5 gap-y-5 sm:grid-cols-2">
        <Field label="Block">
          <select className={box} value={block} onChange={(e) => setBlock(e.target.value)}>
            {blocks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Test date">
          <input type="date" className={box} value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="ECe" unit="dS/m" hint="Saturated paste, as most labs report it.">
          <input className={`num ${box} pe-14`} inputMode="decimal" value={ece} onChange={(e) => setEce(e.target.value)} placeholder="0.0" />
        </Field>
        <Field label="or EC 1:5" unit="dS/m" hint="Field meter in water; Milh converts it.">
          <input className={`num ${box} pe-14`} inputMode="decimal" value={ec15} onChange={(e) => setEc15(e.target.value)} placeholder="0.0" />
        </Field>
        <Field label="pH">
          <input className={`num ${box}`} inputMode="decimal" value={ph} onChange={(e) => setPh(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Lab">
          <input className={box} value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Optional" />
        </Field>
        <Field className="sm:col-span-2" label="Note or citation">
          <input className={box} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <CardFooter message={msg?.text} ok={msg?.ok}>
        {!ece && !ec15 && <span className="me-auto text-xs text-ink-soft">Enter ECe or EC 1:5 to save.</span>}
        <button className="btn btn-primary" disabled={(!ece && !ec15) || busy}>{busy ? 'Saving…' : 'Save soil test'}</button>
      </CardFooter>
    </Card>
  )
}

function RecentReadings({ farm }: { farm: Farm }) {
  const r = useReadings(farm.id, 'limit=10')
  const sources = useSources(farm.id)
  const tanks = useTanks(farm.id)
  const blocks = useBlocks(farm.id)
  const tz = farm.timezone
  const whereOf = (x: { source_id: string | null; tank_id: string | null; block_id: string | null }) =>
    sources.data?.find((s) => s.id === x.source_id)?.name ?? tanks.data?.find((t) => t.id === x.tank_id)?.name
      ?? blocks.data?.find((b) => b.id === x.block_id)?.name ?? '—'
  return (
    <Card title="Latest readings" hint="Every number on the dashboard comes from these.">
      {!r.data?.length ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-soft">
          No readings yet. Add one above, import a CSV, or connect a sensor.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[36rem] text-sm">
            <thead><tr><th>When</th><th>What</th><th>For</th><th className="text-end">Value</th><th className="text-end">From</th></tr></thead>
            <tbody>
              {r.data.map((x) => (
                <tr key={x.id}>
                  <td className="num whitespace-nowrap text-ink-soft">{dayMonth(x.measured_at, tz)} · {hhmm(x.measured_at, tz)}</td>
                  <td>
                    <div className="font-medium">
                      {METRICS[x.metric as MetricKey]?.short ?? x.metric}
                      {x.flags.includes('jump') && <span className="chip chip-amber ms-2">▲ jump</span>}
                    </div>
                    {x.note && <div className="max-w-[16rem] truncate text-xs text-ink-soft" title={x.note}>{x.note}</div>}
                  </td>
                  <td>{whereOf(x)}</td>
                  <td className="num whitespace-nowrap text-end font-medium">{x.value} <span className="font-normal text-ink-soft">{x.unit}</span></td>
                  <td className="text-end">{originChip(x.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const STATUS: Record<string, [string, string]> = {
  ok: ['OK', 'chip-green'], warn: ['Rising', 'chip-amber'], high: ['Too salty', 'chip-red'], none: ['Not tested', 'chip-neutral'],
}

function RecentSoilTests({ farm }: { farm: Farm }) {
  const tests = useSoilTests(farm.id)
  const blocks = useBlocks(farm.id)
  const bundle = useKioskBundle(farm.id)
  const tz = farm.timezone
  const today = bundle.data?.bundle.day ?? ''
  const next = bundle.data?.bundle.blocks ?? []
  return (
    <Card title="Recent soil tests" hint="The latest results, newest first.">
      {!tests.data?.length ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-soft">No soil tests yet.</p>
      ) : (
        <table className="data-table w-full text-sm">
          <thead><tr><th>Date</th><th>Block</th><th className="text-end">ECe</th><th className="text-end">pH</th><th className="text-end">From</th></tr></thead>
          <tbody>
            {tests.data.slice(0, 8).map((t) => (
              <tr key={t.id}>
                <td className="num whitespace-nowrap text-ink-soft">{dayMonth(t.tested_on, tz)}</td>
                <td className="font-medium">{blocks.data?.find((b) => b.id === t.block_id)?.name ?? '—'}</td>
                <td className="num text-end">{t.ece.toFixed(2)}</td>
                <td className="num text-end">{t.ph ?? <span className="text-ink-soft">—</span>}</td>
                <td className="text-end" title={t.note ?? ''}>{originChip(t.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {next.length > 0 && (
        <div className="mt-6">
          <h4 className="eyebrow mb-2">Next test per block</h4>
          <ul className="grid gap-2">
            {next.map((b) => {
              const [label, cls] = STATUS[b.soil.status] ?? STATUS.none
              const due = b.next_test_due !== null && b.next_test_due <= today
              return (
                <li key={b.id} className="flex items-center gap-3 rounded-xl bg-salt px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                  <span className={`chip ${cls}`}>{label}</span>
                  <span className={`num w-24 text-end ${due ? 'font-semibold text-dune' : 'text-ink-soft'}`}>
                    {b.next_test_due ? (due ? 'due now' : dayMonth(b.next_test_due, tz)) : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}

function AnnouncementForm({ farm }: { farm: Farm }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const a = await api<{ untranslated: string[] }>(`/api/v1/farms/${farm.id}/announcements`, { method: 'POST', json: { text, lang: 'en' } })
      setMsg({ ok: true, text: a.untranslated.length ? `Sent. Not translated into: ${a.untranslated.join(', ')} (no Gemini key).` : 'Sent to the farm tablet in every language.' })
      setText('')
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Announce something now" hint="Played on the farm tablet straight away, translated into the workers' languages." onSubmit={submit}>
      <textarea aria-label="Announcement" className="mb-5 min-h-20 w-full px-3 py-2.5" rows={2} maxLength={500} value={text}
        onChange={(e) => setText(e.target.value)} placeholder="e.g. The fertiliser truck arrives at 10." required />
      <CardFooter message={msg?.text} ok={msg?.ok}>
        <span className="num me-auto text-xs text-ink-soft">{text.length}/500</span>
        <button className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Announce on the farm tablet'}</button>
      </CardFooter>
    </Card>
  )
}
