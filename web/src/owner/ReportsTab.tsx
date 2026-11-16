import { useState } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GRID, TICK, TOOLTIP } from './chartStyle'
import { getToken } from '../api/client'
import { useReport } from '../api/hooks'
import type { Farm } from '../api/types'
import { litres } from '../lib/format'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function ReportsTab({ farm }: { farm: Farm }) {
  const [end, setEnd] = useState(() => iso(new Date()))
  const [start, setStart] = useState(() => iso(new Date(Date.now() - 29 * 86_400_000)))
  const rep = useReport(farm.id, start, end)
  const t = rep.data?.totals

  async function downloadCsv() {
    const res = await fetch(`/api/v1/farms/${farm.id}/reports/water.csv?start=${start}&end=${end}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    })
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: `water_${start}_${end}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">From<input type="date" className="ms-2 rounded-xl border border-line bg-salt px-3 py-2" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="text-sm">To<input type="date" className="ms-2 rounded-xl border border-line bg-salt px-3 py-2" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <button onClick={downloadCsv} className="press glass-chip rounded-full px-4 py-2 font-semibold">Download CSV</button>
      </div>
      {t && (
        <div className="grid gap-3 md:grid-cols-4">
          {[['Usual routine', litres(t.habit_l)], ['Milh plan', litres(t.planned_l)], ['Confirmed done', t.actual_l == null ? '—' : litres(t.actual_l)],
            ['Water saved', litres(t.saved_l)]].map(([k, v]) => (
            <div key={k} className="glass card-in rounded-[1.75rem] p-5"><div className="text-sm text-ink-soft">{k}</div><div className="num mt-1 text-3xl">{v}</div></div>
          ))}
        </div>
      )}
      {rep.data && rep.data.days.length === 0 && <p className="glass rounded-[1.5rem] p-5">No plans in this period yet.</p>}
      {rep.data && rep.data.days.length > 0 && (
        <div className="glass card-in rounded-[1.75rem] p-5" style={{ animationDelay: '120ms' }}>
          <div className="mb-1 text-sm text-ink-soft">Water</div>
          <h3 className="mb-3 text-2xl font-semibold">Overview</h3>
          <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rep.data.days} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="planFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3f9d5c" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#3f9d5c" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} width={56} />
              <Tooltip {...TOOLTIP} />
              <Legend wrapperStyle={{ color: '#aca69c', fontSize: 13 }} />
              {rep.data.days.length < 3 ? [
                // A line needs a few days to mean anything; until then, bars in the same colours.
                <Bar key="h" dataKey="habit_l" name="Usual routine (L)" fill="#e9d55a" radius={[8, 8, 0, 0]} maxBarSize={56} animationDuration={900} />,
                <Bar key="p" dataKey="planned_l" name="Milh plan (L)" fill="#5fbf7f" radius={[8, 8, 0, 0]} maxBarSize={56} animationDuration={900} />,
                <Bar key="a" dataKey="actual_l" name="Confirmed (L)" fill="#49a7e6" radius={[8, 8, 0, 0]} maxBarSize={56} animationDuration={900} />,
              ] : [
                <Area key="p" type="monotone" dataKey="planned_l" name="Milh plan (L)" stroke="#5fbf7f" strokeWidth={2.5} fill="url(#planFill)" animationDuration={900} />,
                <Line key="h" type="monotone" dataKey="habit_l" name="Usual routine (L)" stroke="#e9d55a" strokeWidth={2} strokeDasharray="6 5" dot={false} animationDuration={900} />,
                <Line key="a" type="monotone" dataKey="actual_l" name="Confirmed (L)" stroke="#49a7e6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls animationDuration={900} />,
              ]}
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
