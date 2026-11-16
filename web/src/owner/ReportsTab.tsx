import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
        <label className="text-sm">From<input type="date" className="ms-2 rounded-xl border border-line bg-panel px-3 py-2" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="text-sm">To<input type="date" className="ms-2 rounded-xl border border-line bg-panel px-3 py-2" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <button onClick={downloadCsv} className="rounded-xl px-3 py-2 ring-1 ring-line">Download CSV</button>
      </div>
      {t && (
        <div className="grid gap-3 md:grid-cols-4">
          {[['Usual routine', litres(t.habit_l)], ['Milh plan', litres(t.planned_l)], ['Confirmed done', t.actual_l == null ? '—' : litres(t.actual_l)],
            ['Water saved', litres(t.saved_l)]].map(([k, v]) => (
            <div key={k} className="rounded-3xl bg-panel p-5 ring-1 ring-line"><div className="text-sm text-ink-soft">{k}</div><div className="num text-3xl font-bold">{v}</div></div>
          ))}
        </div>
      )}
      {rep.data && rep.data.days.length === 0 && <p className="rounded-2xl bg-panel p-5 ring-1 ring-line">No plans in this period yet.</p>}
      {rep.data && rep.data.days.length > 0 && (
        <div className="h-72 rounded-3xl bg-panel p-4 ring-1 ring-line" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rep.data.days}>
              <CartesianGrid stroke="#d9ded9" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="habit_l" name="Usual routine (L)" fill="#b8c2bd" />
              <Bar dataKey="planned_l" name="Milh plan (L)" fill="#2f6b4f" />
              <Bar dataKey="actual_l" name="Confirmed (L)" fill="#1d4ed8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
