import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useBlocks, useCrops, useSources, useTanks } from '../api/hooks'
import type { Farm } from '../api/types'
import { pick } from '../i18n'

const input = 'mt-1 w-full rounded-xl border border-line bg-salt px-3 py-2'

export function SetupTab({ farm }: { farm: Farm }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SettingsForm farm={farm} />
      <Devices farm={farm} />
      <Lists farm={farm} />
    </div>
  )
}

function SettingsForm({ farm }: { farm: Farm }) {
  const qc = useQueryClient()
  const s = farm.settings
  const [form, setForm] = useState({ earliest_start: s.earliest_start, briefing_time: s.briefing_time, lr_cap: String(s.lr_cap),
    heat_c: String(s.heat_c), tank_low_pct: String(s.tank_low_pct), flush_extra_mm: String(s.flush_extra_mm) })
  const [msg, setMsg] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api(`/api/v1/farms/${farm.id}`, { method: 'PATCH', json: { settings: {
        earliest_start: form.earliest_start, briefing_time: form.briefing_time, lr_cap: Number(form.lr_cap),
        heat_c: Number(form.heat_c), tank_low_pct: Number(form.tank_low_pct), flush_extra_mm: Number(form.flush_extra_mm) } } })
      setMsg('Saved. Today’s plan will be recomputed.')
      await qc.invalidateQueries({ queryKey: ['farm', farm.id] })
    } catch (err) { setMsg((err as Error).message) }
  }
  const f = (k: keyof typeof form, label: string, type = 'text') => (
    <label className="text-sm">{label}<input type={type} className={`${input} num`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
  )
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-3xl bg-panel p-5 ring-1 ring-line">
      <h3 className="text-lg font-bold">Farm rules</h3>
      <div className="grid grid-cols-2 gap-3">
        {f('earliest_start', 'Workers start (HH:MM)', 'time')}
        {f('briefing_time', 'Morning briefing (HH:MM)', 'time')}
        {f('lr_cap', 'Max extra water for salt (0–0.9)')}
        {f('flush_extra_mm', 'Flush day extra (mm)')}
        {f('heat_c', 'Heat warning at (°C)')}
        {f('tank_low_pct', 'Tank low below (%)')}
      </div>
      {msg && <p className="text-sm font-semibold">{msg}</p>}
      <button className="justify-self-start rounded-xl bg-ink px-4 py-2.5 font-semibold text-salt">Save rules</button>
    </form>
  )
}

function Devices({ farm }: { farm: Farm }) {
  const [kind, setKind] = useState<'kiosk' | 'sensor'>('kiosk')
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState('')
  async function create() {
    try {
      const d = await api<{ api_key: string }>(`/api/v1/farms/${farm.id}/devices`, { method: 'POST', json: { name: kind === 'kiosk' ? 'Farm tablet' : 'Sensor', kind } })
      setKey(d.api_key)
    } catch (err) { setMsg((err as Error).message) }
  }
  return (
    <section className="grid gap-3 rounded-3xl bg-panel p-5 ring-1 ring-line">
      <h3 className="text-lg font-bold">Tablets and sensors</h3>
      <p className="text-sm text-ink-soft">A farm tablet signs in with this key plus a worker's PIN. Sensors send readings with it to <code className="num">POST /api/v1/readings</code> (header <code>X-Api-Key</code>).</p>
      <div className="flex gap-2">
        <select className="rounded-xl border border-line bg-salt px-3 py-2" value={kind} onChange={(e) => setKind(e.target.value as 'kiosk' | 'sensor')}>
          <option value="kiosk">Farm tablet</option><option value="sensor">Sensor</option>
        </select>
        <button onClick={create} className="rounded-xl bg-ink px-4 py-2 font-semibold text-salt">Create key</button>
      </div>
      {key && <p className="rounded-xl bg-dune/10 p-3 text-sm">Copy this key now; it is shown only once:<br /><code className="num break-all text-base">{key}</code></p>}
      {msg && <p className="text-brine">{msg}</p>}
    </section>
  )
}

function Lists({ farm }: { farm: Farm }) {
  const sources = useSources(farm.id)
  const blocks = useBlocks(farm.id)
  const tanks = useTanks(farm.id)
  const crops = useCrops()
  return (
    <section className="grid gap-4 rounded-3xl bg-panel p-5 ring-1 ring-line lg:col-span-2">
      <div>
        <h3 className="text-lg font-bold">Water sources</h3>
        <table className="mt-1 w-full text-sm"><tbody>
          {sources.data?.map((s) => (
            <tr key={s.id} className="border-t border-line"><td className="py-1.5"><span className="me-2 inline-block size-3 rounded-full" style={{ background: s.tap_color }} />{s.name}</td>
              <td>{pick(s.tap_label, 'en')}</td><td className="num">{s.cost_per_m3} AED/m³</td>
              <td className="text-ink-soft">{s.declared_ec != null ? `declared EC ${s.declared_ec}` : 'no declared EC'}</td></tr>
          ))}
        </tbody></table>
      </div>
      <div>
        <h3 className="text-lg font-bold">Blocks</h3>
        <table className="mt-1 w-full text-sm"><tbody>
          {blocks.data?.map((b) => (
            <tr key={b.id} className="border-t border-line"><td className="py-1.5 font-semibold">{b.name}</td>
              <td>{pick(crops.data?.find((c) => c.key === b.crop_key)?.names, 'en') || b.crop_key}</td>
              <td className="num">{b.area_m2} m²</td><td className="num">{b.flow_l_per_h} L/h</td>
              <td className="num">usual {b.habit_minutes} min</td><td className="text-ink-soft">planted {b.planting_date}</td></tr>
          ))}
        </tbody></table>
      </div>
      <div>
        <h3 className="text-lg font-bold">Tanks</h3>
        <ul className="text-sm">{tanks.data?.map((t) => <li key={t.id}>{t.name} · <span className="num">{t.capacity_l} L</span></li>)}</ul>
      </div>
      <p className="text-xs text-ink-soft">Crop values: {crops.data?.[0]?.citation}</p>
    </section>
  )
}
