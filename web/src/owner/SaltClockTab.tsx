import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCrops, useSaltClock, useSources } from '../api/hooks'
import type { Farm } from '../api/types'
import { pick } from '../i18n'
import { dayMonth } from '../lib/format'

export function SaltClockTab({ farm }: { farm: Farm }) {
  const sources = useSources(farm.id)
  const crops = useCrops()
  const [sourceId, setSourceId] = useState<string>()
  const sid = sourceId ?? sources.data?.find((s) => s.kind === 'well')?.id ?? sources.data?.[0]?.id
  const clock = useSaltClock(farm.id, sid)
  const c = clock.data
  const cropName = (k: string) => pick(crops.data?.find((x) => x.key === k)?.names, 'en') || k
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <label className="text-sm">Water source
          <select className="ms-2 rounded-xl border border-line bg-panel px-3 py-2" value={sid} onChange={(e) => setSourceId(e.target.value)}>
            {sources.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {c && c.status === 'collecting' && (
        <div className="rounded-3xl bg-panel p-6 ring-1 ring-line">
          <h3 className="font-display text-2xl font-bold">Collecting readings (<span className="num">{c.n_readings}/4</span>)</h3>
          <p className="mt-1 text-ink-soft">The salt clock needs at least 4 water-salt readings spread over 3 weeks or more ({c.span_days} days so far). Add readings, or import a cited published series.</p>
        </div>
      )}
      {c && c.status === 'ok' && (
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Water salt today (trend)" value={`${c.current_ecw?.toFixed(2)} dS/m`} sub={c.slope_per_year != null ? `${c.slope_per_year >= 0 ? '+' : ''}${c.slope_per_year.toFixed(2)} per year` : ''} />
          <Stat label={`${cropName(c.crop_key)} yield now (estimate)`} value={`${Math.round(c.current_yield_pct ?? 0)}%`} sub="FAO-29, ECe ≈ 1.5 × ECw" />
          <Stat label="Loses 10% / 25% of yield" value={c.date_loss_10 ? dayMonth(c.date_loss_10, farm.timezone) + ` ${c.date_loss_10.slice(0, 4)}` : 'not on this trend'}
            sub={c.date_loss_25 ? `25%: ${dayMonth(c.date_loss_25, farm.timezone)} ${c.date_loss_25.slice(0, 4)}` : ''} />
          <div className="rounded-3xl bg-panel p-5 ring-1 ring-line md:col-span-3">
            <h3 className="mb-2 font-semibold">Readings</h3>
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={c.points} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#d9ded9" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit="" domain={['auto', 'auto']} />
                  <Tooltip formatter={(v) => [`${v} dS/m`, 'EC']} />
                  <Line type="monotone" dataKey="ec" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 text-xs text-ink-soft">
              {[...new Set(c.points.map((p) => p.note).filter(Boolean))].map((n) => <li key={n}>Source: {n}</li>)}
            </ul>
          </div>
          <div className="rounded-3xl bg-panel p-5 ring-1 ring-line md:col-span-3">
            <h3 className="font-semibold">Crops that stay above 90% yield on this water in two years</h3>
            {c.suggested_crops.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">{c.suggested_crops.map((k) => <li key={k} className="rounded-full bg-palm/10 px-3 py-1 font-semibold text-palm">{cropName(k)}</li>)}</ul>
            ) : <p className="mt-1 text-ink-soft">None in the crop library.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl bg-panel p-5 ring-1 ring-line">
      <div className="text-sm text-ink-soft">{label}</div>
      <div className="num mt-1 text-3xl font-bold">{value}</div>
      {sub && <div className="text-sm text-ink-soft">{sub}</div>}
    </div>
  )
}
