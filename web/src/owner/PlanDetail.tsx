import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { Plan, Source } from '../api/types'
import { Rain, Warn } from '../components/icons'
import { pick } from '../i18n'
import { hhmm, litres } from '../lib/format'
import { CropArt } from '../kiosk/art/CropArt'
import { Ledger } from './Ledger'

/** One block's decision: how long, from which taps, the water against the usual routine, and every input
 *  that went into it (with the fallbacks used). */
export function PlanDetail({ plan, sources, tz }: { plan: Plan; sources: Source[]; tz: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en'
  const byId = new Map(sources.map((s) => [s.id, s]))
  const e = plan.explanation as Record<string, number | string | null | undefined>
  const steps = plan.steps.map((s) => ({
    source_id: s.source_id, minutes: s.minutes,
    tap_label: byId.get(s.source_id)?.tap_label ?? { en: s.source_id },
    tap_color: byId.get(s.source_id)?.tap_color ?? '#64748b',
  }))
  const codes = [...new Set(plan.fallbacks.map((c) => c.split(':')[0]))]
  const less = plan.habit_l ? Math.round((plan.saved_l / plan.habit_l) * 100) : 0
  const rows: [string, string][] = [
    ['ET₀ (Open-Meteo)', e.et0 != null ? `${e.et0} mm` : '—'],
    ['Crop stage · Kc', e.stage != null ? `${e.stage} · ${e.kc}` : '—'],
    ['Crop water need', e.etc != null ? `${e.etc} mm` : '—'],
    ['Water salt (mix)', plan.ecw != null ? `${plan.ecw.toFixed(2)} dS/m` : '—'],
    ['Extra to flush salt', plan.lr != null ? `${Math.round(plan.lr * 100)}%` : '—'],
    ['…using cheapest water only', e.lr_cheapest_alone != null ? `${Math.round(Number(e.lr_cheapest_alone) * 100)}%` : '—'],
  ]
  return (
    <article className="k-card grid gap-6 p-6 md:grid-cols-[auto_minmax(0,1fr)] md:p-7">
      <div className="hidden size-28 place-items-center rounded-[1.4rem] bg-[var(--k-sand-soft)] md:grid">
        <CropArt crop={plan.crop_key} className="size-24" />
      </div>
      <div className="min-w-0">
        <header className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="text-3xl font-black">{plan.block_name}</h3>
            <div className="num mt-0.5 text-[var(--k-muted)]">
              {plan.start_at ? `${hhmm(plan.start_at, tz)} – ${hhmm(plan.end_at, tz)}` : plan.skip_reason ?? '—'}
            </div>
          </div>
          <div className="ms-auto flex items-baseline gap-1.5">
            <span className="num text-5xl font-black leading-none">{plan.minutes}</span>
            <span className="text-lg font-bold text-[var(--k-muted)]">min</span>
          </div>
        </header>

        {plan.skip_reason ? (
          <p className="mt-4 flex items-center gap-2 text-lg font-bold text-water">
            {plan.skip_reason === 'rain' && <Rain />}
            {plan.skip_reason === 'rain' ? 'No watering today: rain' : 'No watering needed today'}
          </p>
        ) : steps.length > 0 && (
          <div className="mt-4 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(steps.length, 3)}, minmax(0, 1fr))` }}>
            {steps.map((s, i) => (
              <div key={`${s.source_id}-${i}`} className="flex items-center justify-center gap-2 rounded-2xl px-3 py-3 font-extrabold"
                style={{ background: `color-mix(in srgb, ${s.tap_color} 15%, white)` }}>
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.tap_color }} />
                <span className="truncate">{pick(s.tap_label, lang)}</span>
                <span aria-hidden>·</span>
                <span className="num">{s.minutes} min</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 max-w-prose text-[1.05rem] leading-relaxed">{pick(plan.text, lang)}</p>
        {(codes.length > 0 || plan.cap_exceeded) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {codes.map((c) => (
              <span key={c} className="flex items-center gap-1.5 rounded-full bg-dune/12 px-3 py-1 text-sm font-bold text-dune">
                <Warn /> {t(`fallback.${c}`, { defaultValue: c })}
              </span>
            ))}
            {plan.cap_exceeded && (
              <span className="rounded-full bg-brine/10 px-3 py-1 text-sm font-bold text-brine">
                No water mix keeps salt under this crop's limit. Consider a more salt-tolerant crop (see Salt clock).
              </span>
            )}
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between text-sm font-semibold text-[var(--k-muted)]">
            <span>Water against the usual routine</span>
            {less > 0 && <span className="num font-extrabold text-[var(--k-green)]">{less}% less</span>}
          </div>
          <Ledger usual={plan.habit_l} planned={plan.gross_l} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-[var(--k-sand-soft)] p-4">
            <h4 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-[var(--k-muted)]">How Milh decided</h4>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
              {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-[var(--k-muted)]">{k}</dt><dd className="num text-end font-bold">{v}</dd></Fragment>))}
            </dl>
          </div>
          <div className="rounded-2xl bg-[var(--k-green-soft)]/60 p-4">
            <h4 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-[var(--k-muted)]">Usual routine vs Milh</h4>
            <table className="w-full text-sm">
              <thead><tr className="text-[var(--k-muted)]"><th className="text-start font-normal" /><th className="text-end font-normal">Usual routine</th><th className="text-end font-normal">Milh</th></tr></thead>
              <tbody className="num">
                <tr><td className="py-0.5 text-[var(--k-muted)]">Water</td><td className="text-end">{litres(plan.habit_l)}</td><td className="text-end font-extrabold">{litres(plan.gross_l)}</td></tr>
                <tr><td className="py-0.5 text-[var(--k-muted)]">Yield (estimate)</td>
                  <td className="text-end">{plan.habit_yield_pct != null ? `${Math.round(plan.habit_yield_pct)}%` : '—'}</td>
                  <td className="text-end font-extrabold">{plan.plan_yield_pct != null ? `${Math.round(plan.plan_yield_pct)}%` : '—'}</td></tr>
                <tr><td className="py-0.5 text-[var(--k-muted)]">Cost vs usual</td><td />
                  <td className={`text-end font-extrabold ${plan.saved_aed >= 0 ? 'text-[var(--k-green)]' : 'text-dune'}`}>{plan.saved_aed >= 0 ? '−' : '+'}{Math.abs(plan.saved_aed).toFixed(2)} AED</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--k-muted)]">Yield is an estimate from FAO-29 (ECe ≈ 1.5 × ECw, Maas–Hoffman). Water saved: <span className="num">{litres(plan.saved_l)}</span>.</p>
      </div>
    </article>
  )
}
