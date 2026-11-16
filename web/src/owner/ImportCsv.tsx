import { useState } from 'react'
import { api } from '../api/client'
import type { ImportPreview } from '../api/types'

type Kind = 'readings' | 'soil_tests'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Upload a CSV, see every problem by row, and import only when the whole file is clean. */
export function ImportCsv({ farmId, onImported }: { farmId: string; onImported?: () => void }) {
  const [kind, setKind] = useState<Kind>('readings')
  const [file, setFile] = useState<File | null>(null)
  const [published, setPublished] = useState(true)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(dryRun: boolean) {
    if (!file) return
    setBusy(true)
    setMessage('')
    const form = new FormData()
    form.append('file', file)
    try {
      const p = await api<ImportPreview>(
        `/api/v1/farms/${farmId}/imports?kind=${kind}&dry_run=${dryRun}&published=${published}`,
        { method: 'POST', body: form },
      )
      setPreview(p)
      if (!dryRun) {
        setMessage(`Imported ${count(p.created, 'row', 'rows')}${p.duplicates ? ` (${p.duplicates} already there)` : ''}.`)
        onImported?.()
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const clean = preview !== null && preview.errors.length === 0 && preview.rows_ok > 0
  return (
    <section className="rounded-3xl bg-panel p-5 ring-1 ring-line">
      <h3 className="text-lg font-bold">Import from a spreadsheet (CSV)</h3>
      <p className="text-sm text-ink-soft">
        Download a template:{' '}
        <a className="underline" href="/templates/readings_template.csv" download>readings</a> ·{' '}
        <a className="underline" href="/templates/soil_tests_template.csv" download>soil tests</a>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">What is in the file
          <select className="mt-1 block rounded-xl border border-line bg-salt px-3 py-2" value={kind}
            onChange={(e) => { setKind(e.target.value as Kind); setPreview(null) }}>
            <option value="readings">Readings (water salt, tank, flow…)</option>
            <option value="soil_tests">Soil tests</option>
          </select>
        </label>
        <label className="text-sm">CSV file
          <input className="mt-1 block" type="file" accept=".csv,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null) }} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Published data (every row needs a citation in “note”)
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={!file || busy} onClick={() => send(true)}
          className="rounded-xl bg-salt px-4 py-2 font-semibold ring-1 ring-line disabled:opacity-40">Check file</button>
        <button type="button" disabled={!clean || busy} onClick={() => send(false)}
          className="rounded-xl bg-ink px-4 py-2 font-semibold text-salt disabled:opacity-40">
          {preview ? `Import ${count(preview.rows_ok, 'row', 'rows')}` : 'Import rows'}
        </button>
      </div>
      {preview && (
        <div className="mt-3 text-sm">
          <p><span className="num">{preview.rows_ok}</span> {preview.rows_ok === 1 ? 'row' : 'rows'} ready · <span className="num">{preview.errors.length}</span> {preview.errors.length === 1 ? 'problem' : 'problems'}</p>
          {preview.errors.length > 0 && (
            <table className="mt-2 w-full">
              <thead><tr className="text-start text-ink-soft"><th className="text-start">Row</th><th className="text-start">Column</th><th className="text-start">Problem</th></tr></thead>
              <tbody>
                {preview.errors.map((er, i) => (
                  <tr key={i} className="border-t border-line"><td className="num py-1">{er.row}</td><td>{er.column}</td><td className="text-brine">{er.message}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {message && <p className="mt-2 text-sm font-semibold">{message}</p>}
    </section>
  )
}
