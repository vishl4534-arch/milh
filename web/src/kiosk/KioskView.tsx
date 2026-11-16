import { useTranslation } from 'react-i18next'
import type { BundleState } from '../api/hooks'
import type { KAnnouncement, KBlock, KRun, KSource, KTank, Lang } from '../api/types'
import { Check, Cross, Drop, Leaf, Plus, Rain, Speaker, Sunrise, Sunset, Thermo, Warn, Wifi } from '../components/icons'
import { pick } from '../i18n'
import { ageText, dayMonth, hhmm, hoursSince, litres } from '../lib/format'
import { PipeBar } from './PipeBar'

const LANG_LABEL: Record<string, string> = { en: 'EN', ur: 'اردو', ar: 'عربي', hi: 'हिंदी' }
const FORECAST_STALE_H = 6

export interface KioskViewProps {
  state: BundleState
  lang: Lang
  now: number
  onDone: (run: KRun) => void
  onListen: (a: KAnnouncement | null, run?: KRun) => void
  onLang: (lang: Lang) => void
  onAddReading: () => void
  soundBlocked?: boolean
  onUnblockSound?: () => void
}

function focusRun(runs: KRun[], now: number): KRun | null {
  return runs.find((r) => r.steps.length > 0 && !r.done && r.end !== null && Date.parse(r.end) >= now) ?? null
}

export function KioskView(props: KioskViewProps) {
  const { state, lang, now } = props
  const { t } = useTranslation()
  const b = state.bundle
  const tz = b.farm.timezone
  const focus = focusRun(b.runs, now)
  const nextAnn = b.announcements.find((a) => a.status === 'scheduled' && Date.parse(a.scheduled_at) >= now) ?? null

  return (
    <div className="flex min-h-dvh flex-col gap-3 bg-salt p-3 text-ink md:p-4">
      <Header {...props} />
      {props.soundBlocked && (
        <button type="button" onClick={props.onUnblockSound}
          className="flex items-center gap-3 rounded-2xl bg-dune px-5 py-3 text-start text-lg font-semibold text-white">
          <Speaker className="text-2xl" /> {t('kiosk.soundBlocked')}
        </button>
      )}
      <main className="grid flex-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          <NowCard run={focus} hasRuns={b.runs.length > 0} {...props} />
          <TodayList runs={b.runs.filter((r) => r !== focus)} tz={tz} lang={lang} />
        </div>
        <div className="flex flex-col gap-3">
          <WaterPanel tanks={b.tanks} sources={b.sources} lang={lang} now={now} onAdd={props.onAddReading} />
          <SoilPanel blocks={b.blocks} lang={lang} tz={tz} today={b.day} />
        </div>
      </main>
      <footer className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-salt">
        <button type="button" onClick={() => props.onListen(nextAnn)} disabled={!nextAnn}
          aria-label={t('common.listen')}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-salt text-2xl text-ink disabled:opacity-40">
          <Speaker />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-salt/60">{t('kiosk.announcements')}</div>
          <div className="truncate text-lg">
            {nextAnn ? <><span className="num me-2">{hhmm(nextAnn.scheduled_at, tz)}</span>{pick(nextAnn.text, lang)}</> : '—'}
          </div>
        </div>
      </footer>
    </div>
  )
}

function Header({ state, lang, now, onLang }: KioskViewProps) {
  const { t } = useTranslation()
  const b = state.bundle
  const tz = b.farm.timezone
  const today = b.weather?.daily.find((d) => d.day === b.day)
  const temp = b.weather?.current.temperature_2m
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-panel px-4 py-3 shadow-sm ring-1 ring-line">
      <div className="min-w-0">
        <div className="font-display text-2xl font-bold leading-tight">{b.farm.name}</div>
        <div className="text-sm text-ink-soft">
          {dayMonth(now, tz)} · <span className="num">{hhmm(now, tz)}</span>
          {b.farm.example_label && <span className="ms-2 rounded bg-salt px-1.5 py-0.5 text-xs">example setup</span>}
        </div>
      </div>
      {b.weather ? (
        <div className="flex items-center gap-5 text-lg">
          <span className="flex items-center gap-1.5"><Thermo className="text-dune" />
            <span className="num text-2xl font-semibold">{typeof temp === 'number' ? Math.round(temp) : '–'}°</span>
            {today && <span className="num text-ink-soft">/ {Math.round(today.tmax_c)}°</span>}
          </span>
          {b.sun && (
            <>
              <span className="flex items-center gap-1.5" title={t('kiosk.sunrise')}>
                <Sunrise className="text-2xl text-dune" /><span className="num">{hhmm(b.sun.sunrise, tz)}</span>
              </span>
              <span className="flex items-center gap-1.5" title={t('kiosk.sunset')}>
                <Sunset className="text-2xl text-ink-soft" /><span className="num">{hhmm(b.sun.sunset, tz)}</span>
              </span>
            </>
          )}
          {b.weather.age_h > FORECAST_STALE_H && (
            <span className="rounded-full bg-dune/15 px-3 py-1 text-sm text-dune">
              {t('kiosk.forecastAge', { age: ageText(b.weather.age_h, t) })}
            </span>
          )}
        </div>
      ) : (
        <span className="text-ink-soft">{t('empty.noForecast')}</span>
      )}
      <div className="ms-auto flex items-center gap-2">
        {state.offline && (
          <span className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-sm text-salt">
            <Wifi /> {t('kiosk.offline', { time: hhmm(state.cachedAt, tz) })}
          </span>
        )}
        {b.farm.languages.map((l) => (
          <button key={l} type="button" onClick={() => onLang(l)} aria-pressed={l === lang}
            className={`min-w-14 rounded-xl px-3 py-2 text-lg font-semibold ring-1 ring-line ${l === lang ? 'bg-ink text-salt' : 'bg-panel'}`}>
            {LANG_LABEL[l] ?? l}
          </button>
        ))}
      </div>
      <span className="sr-only">{hoursSince(b.generated_at, now)}</span>
    </header>
  )
}

