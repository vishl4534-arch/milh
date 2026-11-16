import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { Plan, Source } from '../api/types'
import { Rain, Warn } from '../components/icons'
import { pick } from '../i18n'
import { hhmm, litres } from '../lib/format'

/** One block's decision: how long, from which taps, every input that went into it, and the comparison with
 *  the usual routine (water, well water, root-zone salt, yield, cost). */
export function PlanDetail({ plan, sources, tz }: { plan: Plan; sources: Source[]; tz: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en'
  const byId = new Map(sources.map((s) => [s.id, s]))
  const e = plan.explanation as Record<string, number | string | boolean | null | undefined>
  const steps = plan.steps.map((s) => ({
    ...s,
    label: pick(byId.get(s.source_id)?.tap_label ?? { en: s.source_id }, lang),
    color: byId.get(s.source_id)?.tap_color ?? '#64748b',
  }))
  const total = steps.reduce((a, s) => a + s.minutes, 0) || 1
  const codes = [...new Set(plan.fallbacks.map((c) => c.split(':')[0]))]
  const inputs: [string, string][] = [
    ['Reference ET₀ (Open-Meteo)', e.et0 != null ? `${e.et0} mm` : '—'],
    ['Crop stage · Kc', e.stage != null ? `${e.stage} · ${e.kc}` : '—'],
    ['Crop water need', e.etc != null ? `${e.etc} mm` : '—'],
    ['Water salt, blended', plan.ecw != null ? `${plan.ecw.toFixed(2)} dS/m` : '—'],
    ['Leaching extra', plan.lr != null ? `${Math.round(plan.lr * 100)}%` : '—'],
    ['…with cheapest water only', e.lr_cheapest_alone != null ? `${Math.round(Number(e.lr_cheapest_alone) * 100)}%` : '—'],
  ]
  const yieldCell = (v: number | null) => (v != null ? `${Math.round(v)}%` : '—')
  const compare: [string, string, string, boolean?][] = [
    ['Water', litres(plan.habit_l), litres(plan.gross_l)],
    ...(plan.habit_well_l != null && plan.plan_well_l != null ? [['From the well', litres(plan.habit_well_l), litres(plan.plan_well_l), true] as [string, string, string, boolean]] : []),
    ...(e.habit_ece != null && e.plan_ece != null ? [['Root-zone salt (ECe)', `${Number(e.habit_ece).toFixed(1)} dS/m`, `${Number(e.plan_ece).toFixed(1)} dS/m`] as [string, string, string]] : []),
    ['Yield (estimate)', yieldCell(plan.habit_yield_pct), yieldCell(plan.plan_yield_pct)],
  ]
  return (
    <article className="k-card overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--k-line)] px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{plan.block_name} <span className="font-normal capitalize text-[var(--k-muted)]">· {plan.crop_key.replace('_', ' ')}</span></h3>
          <div className="mono text-[0.8125rem] text-[var(--k-muted)]">
            {plan.start_at ? `${hhmm(plan.start_at, tz)} – ${hhmm(plan.end_at, tz)} · ${plan.slot ?? ''}` : plan.skip_reason ?? '—'}
          </div>
        </div>
        <div className="ms-auto flex items-baseline gap-1">
          <span className="num text-[1.75rem] font-semibold leading-none">{plan.minutes}</span>
          <span className="text-[0.8125rem] text-[var(--k-muted)]">min</span>
          <span className="num ms-2 text-[0.8125rem] text-[var(--k-faint)] line-through">{String(e.habit_minutes ?? '')}{e.habit_minutes != null ? ' min' : ''}</span>
        </div>
      </header>

      <div className="grid gap-5 px-5 py-4">
        {plan.skip_reason ? (
          <p className="flex items-center gap-2 font-medium text-[var(--k-water)]">
            {plan.skip_reason === 'rain' && <Rain />}
            {plan.skip_reason === 'rain' ? 'No watering today: rain covers the need' : 'No watering needed today'}
          </p>
        ) : steps.length > 0 && (
          <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-[var(--k-sand-soft)]">
              {steps.map((s, i) => <span key={i} className="h-full" style={{ width: `${(s.minutes / total) * 100}%`, background: s.color }} />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem]">
              {steps.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
                  <span className="capitalize">{s.label}</span>
                  <span className="mono text-[var(--k-muted)]">{s.minutes} min</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-[#2a302d]">{pick(plan.text, lang)}</p>

        {(codes.length > 0 || plan.cap_exceeded || e.habit_deficit === true) && (
          <div className="flex flex-wrap gap-1.5">
            {codes.map((c) => <span key={c} className="chip chip-amber"><Warn /> {t(`fallback.${c}`, { defaultValue: c })}</span>)}
            {plan.cap_exceeded && <span className="chip chip-red">No mix keeps salt under this crop's limit. See Salt clock.</span>}
            {e.habit_deficit === true && <span className="chip chip-amber"><Warn /> Usual routine under-waters this block, so salt is not washed out</span>}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="eyebrow mb-1">How Milh decided</div>
            <dl className="grid grid-cols-[1fr_auto] text-[0.875rem]">
              {inputs.map(([k, v]) => (
                <Fragment key={k}>
                  <dt className="border-t border-[var(--k-line)] py-2 text-[var(--k-muted)]">{k}</dt>
                  <dd className="num border-t border-[var(--k-line)] py-2 text-end font-medium">{v}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
          <div>
            <div className="eyebrow mb-1">Usual routine vs Milh</div>
            <table className="w-full text-[0.875rem]">
              <thead>
                <tr className="text-[0.75rem] text-[var(--k-faint)]"><th className="py-1 text-start font-medium" /><th className="py-1 text-end font-medium">Usual</th><th className="py-1 text-end font-medium">Milh</th></tr>
              </thead>
              <tbody className="num">
                {compare.map(([k, a, b, good]) => (
                  <tr key={k}>
                    <td className="border-t border-[var(--k-line)] py-2 font-normal text-[var(--k-muted)]">{k}</td>
                    <td className="border-t border-[var(--k-line)] py-2 text-end text-[var(--k-muted)]">{a}</td>
                    <td className={`border-t border-[var(--k-line)] py-2 text-end font-semibold ${good ? 'text-[var(--k-green)]' : ''}`}>{b}</td>
                  </tr>
                ))}
                <tr>
                  <td className="border-t border-[var(--k-line)] py-2 font-normal text-[var(--k-muted)]">Cost vs usual</td>
                  <td className="border-t border-[var(--k-line)] py-2" />
                  <td className={`border-t border-[var(--k-line)] py-2 text-end font-semibold ${plan.saved_aed >= 0 ? 'text-[var(--k-green)]' : 'text-[var(--k-amber)]'}`}>
                    {plan.saved_aed >= 0 ? '−' : '+'}AED {Math.abs(plan.saved_aed).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="border-t border-[var(--k-line)] bg-[var(--k-sand-soft)] px-5 py-2.5 text-[0.75rem] text-[var(--k-muted)]">
        Yield is an estimate from FAO-29 (Maas–Hoffman). Root-zone salt comes from each option's own leaching, using the FAO-29
        leaching equation solved for ECe. Water saved <span className="num">{litres(plan.saved_l)}</span>
        {plan.aquifer_saved_l != null && <> · from the well <span className="num">{litres(plan.aquifer_saved_l)}</span></>}.
      </p>
    </article>
  )
}
