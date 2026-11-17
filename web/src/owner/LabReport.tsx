import { useState } from 'react'
import { api } from '../api/client'
import type { Block } from '../api/types'
import { Card, CardFooter, Field, FilePicker } from './ui'

interface Sample { label: string; ece: number | null; ec_1to5: number | null; ph: number | null; moisture_vwc: number | null }
interface Extract { tested_on: string | null; lab: string | null; samples: Sample[]; water: { label: string; ec: number | null }[] }
interface Row { label: string; block: string; ece: string; ec_1to5: string; ph: string }

const cell = 'num h-9 w-full px-2'

/** Photo or PDF of a lab report -> Gemini proposes the numbers -> the owner checks and saves them. */
export function LabReport({ farmId, blocks, onSaved }: { farmId: string; blocks: Block[]; onSaved?: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [path, setPath] = useState('')
  const [date, setDate] = useState('')
  const [lab, setLab] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function read() {
    if (!file) return
    setBusy(true)
    setMsg(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await api<{ attachment_path: string; extract: Extract }>(`/api/v1/farms/${farmId}/lab-report`, { method: 'POST', body: form })
      setPath(r.attachment_path)
      setDate(r.extract.tested_on ?? '')
      setLab(r.extract.lab ?? '')
      const s = (v: number | null) => (v === null ? '' : String(v))
      setRows(r.extract.samples.map((x) => ({ label: x.label, block: blocks[0]?.id ?? '', ece: s(x.ece), ec_1to5: s(x.ec_1to5), ph: s(x.ph) })))
      if (!r.extract.samples.length) setMsg({ ok: false, text: 'No soil samples found on this report.' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    try {
      for (const r of rows) {
        await api(`/api/v1/farms/${farmId}/soil-tests?via=lab_report`, { method: 'POST', json: {
          id: crypto.randomUUID(), block_id: r.block, tested_on: date, ece: num(r.ece), ec_1to5: num(r.ec_1to5),
          ph: num(r.ph), lab: lab || null, attachment_path: path, note: `Read from lab report by Gemini; checked by owner` } })
      }
      setMsg({ ok: true, text: `Saved ${rows.length} soil test${rows.length === 1 ? '' : 's'}.` })
      setRows([])
      setFile(null)
      onSaved?.()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <Card title="Read a lab report" hint="Gemini reads the numbers off the page. Check every value; nothing is stored until you save.">
      <div className="mb-6 grid gap-5">
        <FilePicker label="Lab report photo or PDF" accept="image/png,image/jpeg,image/webp,application/pdf" file={file}
          hint="A photo or PDF of the lab's report" onFile={(f) => { setFile(f); setRows([]); setMsg(null) }} />
        {rows.length === 0 && (
          <ol className="grid gap-2.5 text-sm text-ink-soft">
            {['Choose a photo or PDF of the lab report.', 'Gemini reads the dates, ECe, EC 1:5 and pH off the page.', 'You check each value, pick the block, and save.'].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-salt text-[0.6875rem] font-semibold text-ink ring-1 ring-line">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        )}
        {rows.length > 0 && (
          <div className="fade-in grid gap-4 rounded-xl bg-salt p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Test date"><input type="date" className="h-9 w-full px-2" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Lab"><input className="h-9 w-full px-2" value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Optional" /></Field>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table w-full min-w-[28rem] text-sm">
                <thead><tr><th>Sample</th><th>Block</th><th className="text-end">ECe</th><th className="text-end">EC 1:5</th><th className="text-end">pH</th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-medium">{r.label}</td>
                    <td><select aria-label={`Block for ${r.label}`} className="h-9 w-full px-2" value={r.block} onChange={(e) => set(i, 'block', e.target.value)}>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
                    <td><input aria-label={`ECe for ${r.label}`} className={`${cell} text-end`} value={r.ece} onChange={(e) => set(i, 'ece', e.target.value)} /></td>
                    <td><input aria-label={`EC 1:5 for ${r.label}`} className={`${cell} text-end`} value={r.ec_1to5} onChange={(e) => set(i, 'ec_1to5', e.target.value)} /></td>
                    <td><input aria-label={`pH for ${r.label}`} className={`${cell} text-end`} value={r.ph} onChange={(e) => set(i, 'ph', e.target.value)} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <CardFooter message={msg?.text} ok={msg?.ok}>
        {rows.length > 0
          ? <button type="button" disabled={busy || !date} onClick={save} className="btn btn-primary">Save confirmed values</button>
          : <button type="button" disabled={!file || busy} onClick={read} className="btn btn-primary">{busy ? 'Reading…' : 'Read report'}</button>}
      </CardFooter>
    </Card>
  )
}
