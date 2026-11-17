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
    ...(e.habit_ece != null && e.plan_ece != null ? [['Soil salt (ECe)', `${Number(e.habit_ece).toFixed(1)} dS/m`, `${Number(e.plan_ece).toFixed(1)} dS/m`] as [string, string, string]] : []),
    ['Yield (estimate)', yieldCell(plan.habit_yield_pct), yieldCell(plan.plan_yield_pct)],
  ]
  const saving = `${plan.saved_aed >= 0 ? '−' : '+'}AED ${Math.abs(plan.saved_aed).toFixed(2)}`
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
          {e.habit_minutes != null && (
            <span className="ms-2 text-[0.8125rem] text-[var(--k-faint)]">usual <span className="num line-through">{String(e.habit_minutes)} min</span></span>
          )}
        </div>
      </header>

      <div className="grid gap-x-10 gap-y-6 px-5 py-5 lg:grid-cols-2">
        <div>
          <div className="eyebrow mb-2">Today's instruction</div>
          <p className="text-[0.9375rem] leading-relaxed text-[#2a302d]">{pick(plan.text, lang)}</p>
        </div>

        <div className="grid content-start gap-3">
          <div className="eyebrow">Taps</div>
          {plan.skip_reason ? (
            <p className="flex items-center gap-2 font-medium text-[var(--k-water)]">
              {plan.skip_reason === 'rain' && <Rain />}
              {plan.skip_reason === 'rain' ? 'No watering today: rain covers the need' : 'No watering needed today'}
            </p>
          ) : steps.length > 0 && (
            <div>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-[var(--k-sand-soft)]">
                {steps.map((s, i) => <span key={i} className="h-full first:rounded-s-full last:rounded-e-full" style={{ width: `${(s.minutes / total) * 100}%`, background: s.color }} />)}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem]">
                {steps.map((s, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
                    <span className="capitalize">{s.label}</span>
                    <span className="mono text-[var(--k-muted)]">{s.minutes} min</span>
                    <span className="num text-[var(--k-faint)]">· {Math.round((s.minutes / total) * 100)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {(codes.length > 0 || plan.cap_exceeded || e.habit_deficit === true) && (
            <div className="flex flex-wrap gap-1.5">
              {codes.map((c) => <span key={c} className="chip chip-amber"><Warn /> {t(`fallback.${c}`, { defaultValue: c })}</span>)}
              {plan.cap_exceeded && <span className="chip chip-red">No mix keeps salt under this crop's limit. See Salt clock.</span>}
              {e.habit_deficit === true && <span className="chip chip-amber"><Warn /> Usual routine under-waters this block, so salt is not washed out</span>}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-[minmax(0,1fr)_auto] content-start text-[0.875rem]">
          <dt className="eyebrow pb-2">How Milh decided</dt>
          <dd className="pb-2" />
          {inputs.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="border-t border-[var(--k-line)] py-2 text-[var(--k-muted)]">{k}</dt>
              <dd className="num border-t border-[var(--k-line)] py-2 text-end font-medium">{v}</dd>
            </Fragment>
          ))}
        </dl>

        <div role="table" aria-label="Usual routine vs Milh" className="grid grid-cols-[minmax(0,1fr)_5rem_5.5rem] content-start text-[0.875rem]">
          <div role="row" className="contents">
            <span role="columnheader" className="eyebrow pb-2">Compared</span>
            <span role="columnheader" className="eyebrow pb-2 text-end">Usual</span>
            <span role="columnheader" className="eyebrow pb-2 text-end text-[var(--k-green)]">Milh</span>
          </div>
          {compare.map(([k, a, b, good]) => (
            <div role="row" key={k} className="contents">
              <span role="rowheader" className="border-t border-[var(--k-line)] py-2 text-[var(--k-muted)]">{k}</span>
              <span role="cell" className="num border-t border-[var(--k-line)] py-2 text-end text-[var(--k-muted)]">{a}</span>
              <span role="cell" className={`num border-t border-[var(--k-line)] py-2 text-end font-semibold ${good ? 'text-[var(--k-green)]' : ''}`}>{b}</span>
            </div>
          ))}
          <div role="row" className="contents">
            <span role="rowheader" className="border-t border-[var(--k-line)] py-2 text-[var(--k-muted)]">Saved vs usual</span>
            <span role="cell" className="num col-span-2 border-t border-[var(--k-line)] py-2 text-end">
              <span className="font-semibold">{litres(plan.saved_l)}</span>
              {plan.aquifer_saved_l != null && <span className="text-[var(--k-muted)]"> · well {litres(plan.aquifer_saved_l)}</span>}
            </span>
          </div>
          <div role="row" className="contents">
            <span role="rowheader" className="border-t border-[var(--k-line)] py-2 text-[var(--k-muted)]">Cost per day</span>
            <span role="cell" className={`num col-span-2 border-t border-[var(--k-line)] py-2 text-end font-semibold ${plan.saved_aed >= 0 ? 'text-[var(--k-green)]' : 'text-[var(--k-amber)]'}`}>
              {saving} vs usual
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
