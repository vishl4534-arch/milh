import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { Plan, Source } from '../api/types'
import { Warn } from '../components/icons'
import { pick } from '../i18n'
import { hhmm, litres } from '../lib/format'
import { PipeBar } from '../kiosk/PipeBar'

/** One block's decision with every input, the fallbacks used, and the comparison with habit. */
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
  const rows: [string, string][] = [
    ['ET₀ (Open-Meteo)', e.et0 != null ? `${e.et0} mm` : '—'],
    ['Crop stage · Kc', e.stage != null ? `${e.stage} · ${e.kc}` : '—'],
    ['Crop water need', e.etc != null ? `${e.etc} mm` : '—'],
    ['Water salt (mix)', plan.ecw != null ? `${plan.ecw.toFixed(2)} dS/m` : '—'],
    ['Extra to flush salt', plan.lr != null ? `${Math.round(plan.lr * 100)}%` : '—'],
    ['…using cheapest water only', e.lr_cheapest_alone != null ? `${Math.round(Number(e.lr_cheapest_alone) * 100)}%` : '—'],
  ]
  return (
    <article className="rounded-3xl bg-panel p-5 ring-1 ring-line">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-2xl font-bold">{plan.block_name}</h3>
        <div className="num text-ink-soft">{plan.start_at ? `${hhmm(plan.start_at, tz)}–${hhmm(plan.end_at, tz)}` : plan.skip_reason ?? '—'}</div>
      </header>
      <div className="mt-3 flex items-center gap-4">
        <div className="num text-6xl font-bold leading-none">{plan.minutes}<span className="ms-1 text-xl font-normal text-ink-soft">min</span></div>
        <div className="flex-1">{steps.length > 0 && <PipeBar steps={steps} lang={lang} />}</div>
      </div>
      <p className="mt-3 text-lg">{pick(plan.text, lang)}</p>
      {codes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {codes.map((c) => (
            <span key={c} className="flex items-center gap-1.5 rounded-full bg-dune/15 px-3 py-1 text-sm text-dune">
              <Warn /> {t(`fallback.${c}`, { defaultValue: c })}
            </span>
          ))}
        </div>
      )}
      {plan.cap_exceeded && (
        <p className="mt-3 rounded-xl bg-brine/10 px-3 py-2 font-semibold text-brine">
          No water mix keeps salt under this crop's limit. Consider a more salt-tolerant crop (see Salt clock).
        </p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-ink-soft">{k}</dt><dd className="num text-end">{v}</dd></Fragment>))}
        </dl>
        <table className="w-full text-sm">
          <thead><tr className="text-ink-soft"><th className="text-start font-normal" /><th className="text-end font-normal">Usual routine</th><th className="text-end font-normal">Milh</th></tr></thead>
          <tbody className="num">
            <tr><td className="text-ink-soft">Water</td><td className="text-end">{litres(plan.habit_l)}</td><td className="text-end font-semibold">{litres(plan.gross_l)}</td></tr>
            <tr><td className="text-ink-soft">Yield (estimate)</td>
              <td className="text-end">{plan.habit_yield_pct != null ? `${Math.round(plan.habit_yield_pct)}%` : '—'}</td>
              <td className="text-end font-semibold">{plan.plan_yield_pct != null ? `${Math.round(plan.plan_yield_pct)}%` : '—'}</td></tr>
            <tr><td className="text-ink-soft">Cost vs usual</td><td /><td className={`text-end font-semibold ${plan.saved_aed >= 0 ? 'text-palm' : 'text-dune'}`}>{plan.saved_aed >= 0 ? '−' : '+'}{Math.abs(plan.saved_aed).toFixed(2)} AED</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-soft">Yield is an estimate from FAO-29 (ECe ≈ 1.5 × ECw, Maas–Hoffman). Water saved: <span className="num">{litres(plan.saved_l)}</span>.</p>
    </article>
  )
}
