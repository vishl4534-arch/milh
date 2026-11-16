import { litres } from '../lib/format'

/** The farm's water today as one bar: usual routine in sand, Milh's plan in green over it. */
export function Ledger({ usual, planned, className = '', big = false }: { usual: number; planned: number; className?: string; big?: boolean }) {
  const max = Math.max(usual, planned, 1)
  return (
    <div className={className} role="img" aria-label={`Milh ${litres(planned)} against usual ${litres(usual)}`}>
      <div className={`relative overflow-hidden rounded-full bg-[var(--k-sand)] ${big ? 'h-6' : 'h-3.5'}`}>
        <div className="grow-x absolute inset-y-0 start-0 rounded-full bg-[var(--k-green)]" style={{ width: `${(planned / max) * 100}%` }} />
      </div>
      {big && (
        <div className="mt-2 flex justify-between text-sm font-semibold text-[var(--k-muted)]">
          <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-[var(--k-green)]" />Milh plan</span>
          <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-[var(--k-sand)] ring-1 ring-black/10" />Usual routine</span>
        </div>
      )}
    </div>
  )
}

