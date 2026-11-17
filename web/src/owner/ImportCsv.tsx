import { useState } from 'react'
import { api } from '../api/client'
import type { ImportPreview } from '../api/types'
import { Card, CardFooter, Field, FilePicker } from './ui'

type Kind = 'readings' | 'soil_tests'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Upload a CSV, see every problem by row, and import only when the whole file is clean. */
export function ImportCsv({ farmId, onImported }: { farmId: string; onImported?: () => void }) {
  const [kind, setKind] = useState<Kind>('readings')
  const [file, setFile] = useState<File | null>(null)
  const [published, setPublished] = useState(true)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(dryRun: boolean) {
    if (!file) return
    setBusy(true)
    setMessage(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const p = await api<ImportPreview>(
        `/api/v1/farms/${farmId}/imports?kind=${kind}&dry_run=${dryRun}&published=${published}`,
        { method: 'POST', body: form },
      )
      setPreview(p)
      if (!dryRun) {
        setMessage({ ok: true, text: `Imported ${count(p.created, 'row', 'rows')}${p.duplicates ? ` (${p.duplicates} already there)` : ''}.` })
        onImported?.()
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const clean = preview !== null && preview.errors.length === 0 && preview.rows_ok > 0
  return (
    <Card title="Import from a spreadsheet (CSV)"
      hint={<>Start from a template: <a className="font-medium text-palm underline-offset-4 hover:underline" href="/templates/readings_template.csv" download>readings</a>
        {' · '}<a className="font-medium text-palm underline-offset-4 hover:underline" href="/templates/soil_tests_template.csv" download>soil tests</a></>}>
      <div className="mb-6 grid gap-5">
        <Field label="What is in the file">
          <select className="h-10 w-full px-3" value={kind} onChange={(e) => { setKind(e.target.value as Kind); setPreview(null) }}>
            <option value="readings">Readings (water salt, tank, flow…)</option>
            <option value="soil_tests">Soil tests</option>
          </select>
        </Field>
        <FilePicker label="CSV file" accept=".csv,text/csv" file={file} hint="A .csv file saved from Excel or Sheets"
          onFile={(f) => { setFile(f); setPreview(null); setMessage(null) }} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-palm)]" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span><span className="font-medium">Published data</span><span className="block text-xs text-ink-soft">Every row needs a citation in the “note” column.</span></span>
        </label>
        {preview && (
          <div className="rounded-xl bg-salt p-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="chip chip-green">{count(preview.rows_ok, 'row', 'rows')} ready</span>
              <span className={`chip ${preview.errors.length ? 'chip-red' : 'chip-neutral'}`}>{count(preview.errors.length, 'problem', 'problems')}</span>
            </div>
            {preview.errors.length > 0 && (
              <table className="data-table mt-3 w-full text-sm">
                <thead><tr><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
                <tbody>
                  {preview.errors.map((er, i) => (
                    <tr key={i}><td className="num">{er.row}</td><td className="mono text-xs">{er.column}</td><td className="text-brine">{er.message}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      <CardFooter message={message?.text} ok={message?.ok}>
        <button type="button" disabled={!file || busy} onClick={() => send(true)} className="btn btn-secondary">Check file</button>
        <button type="button" disabled={!clean || busy} onClick={() => send(false)} className="btn btn-primary">
          {preview ? `Import ${count(preview.rows_ok, 'row', 'rows')}` : 'Import rows'}
        </button>
      </CardFooter>
    </Card>
  )
}
