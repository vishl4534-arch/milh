// "Earth" look shared by the worker tablet and the owner screens: dark glass cards over the farm itself,
// an icon rail, a live-sky weather card and the farm picture. Every number on these cards comes from the
// farm's own data; the farm photo is a picture of a farm like this one, never a map of it.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { KioskBundle } from '../api/types'
import { Rain, Sunrise, Sunset, Thermo } from '../components/icons'
import { ageText, dayMonth, hhmm } from '../lib/format'
import { SkyScene } from '../kiosk/scene/SkyScene'

const FORECAST_STALE_H = 6

export function EarthShell({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
  return (
    <div className="earth">
      <div aria-hidden className="earth-backdrop" />
      <div className="flex gap-3 p-3 pb-24 md:gap-4 md:p-4 md:pb-4">
        {rail}
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:gap-4">{children}</div>
      </div>
    </div>
  )
}

export interface RailItem {
  key: string
  label: string
  icon: ReactNode
  onClick?: () => void
  active?: boolean
  /** the one action that should catch the eye (the Ask button) */
  accent?: boolean
  disabled?: boolean
  /** pinned to the bottom of the rail */
  end?: boolean
}

/** Vertical icon rail on tablets and laptops; a bottom bar on phones. Labels stay visible: a worker who
 *  cannot read the word still learns the picture, and one who can is never guessing. */
export function Rail({ items, label }: { items: RailItem[]; label: string }) {
  const top = items.filter((i) => !i.end)
  const end = items.filter((i) => i.end)
  return (
    <nav aria-label={label}
      className="glass fixed inset-x-3 bottom-3 z-20 flex justify-around gap-1 rounded-[1.75rem] p-1.5 md:sticky md:top-4 md:inset-x-auto md:bottom-auto md:h-[calc(100dvh-2rem)] md:w-[5.25rem] md:shrink-0 md:flex-col md:justify-start md:gap-2 md:p-2">
      {top.map((i) => <RailButton key={i.key} item={i} />)}
      {end.length > 0 && <div className="hidden flex-1 md:block" />}
      {end.map((i) => <RailButton key={i.key} item={i} />)}
    </nav>
  )
}

function RailButton({ item }: { item: RailItem }) {
  const base = 'press relative flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-[11px] font-semibold leading-tight disabled:opacity-35'
  return (
    <button type="button" onClick={item.onClick} disabled={item.disabled} aria-current={item.active ? 'true' : undefined}
      className={`${base} ${item.active ? 'text-ink' : 'text-ink-soft'}`}>
      <span className="relative grid size-12 place-items-center">
        {item.accent && <span aria-hidden className="ring absolute inset-0 rounded-full bg-palm" />}
        <span className={`relative grid size-12 place-items-center rounded-full text-[1.4rem] transition-colors duration-200 ${
          item.accent ? 'bg-palm text-white shadow-[0_8px_20px_-8px_rgba(63,157,92,.9)]'
            : item.active ? 'bg-[#f7f8f4] text-[#0b0e07]' : 'bg-white/5'}`}>
          {item.icon}
        </span>
      </span>
      <span className="max-w-[4.5rem] truncate">{item.label}</span>
    </button>
  )
}

/** A glass card with the reference's header: an icon, a quiet title, and an optional action on the end. */
export function Card({ title, icon, action, children, className = '', delay = 0, labelledBy, as = 'section', ariaLabel, id }: {
  title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; delay?: number
  labelledBy?: string; as?: 'section' | 'div'; ariaLabel?: string; id?: string
}) {
  const Tag = as
  return (
    <Tag id={id} aria-label={ariaLabel} aria-labelledby={labelledBy}
      className={`glass card-in scroll-mt-4 rounded-[1.75rem] p-4 md:p-5 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {(title || action) && (
        <div className="mb-3 flex items-center gap-2">
          {icon && <span className="text-xl text-ink-soft">{icon}</span>}
          <h3 className="text-base font-semibold">{title}</h3>
          {action && <div className="ms-auto">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}

/** A stat card: label, one big number, and a line of context under it. */
export function Stat({ icon, label, value, unit, sub, children, delay = 0, tone }: {
  icon: ReactNode; label: string; value: ReactNode; unit?: string; sub?: ReactNode; children?: ReactNode; delay?: number
  tone?: 'good' | 'warn' | 'bad'
}) {
  const color = tone === 'bad' ? 'text-brine' : tone === 'warn' ? 'text-dune' : ''
  return (
    <div className="glass card-in flex min-w-0 flex-col rounded-[1.75rem] p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 text-sm font-medium text-ink-soft"><span className="text-lg">{icon}</span>{label}</div>
      <div className={`mt-2 flex items-baseline gap-1.5 ${color}`}>
        <span className="num text-4xl leading-none">{value}</span>
        {unit && <span className="text-base text-ink-soft">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-sm text-ink-soft">{sub}</div>}
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  )
}

/** A progress bar that fills once when it appears. value 0..1 */
export function Bar({ value, color = 'var(--color-palm)', label, className = '' }: { value: number; color?: string; label?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-white/10 ${className}`} role={label ? 'img' : undefined} aria-label={label}>
      <div className="grow-x h-full rounded-full" style={{ width: `${Math.max(v * 100, v > 0 ? 3 : 0)}%`, background: color }} />
    </div>
  )
}

/** Weather over the live sky: today's real forecast for the farm, from the plan's own weather record. */
export function WeatherCard({ bundle, now, className = '', delay = 0 }: { bundle: KioskBundle; now: number; className?: string; delay?: number }) {
  const { t } = useTranslation()
  const tz = bundle.farm.timezone
  const w = bundle.weather
  const today = w?.daily.find((d) => d.day === bundle.day)
  const temp = w?.current.temperature_2m
  const chip = 'glass-chip flex flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-xs text-white'
  return (
    <section aria-label={t('kiosk.weather')} className={`card-in ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <SkyScene now={now} tz={tz} className="h-full rounded-[1.75rem] ring-1 ring-white/10" sunBand="start-[60%] end-[8%] top-[12%] bottom-[48%]"
        sunrise={bundle.sun?.sunrise ? Date.parse(bundle.sun.sunrise) : null} sunset={bundle.sun?.sunset ? Date.parse(bundle.sun.sunset) : null}>
        <div className="flex h-full min-h-[15rem] flex-col p-4 text-white [text-shadow:0_1px_8px_rgba(0,0,0,.35)]">
          <div className="flex items-center gap-2 text-sm font-semibold"><Thermo /> {t('kiosk.weather')}</div>
          <div className="mt-3 text-sm opacity-90">{dayMonth(now, tz)}</div>
          {w ? (
            <>
              <div>
                <span className="num text-6xl font-semibold">{typeof temp === 'number' ? Math.round(temp) : '–'}°</span>
                {today && <div className="num text-sm opacity-90">{t('kiosk.maxTemp', { n: Math.round(today.tmax_c) })}</div>}
              </div>
              {w.age_h > FORECAST_STALE_H && (
                <span className="mt-1 self-start rounded-full bg-dune px-3 py-0.5 text-xs font-semibold text-white">
                  {t('kiosk.forecastAge', { age: ageText(w.age_h, t) })}
                </span>
              )}
            </>
          ) : (
            <p className="mt-6">{t('empty.noForecast')}</p>
          )}
          <div className="mt-auto grid grid-cols-3 gap-2 pt-3">
            <span className={chip}><Rain className="text-base" /><span className="num">{today ? `${today.rain_mm.toFixed(1)} mm` : '–'}</span></span>
            <span className={chip} title={t('kiosk.sunrise')}><Sunrise className="text-base" /><span className="num">{hhmm(bundle.sun?.sunrise ?? null, tz)}</span></span>
            <span className={chip} title={t('kiosk.sunset')}><Sunset className="text-base" /><span className="num">{hhmm(bundle.sun?.sunset ?? null, tz)}</span></span>
          </div>
        </div>
      </SkyScene>
    </section>
  )
}

/** The farm picture card: a photo of a farm like this one, slowly breathing, with the content over it. */
export function FarmView({ top, children, ariaLabel, className = '', delay = 0 }: {
  top?: ReactNode; children: ReactNode; ariaLabel: string; className?: string; delay?: number
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={ariaLabel} className={`card-in relative isolate overflow-hidden rounded-[1.75rem] ring-1 ring-white/10 ${className}`}
      style={{ animationDelay: `${delay}ms` }}>
      <img src="/scenes/farm-aerial.webp" alt="" className="kenburns absolute inset-0 -z-10 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(11,14,7,.72)_0%,rgba(11,14,7,.35)_55%,rgba(11,14,7,.1)_100%)] rtl:bg-[linear-gradient(270deg,rgba(11,14,7,.72)_0%,rgba(11,14,7,.35)_55%,rgba(11,14,7,.1)_100%)]" />
      {top && <div className="flex justify-center p-3">{top}</div>}
      <div className={`p-3 md:p-4 ${top ? 'pt-0 md:pt-0' : ''}`}>{children}</div>
      <span className="absolute bottom-2 end-3 text-[10px] uppercase tracking-wider text-white/45">{t('kiosk.illustration')}</span>
    </section>
  )
}