function NowCard({ run, hasRuns, state, lang, now, onDone, onListen }: KioskViewProps & { run: KRun | null; hasRuns: boolean }) {
  const { t } = useTranslation()
  const tz = state.bundle.farm.timezone
  if (!run) {
    return (
      <section aria-label={t('kiosk.now')} className="grid place-items-center rounded-3xl bg-panel p-8 text-center ring-1 ring-line">
        <Check className="text-5xl text-palm" />
        <p className="mt-2 text-2xl font-semibold">{hasRuns ? t('kiosk.allDone') : t('kiosk.noPlan')}</p>
      </section>
    )
  }
  const running = run.start !== null && Date.parse(run.start) <= now
  const progress = running && run.start && run.end
    ? Math.min(1, (now - Date.parse(run.start)) / (Date.parse(run.end) - Date.parse(run.start))) : null
  const startAnn = state.bundle.announcements.find((a) => a.plan_id === run.plan_id && a.type === 'irrigation_start') ?? null
  return (
    <section aria-label={t('kiosk.now')} className="rounded-3xl bg-panel p-5 ring-1 ring-line md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-palm">{running ? t('kiosk.now') : t('kiosk.next')}</div>
          <h2 className="font-display text-3xl font-bold md:text-4xl">{run.block_name}</h2>
          <div className="flex items-center gap-2 text-xl text-ink-soft"><Leaf className="text-palm" />{pick(run.crop_names, lang)}</div>
        </div>
        <div className="text-end">
          <div className="flex items-baseline justify-end gap-1">
            <span className="num text-7xl font-bold leading-none md:text-8xl">{run.minutes}</span>
            <span className="text-xl text-ink-soft">{t('common.minutes')}</span>
          </div>
          <div className="text-ink-soft">
            <span className="line-through">{t('kiosk.instead', { n: run.habit_minutes })}</span>
            {run.saved_l > 0 && <span className="num ms-2 text-palm">−{litres(run.saved_l)}</span>}
          </div>
        </div>
      </div>
      <div className="mt-5">
        <PipeBar steps={run.steps} lang={lang} progress={progress} />
        <div className="num mt-1.5 flex justify-between text-sm text-ink-soft" dir="ltr">
          <span>{hhmm(run.start, tz)}</span><span>{hhmm(run.end, tz)}</span>
        </div>
      </div>
      {run.flush && <p className="mt-3 rounded-xl bg-sky/10 px-3 py-2 font-semibold text-sky">{t('kiosk.flush')}</p>}
      <p className="mt-3 text-ink-soft">{pick(run.text, lang)}</p>
      <Fallbacks codes={run.fallbacks} />
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={() => onDone(run)}
          className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-palm py-5 text-2xl font-bold text-white active:bg-palm-deep">
          <Check className="text-3xl" /> {t('kiosk.done')}
        </button>
        <button type="button" onClick={() => onListen(startAnn, run)} aria-label={t('common.listen')}
          className="grid w-24 place-items-center rounded-2xl bg-salt text-4xl ring-1 ring-line">
          <Speaker />
        </button>
      </div>
    </section>
  )
}

function Fallbacks({ codes }: { codes: string[] }) {
  const { t } = useTranslation()
  const shown = [...new Set(codes.map((c) => c.split(':')[0]))]
  if (!shown.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {shown.map((c) => (
        <span key={c} className="flex items-center gap-1.5 rounded-full bg-dune/15 px-3 py-1 text-sm text-dune">
          <Warn /> {t(`fallback.${c}`, { defaultValue: c })}
        </span>
      ))}
    </div>
  )
}

