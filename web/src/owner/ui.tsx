// Building blocks shared by the owner pages, so every card, field and file picker lines up the same way.
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Upload } from '../components/icons'

/** A card: title, one line on what it is for, an optional action, then content that fills the card's height
 *  (so cards side by side stay even and a footer can sit on the bottom edge). With `onSubmit` it is a form. */
export function Card({ title, hint, action, children, onSubmit, label }: {
  title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode; onSubmit?: (e: FormEvent) => void; label?: string
}) {
  const body = (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          {hint && <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  )
  const cls = 'flex h-full flex-col rounded-3xl bg-panel p-6 ring-1 ring-line'
  return onSubmit
    ? <form onSubmit={onSubmit} aria-label={label ?? title} className={cls}>{body}</form>
    : <section aria-label={label} className={cls}>{body}</section>
}

/** A labelled field with an optional unit inside the box and a one-line hint under it. */
export function Field({ label, hint, unit, children, className = '' }: {
  label: string; hint?: ReactNode; unit?: string; children: ReactNode; className?: string
}) {
  return (
    <label className={`grid content-start gap-1.5 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="relative block">
        {children}
        {unit && <span className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center text-sm text-ink-soft">{unit}</span>}
      </span>
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
    </label>
  )
}

/** The bottom row of a card: the result message on the left, the buttons on the right. */
export function CardFooter({ message, ok = true, children }: { message?: string; ok?: boolean; children: ReactNode }) {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-end gap-3 border-t hairline pt-5">
      {message && <p role="status" className={`me-auto text-sm ${ok ? 'text-palm' : 'text-brine'}`}>{message}</p>}
      {children}
    </footer>
  )
}

/** Choose or drop one file: a real button, the chosen file's name and size, and a drop area. */
export function FilePicker({ label, accept, file, onFile, hint }: {
  label: string; accept: string; file: File | null; onFile: (f: File | null) => void; hint: string
}) {
  const id = useId()
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      className={`flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors duration-150 ${over ? 'border-palm bg-palm/5' : 'border-line bg-salt'}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg bg-panel ring-1 ring-line ${file ? 'text-palm' : 'text-ink-soft'}`}><Upload /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{file ? file.name : 'Drop a file here'}</div>
        <div className="text-xs text-ink-soft">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · ready` : hint}</div>
      </div>
      <input id={id} type="file" accept={accept} aria-label={label} className="peer sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <label htmlFor={id} className="btn btn-secondary cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-palm/40">
        {file ? 'Change file' : 'Choose file'}
      </label>
    </div>
  )
}
