import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SaltClock } from '../api/types'
import { dayMonth } from '../lib/format'

const fullDate = (iso: string, tz: string) => `${dayMonth(iso, tz)} ${iso.slice(0, 4)}`

/** The salt clock for one water source. An old series is shown as dated history, never as today. */
export function SaltClockView({ clock: c, tz, cropName }: { clock: SaltClock; tz: string; cropName: (k: string) => string }) {
  if (c.status === 'collecting') {
    return (
      <div className="rounded-3xl bg-panel p-6 ring-1 ring-line">
        <h3 className="font-display text-2xl font-bold">Collecting readings (<span className="num">{c.n_readings}/4</span>)</h3>
        <p className="mt-1 text-ink-soft">The salt clock needs at least 4 water-salt readings spread over 3 weeks or more ({c.span_days} days so far). Add readings, or import a cited published series.</p>
      </div>
    )
  }
  const asOf = c.as_of ? fullDate(c.as_of, tz) : ''
  const years = c.data_age_days != null ? Math.floor(c.data_age_days / 365) : 0
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {c.stale && (
        <div role="alert" className="rounded-3xl bg-dune/15 p-5 text-dune md:col-span-3">
          <p className="text-lg font-semibold">These readings end on {asOf}: they are {years} years old.</p>
          <p>This chart is the well's history, not today's water. Add a current reading to see where the well is now.</p>
        </div>
      )}
      <Stat label={`Water salt (as of ${asOf})`} value={`${c.current_ecw?.toFixed(2)} dS/m`}
        sub={c.slope_per_year != null ? `${c.slope_per_year >= 0 ? '+' : ''}${c.slope_per_year.toFixed(2)} per year` : ''} />
      <Stat label={`${cropName(c.crop_key)} yield at that salt (estimate)`} value={`${Math.round(c.current_yield_pct ?? 0)}%`}
        sub="FAO-29, ECe ≈ 1.5 × ECw" />
      <Stat label="Loses 10% / 25% of yield" value={c.date_loss_10 ? fullDate(c.date_loss_10, tz) : 'not on this trend'}
        sub={c.date_loss_25 ? `25%: ${fullDate(c.date_loss_25, tz)}` : ''} />
      <div className="rounded-3xl bg-panel p-5 ring-1 ring-line md:col-span-3">
        <h3 className="mb-2 font-semibold">Readings</h3>
        <div className="h-64" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={c.points} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="rgba(29,42,36,.08)" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#6b746f" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#6b746f" }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ borderRadius: 14, border: 'none', boxShadow: '0 12px 30px -12px rgba(92,74,40,.45)', fontFamily: 'Nunito' }} formatter={(v) => [`${v} dS/m`, 'EC']} />
              <Line type="monotone" dataKey="ec" stroke="#2f6b4f" strokeWidth={3} dot={{ r: 5, fill: "#2f6b4f", strokeWidth: 0 }} activeDot={{ r: 7 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 text-xs text-ink-soft">
          {[...new Set(c.points.map((p) => p.note).filter(Boolean))].slice(0, 3).map((n) => <li key={n}>Source: {n}</li>)}
        </ul>
      </div>
      <div className="rounded-3xl bg-panel p-5 ring-1 ring-line md:col-span-3">
        <h3 className="font-semibold">Crops that stay above 90% yield on this water two years after {c.stale ? asOf : 'today'}</h3>
        {c.suggested_crops.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">{c.suggested_crops.map((k) => <li key={k} className="rounded-full bg-palm/10 px-3 py-1 font-semibold text-palm">{cropName(k)}</li>)}</ul>
        ) : <p className="mt-1 text-ink-soft">None in the crop library.</p>}
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl bg-panel p-5 ring-1 ring-line">
      <div className="text-sm text-ink-soft">{label}</div>
      <div className="num mt-1 text-3xl font-black">{value}</div>
      {sub && <div className="text-sm text-ink-soft">{sub}</div>}
    </div>
  )
}