function TodayList({ runs, tz, lang }: { runs: KRun[]; tz: string; lang: Lang }) {
  const { t } = useTranslation()
  if (!runs.length) return null
  return (
    <section aria-label={t('kiosk.later')} className="rounded-3xl bg-panel p-4 ring-1 ring-line">
      <ul className="divide-y divide-line">
        {runs.map((r) => (
          <li key={r.plan_id} className="flex items-center gap-4 py-3">
            <div className="w-36 shrink-0">
              <div className="font-semibold">{r.block_name}</div>
              <div className="text-sm text-ink-soft">{pick(r.crop_names, lang)}</div>
            </div>
            {r.skip_reason ? (
              <div className="flex flex-1 items-center gap-2 text-lg text-sky">
                {r.skip_reason === 'rain' ? <Rain label="rain" className="text-2xl" /> : <Check className="text-2xl" />}
                {r.skip_reason === 'rain' ? t('kiosk.skipRain') : t('kiosk.skipNoNeed')}
              </div>
            ) : (
              <>
                <div className="flex-1"><PipeBar steps={r.steps} lang={lang} compact /></div>
                <div className="num w-24 text-end text-lg">{hhmm(r.start, tz)}</div>
                <div className="num w-16 text-end text-2xl font-bold">{r.minutes}</div>
                {r.done && <Check label={t('kiosk.doneSaved')} className="text-2xl text-palm" />}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function WaterPanel({ tanks, sources, lang, now, onAdd }: { tanks: KTank[]; sources: KSource[]; lang: Lang; now: number; onAdd: () => void }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('kiosk.water')} className="rounded-3xl bg-panel p-4 ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xl font-bold"><Drop className="text-sky" />{t('kiosk.water')}</h3>
        <button type="button" onClick={onAdd}
          className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 font-semibold text-salt">
          <Plus /> {t('kiosk.addReading')}
        </button>
      </div>
      <div className="grid gap-3">
        {tanks.map((tk) => (
          <div key={tk.id} className="flex items-center gap-3">
            <div className="relative h-14 w-9 overflow-hidden rounded-md ring-2 ring-ink/70" aria-hidden>
              {tk.level_pct !== null && (
                <div className="absolute inset-x-0 bottom-0 bg-sky/80" style={{ height: `${tk.level_pct}%` }} />
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm text-ink-soft">{tk.name}</div>
              {tk.level_pct === null ? (
                <div className="text-lg text-ink-soft">{t('empty.noReading')}</div>
              ) : (
                <div className="num text-3xl font-bold">{Math.round(tk.level_pct)}%</div>
              )}
            </div>
            {tk.measured_at && <Age iso={tk.measured_at} now={now} />}
          </div>
        ))}
        {sources.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-salt px-3 py-2">
            <span className="size-5 shrink-0 rounded-full ring-2 ring-white" style={{ background: s.tap_color }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink-soft">{t('kiosk.salt')} · {pick(s.tap_label, lang) || s.name}</div>
              {s.ec === null ? (
                <div className="text-lg text-ink-soft">{t('empty.noReading')}</div>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="num text-2xl font-bold">{s.ec.toFixed(1)}</span>
                  <span className="text-sm text-ink-soft">dS/m</span>
                  {s.trend === 'up' && <span className="text-dune" aria-label="rising">▲</span>}
                  {s.trend === 'down' && <span className="text-palm" aria-label="falling">▼</span>}
                </div>
              )}
            </div>
            {s.stale && s.ec !== null && <Warn label="old reading" className="text-xl text-dune" />}
            {s.ec_measured_at && <Age iso={s.ec_measured_at} now={now} />}
          </div>
        ))}
      </div>
    </section>
  )
}

function Age({ iso, now }: { iso: string; now: number }) {
  const { t } = useTranslation()
  return <span className="text-xs text-ink-soft">{t('common.ago', { age: ageText(hoursSince(iso, now), t) })}</span>
}

const SOIL_ICON = {
  ok: <Check className="text-palm" />,
  warn: <Warn className="text-dune" />,
  high: <Cross className="text-brine" />,
  none: <span className="text-ink-soft">–</span>,
}

function SoilPanel({ blocks, lang, tz, today }: { blocks: KBlock[]; lang: Lang; tz: string; today: string }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('kiosk.soil')} className="rounded-3xl bg-panel p-4 ring-1 ring-line">
      <h3 className="mb-2 flex items-center gap-2 text-xl font-bold"><Leaf className="text-palm" />{t('kiosk.soil')}</h3>
      <ul className="divide-y divide-line">
        {blocks.map((b) => {
          const due = b.next_test_due !== null && b.next_test_due <= today
          return (
            <li key={b.id} className="flex items-center gap-3 py-2.5">
              <span className="text-2xl">{SOIL_ICON[b.soil.status]}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{b.name} <span className="font-normal text-ink-soft">· {pick(b.crop_names, lang)}</span></div>
                <div className="text-sm text-ink-soft">
                  {b.soil.status === 'none' ? t('empty.noTest') : (
                    <>{t(`status.${b.soil.status}`)} · <span className="num">ECe {b.soil.ece?.toFixed(1)}</span></>
                  )}
                </div>
              </div>
              {b.next_test_due && (
                <div className={`rounded-xl px-2.5 py-1 text-end text-sm ${due ? 'bg-dune text-white' : 'bg-salt'}`}>
                  <div>{due ? t('kiosk.testDue') : t('kiosk.nextTest')}</div>
                  <div className="num font-semibold">{dayMonth(b.next_test_due, tz)}</div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
