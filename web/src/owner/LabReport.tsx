import { useState } from 'react'
import { api } from '../api/client'
import type { Block } from '../api/types'

interface Sample { label: string; ece: number | null; ec_1to5: number | null; ph: number | null; moisture_vwc: number | null }
interface Extract { tested_on: string | null; lab: string | null; samples: Sample[]; water: { label: string; ec: number | null }[] }
interface Row { label: string; block: string; ece: string; ec_1to5: string; ph: string }

const cell = 'w-full rounded-lg border border-line bg-salt px-2 py-1'

/** Photo or PDF of a lab report -> Gemini proposes the numbers -> the owner checks and saves them. */
export function LabReport({ farmId, blocks, onSaved }: { farmId: string; blocks: Block[]; onSaved?: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [path, setPath] = useState('')
  const [date, setDate] = useState('')
  const [lab, setLab] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function read() {
    if (!file) return
    setBusy(true)
    setMsg('')
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await api<{ attachment_path: string; extract: Extract }>(`/api/v1/farms/${farmId}/lab-report`, { method: 'POST', body: form })
      setPath(r.attachment_path)
      setDate(r.extract.tested_on ?? '')
      setLab(r.extract.lab ?? '')
      const s = (v: number | null) => (v === null ? '' : String(v))
      setRows(r.extract.samples.map((x) => ({ label: x.label, block: blocks[0]?.id ?? '', ece: s(x.ece), ec_1to5: s(x.ec_1to5), ph: s(x.ph) })))
      if (!r.extract.samples.length) setMsg('No soil samples found on this report.')
    } catch (err) {
      setMsg((err as Error).message)
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
      setMsg(`Saved ${rows.length} soil test${rows.length === 1 ? '' : 's'}.`)
      setRows([])
      onSaved?.()
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <section className="grid gap-3 rounded-3xl bg-panel p-5 ring-1 ring-line lg:col-span-2">
      <h3 className="text-lg font-bold">Read a lab report (Gemini)</h3>
      <p className="text-sm text-ink-soft">Gemini only reads the numbers off the page. Check every value before saving; nothing is stored until you do.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Lab report photo or PDF
          <input className="mt-1 block" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="button" disabled={!file || busy} onClick={read} className="rounded-xl bg-ink px-4 py-2 font-semibold text-salt disabled:opacity-40">Read report</button>
      </div>
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:w-1/2">
            <label className="text-sm">Test date<input type="date" className={cell} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="text-sm">Lab<input className={cell} value={lab} onChange={(e) => setLab(e.target.value)} /></label>
          </div>
          <table className="text-sm">
            <thead><tr className="text-ink-soft"><th className="text-start font-normal">Sample</th><th className="text-start font-normal">Block</th><th className="font-normal">ECe</th><th className="font-normal">EC 1:5</th><th className="font-normal">pH</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}>
                <td className="pe-2">{r.label}</td>
                <td className="pe-2"><select aria-label={`Block for ${r.label}`} className={cell} value={r.block} onChange={(e) => set(i, 'block', e.target.value)}>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
                <td className="pe-2"><input className={`${cell} num`} value={r.ece} onChange={(e) => set(i, 'ece', e.target.value)} /></td>
                <td className="pe-2"><input className={`${cell} num`} value={r.ec_1to5} onChange={(e) => set(i, 'ec_1to5', e.target.value)} /></td>
                <td><input className={`${cell} num`} value={r.ph} onChange={(e) => set(i, 'ph', e.target.value)} /></td>
              </tr>
            ))}</tbody>
          </table>
          <button type="button" disabled={busy || !date} onClick={save} className="justify-self-start rounded-xl bg-palm px-4 py-2 font-semibold text-white disabled:opacity-40">Save confirmed values</button>
        </>
      )}
      {msg && <p className="text-sm font-semibold">{msg}</p>}
    </section>
  )
}
