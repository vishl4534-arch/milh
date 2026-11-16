import { useCallback, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { BundleState } from '../api/hooks'
import type { KAnnouncement, KBlock, KRun, KSource, KTank, Lang } from '../api/types'
import { Check, Mic, Plus, Rain, Speaker, Sunrise, Sunset, Thermo, Warn, Wifi } from '../components/icons'
import { pick } from '../i18n'
import { ageText, dayMonth, hhmm, hoursSince, litres, localDay } from '../lib/format'
import { CropArt } from './art/CropArt'
import { DropIcon, SoilSprout, TankArt } from './art/Tank'
import { PipeBar } from './PipeBar'
import { SkyScene } from './scene/SkyScene'
import { MilhMark } from '../brand/Logo'

const LANG_LABEL: Record<string, string> = { en: 'EN', ur: 'اردو', ar: 'عربي', hi: 'हिंदी' }
const FORECAST_STALE_H = 6
const STAGGER_MS = 60

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
  canAsk?: boolean
  onAsk?: () => void
}

interface Burst {
  id: number
  x: number
  y: number
}

function focusRun(runs: KRun[]): KRun | null {
  // The earliest run not yet confirmed: a finished run stays here until the worker taps Done.
  return runs.find((r) => r.steps.length > 0 && !r.done) ?? null
}

const panel = 'rounded-[1.75rem] bg-panel shadow-[0_1px_0_#d9ded9,0_14px_32px_-22px_rgba(27,36,33,.45)]'

export function KioskView(props: KioskViewProps) {
  const { state, lang, now } = props
  const { t } = useTranslation()
  const b = state.bundle
  const tz = b.farm.timezone
  const focus = focusRun(b.runs)
  const nextAnn = b.announcements.find((a) => a.status === 'scheduled' && Date.parse(a.scheduled_at) >= now) ?? null
  const [bursts, setBursts] = useState<Burst[]>([])

  const burstAt = useCallback((e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const id = Date.now() + Math.random()
    setBursts((list) => [...list, { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }])
    window.setTimeout(() => setBursts((list) => list.filter((x) => x.id !== id)), 800)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col gap-3 bg-[linear-gradient(180deg,#f7f8f6_0%,#f1ede2_100%)] p-3 text-ink md:p-4">
      <Header {...props} />
      {b.day !== localDay(now, tz) && (
        <div role="alert" className="rise-in rounded-2xl bg-brine px-5 py-3 text-lg font-semibold text-white">
          {t('kiosk.notToday', { day: dayMonth(b.day, tz) })}
        </div>
      )}
      {props.soundBlocked && (
        <button type="button" onClick={props.onUnblockSound}
          className="press rise-in flex items-center gap-3 rounded-2xl bg-dune px-5 py-3 text-start text-lg font-semibold text-white">
          <Speaker className="text-2xl" /> {t('kiosk.soundBlocked')}
        </button>
      )}
      <main className="grid flex-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          <NowCard run={focus} hasRuns={b.runs.length > 0} onBurst={burstAt} {...props} />
          <TodayList runs={b.runs.filter((r) => r !== focus)} tz={tz} lang={lang} />
        </div>
        <div className="flex flex-col gap-3">
          <WaterPanel tanks={b.tanks} sources={b.sources} lang={lang} now={now} onAdd={props.onAddReading} />
          <SoilPanel blocks={b.blocks} lang={lang} tz={tz} today={b.day} />
        </div>
      </main>
      {props.canAsk && !state.offline && (
        <div className="fixed bottom-24 end-5 z-10">
          <span aria-hidden className="ring absolute inset-0 rounded-full bg-palm" />
          <button type="button" onClick={props.onAsk}
            className="press relative flex items-center gap-3 rounded-full bg-palm px-7 py-4 text-2xl font-bold text-white shadow-[0_14px_30px_-10px_rgba(35,79,59,.8)] ring-4 ring-salt active:bg-palm-deep">
            <Mic className="text-3xl" /> {t('kiosk.ask')}
          </button>
        </div>
      )}
      <footer className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-salt">
        <button type="button" onClick={() => props.onListen(nextAnn)} disabled={!nextAnn} aria-label={t('common.listen')}
          className="press grid size-12 shrink-0 place-items-center rounded-full bg-sun text-2xl text-ink disabled:opacity-40">
          <Speaker />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-salt/60">{t('kiosk.announcements')}</div>
          <div className="truncate text-lg">
            {nextAnn ? <><span className="num me-2 text-sun">{hhmm(nextAnn.scheduled_at, tz)}</span>{pick(nextAnn.text, lang)}</> : '—'}
          </div>
        </div>
      </footer>
      {bursts.map((bu) => <DropBurst key={bu.id} x={bu.x} y={bu.y} />)}
    </div>
  )
}

/** DONE celebration: water drops fly out from the button (rare, so it may delight). */
function DropBurst({ x, y }: { x: number; y: number }) {
  const drops = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2
    const d = 70 + (i % 3) * 22
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 20 }
  })
  return (
    <div aria-hidden className="pointer-events-none fixed z-40" style={{ left: x, top: y }}>
      {drops.map((d, i) => (
        <span key={i} className="drop-burst absolute -ms-3 -mt-3 block size-6"
          style={{ ['--dx' as string]: `${d.dx}px`, ['--dy' as string]: `${d.dy}px`, animationDelay: `${(i % 3) * 25}ms` }}>
          <DropIcon className="size-6" color={i % 2 ? '#2e86c1' : '#5fb6e8'} />
        </span>
      ))}
    </div>
  )
}

function greetingKey(now: number, tz: string): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)))
  if (h < 5) return 'kiosk.greet_night'
  if (h < 12) return 'kiosk.greet_morning'
  if (h < 17) return 'kiosk.greet_afternoon'
  if (h < 20) return 'kiosk.greet_evening'
  return 'kiosk.greet_night'
}

function Header({ state, lang, now, onLang }: KioskViewProps) {
  const { t } = useTranslation()
  const b = state.bundle
  const tz = b.farm.timezone
  const today = b.weather?.daily.find((d) => d.day === b.day)
  const temp = b.weather?.current.temperature_2m
  const chip = 'flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 shadow-sm'
  return (
    <header>
      <SkyScene now={now} tz={tz} sunrise={b.sun?.sunrise ? Date.parse(b.sun.sunrise) : null}
        sunset={b.sun?.sunset ? Date.parse(b.sun.sunset) : null}>
        <div className="flex h-full min-h-[13.5rem] flex-col justify-between p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="rise-in flex items-center gap-3 rounded-2xl bg-white/85 py-2 ps-3 pe-4 shadow-sm">
              <MilhMark label="Milh" className="h-12 w-10 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-palm">{t(greetingKey(now, tz))}</div>
                <div className="font-display text-2xl font-bold leading-tight">{b.farm.name}</div>
                <div className="text-sm text-ink-soft">
                  {dayMonth(now, tz)} · <span className="num text-base font-semibold text-ink">{hhmm(now, tz)}</span>
                  {b.farm.example_label && <span className="ms-2 rounded bg-salt px-1.5 py-0.5 text-xs">example setup</span>}
                </div>
              </div>
            </div>
            <div className="ms-auto flex items-center gap-2">
              {state.offline && (
                <span className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-sm text-salt">
                  <Wifi /> {t('kiosk.offline', { time: hhmm(state.cachedAt, tz) })}
                </span>
              )}
              {b.farm.languages.map((l) => (
                <button key={l} type="button" onClick={() => onLang(l)} aria-pressed={l === lang}
                  className={`press min-w-14 rounded-xl px-3 py-2 text-lg font-semibold shadow-sm ${l === lang ? 'bg-ink text-salt' : 'bg-white/90'}`}>
                  {LANG_LABEL[l] ?? l}
                </button>
              ))}
            </div>
          </div>
          {b.weather ? (
            <div className="flex flex-wrap items-center gap-2 text-lg">
              <span className={chip}><Thermo className="text-dune" />
                <span className="num text-2xl font-semibold">{typeof temp === 'number' ? Math.round(temp) : '–'}°</span>
                {today && <span className="num text-ink-soft">/ {Math.round(today.tmax_c)}°</span>}
              </span>
              {b.sun && (
                <>
                  <span className={chip} title={t('kiosk.sunrise')}>
                    <Sunrise className="text-2xl text-dune" /><span className="num">{hhmm(b.sun.sunrise, tz)}</span>
                  </span>
                  <span className={chip} title={t('kiosk.sunset')}>
                    <Sunset className="text-2xl text-ink-soft" /><span className="num">{hhmm(b.sun.sunset, tz)}</span>
                  </span>
                </>
              )}
              {b.weather.age_h > FORECAST_STALE_H && (
                <span className="rounded-full bg-dune px-3 py-1 text-sm font-semibold text-white">
                  {t('kiosk.forecastAge', { age: ageText(b.weather.age_h, t) })}
                </span>
              )}
            </div>
          ) : (
            <span className={`${chip} self-start text-ink-soft`}>{t('empty.noForecast')}</span>
          )}
          <span className="sr-only">{hoursSince(b.generated_at, now)}</span>
        </div>
      </SkyScene>
    </header>
  )
}

function NowCard({ run, hasRuns, state, lang, now, onDone, onListen, onBurst }:
  KioskViewProps & { run: KRun | null; hasRuns: boolean; onBurst: (e: MouseEvent<HTMLElement>) => void }) {
  const { t } = useTranslation()
  const tz = state.bundle.farm.timezone
  if (!run) {
    return (
      <section aria-label={t('kiosk.now')} className={`${panel} rise-in grid place-items-center gap-2 p-8 text-center`}>
        <div className="pop grid size-20 place-items-center rounded-full bg-palm/10 text-5xl text-palm"><Check /></div>
        <p className="text-2xl font-semibold">{hasRuns ? t('kiosk.allDone') : t('kiosk.noPlan')}</p>
      </section>
    )
  }
  const running = run.start !== null && Date.parse(run.start) <= now && (run.end === null || Date.parse(run.end) >= now)
  const overdue = run.end !== null && Date.parse(run.end) < now
  const progress = running && run.start && run.end
    ? Math.min(1, (now - Date.parse(run.start)) / (Date.parse(run.end) - Date.parse(run.start))) : null
  const left = running && run.end ? Math.max(1, Math.ceil((Date.parse(run.end) - now) / 60000)) : null
  const startAnn = state.bundle.announcements.find((a) => a.plan_id === run.plan_id && a.type === 'irrigation_start') ?? null
  const block = state.bundle.blocks.find((b) => b.id === run.block_id)
  const badge = overdue ? 'bg-dune text-white' : running ? 'bg-water text-white' : 'bg-palm/10 text-palm'
  return (
    <section aria-label={t('kiosk.now')} className={`${panel} rise-in overflow-hidden`}>
      <div className="flex items-stretch gap-4 p-5 md:p-6">
        <div className="relative hidden w-36 shrink-0 sm:block">
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-20 rounded-[50%] bg-[radial-gradient(ellipse_at_center,#ead9b5_0%,transparent_70%)]" />
          <CropArt crop={block?.crop_key ?? ''} sway={running || !overdue} className="relative h-full max-h-48 w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wider ${badge}`}>
                {running && <span aria-hidden className="size-2 rounded-full bg-white twinkle" />}
                {overdue ? t('kiosk.unconfirmed') : running ? t('kiosk.now') : t('kiosk.next')}
              </span>
              <h2 className="mt-2 font-display text-4xl font-bold md:text-5xl">{run.block_name}</h2>
              <div className="text-xl text-ink-soft">{pick(run.crop_names, lang)}</div>
            </div>
            <div className="text-end">
              <div className="flex items-baseline justify-end gap-1">
                <span className="num text-7xl font-bold leading-none md:text-8xl">{run.minutes}</span>
                <span className="text-xl text-ink-soft">{t('common.minutes')}</span>
              </div>
              <div className="text-ink-soft"><span className="line-through">{t('kiosk.instead', { n: run.habit_minutes })}</span></div>
              {run.saved_l > 0 && (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-water/10 px-2.5 py-0.5 text-water">
                  <DropIcon className="size-4" /> <span className="num font-semibold">−{litres(run.saved_l)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 md:px-6">
        <PipeBar steps={run.steps} lang={lang} progress={progress} flowing={running} />
        <div className="num mt-1.5 flex justify-between text-sm text-ink-soft" dir="ltr">
          <span>{hhmm(run.start, tz)}</span>
          {left !== null && <span className="font-semibold text-water">{t('kiosk.left', { n: left })}</span>}
          <span>{hhmm(run.end, tz)}</span>
        </div>
      </div>
      <div className="p-5 pt-3 md:p-6 md:pt-3">
        {run.flush && <p className="mb-3 rounded-xl bg-water/10 px-3 py-2 font-semibold text-water">{t('kiosk.flush')}</p>}
        <p className="text-ink-soft">{pick(run.text, lang)}</p>
        <Fallbacks codes={run.fallbacks} />
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={(e) => { onBurst(e); onDone(run) }}
            className="press flex flex-1 items-center justify-center gap-3 rounded-2xl bg-palm py-5 text-2xl font-bold text-white shadow-[0_10px_24px_-12px_rgba(35,79,59,.9)] active:bg-palm-deep">
            <Check className="text-3xl" /> {t('kiosk.done')}
          </button>
          <button type="button" onClick={() => onListen(startAnn, run)} aria-label={t('common.listen')}
            className="press grid w-24 place-items-center rounded-2xl bg-sun/20 text-4xl text-ink">
            <Speaker />
          </button>
        </div>
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
    <section aria-label={t('kiosk.later')} className={`${panel} p-3`}>
      <ul className="grid gap-2">
        {runs.map((r, i) => (
          <li key={r.plan_id} className="rise-in flex items-center gap-3 rounded-2xl bg-salt px-3 py-2"
            style={{ animationDelay: `${(i + 1) * STAGGER_MS}ms` }}>
            <CropArt crop={cropKeyOf(r)} className="size-14 shrink-0" />
            <div className="w-32 shrink-0">
              <div className="font-semibold">{r.block_name}</div>
              <div className="text-sm text-ink-soft">{pick(r.crop_names, lang)}</div>
            </div>
            {r.skip_reason ? (
              <div className="flex flex-1 items-center gap-2 text-lg text-water">
                {r.skip_reason === 'rain' ? <Rain label="rain" className="text-2xl" /> : <Check className="text-2xl" />}
                {r.skip_reason === 'rain' ? t('kiosk.skipRain') : t('kiosk.skipNoNeed')}
              </div>
            ) : (
              <>
                <div className="flex-1"><PipeBar steps={r.steps} lang={lang} compact /></div>
                <div className="num w-16 text-end text-lg text-ink-soft">{hhmm(r.start, tz)}</div>
                <div className="num w-14 text-end text-2xl font-bold">{r.minutes}</div>
                {r.done && <span className="pop grid size-9 place-items-center rounded-full bg-palm text-xl text-white"><Check label={t('kiosk.doneSaved')} /></span>}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The bundle's runs carry crop names, not keys; match the English name to the drawings. */
function cropKeyOf(r: KRun): string {
  const en = (r.crop_names.en ?? '').toLowerCase()
  if (en.includes('date')) return 'date_palm'
  if (en.includes('pepper')) return 'sweet_pepper'
  return en.replace(/\s+/g, '_')
}

function WaterPanel({ tanks, sources, lang, now, onAdd }: { tanks: KTank[]; sources: KSource[]; lang: Lang; now: number; onAdd: () => void }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('kiosk.water')} className={`${panel} rise-in p-4`} style={{ animationDelay: '80ms' }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xl font-bold"><DropIcon className="size-6" />{t('kiosk.water')}</h3>
        <button type="button" onClick={onAdd}
          className="press flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 font-semibold text-salt">
          <Plus /> {t('kiosk.addReading')}
        </button>
      </div>
      <div className="grid gap-3">
        {tanks.map((tk) => (
          <div key={tk.id} className="flex items-center gap-3 rounded-2xl bg-salt p-2">
            <TankArt pct={tk.level_pct} className="h-20 w-16 shrink-0" />
            <div className="flex-1">
              <div className="text-sm text-ink-soft">{tk.name}</div>
              {tk.level_pct === null ? (
                <div className="text-lg text-ink-soft">{t('empty.noReading')}</div>
              ) : (
                <div className={`num text-4xl font-bold ${tk.level_pct < 25 ? 'text-dune' : ''}`}>{Math.round(tk.level_pct)}%</div>
              )}
            </div>
            {tk.measured_at && <Age iso={tk.measured_at} now={now} />}
          </div>
        ))}
        {sources.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-salt px-3 py-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow-sm">
              <DropIcon className="size-7" color={s.tap_color} />
            </span>
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

function SoilPanel({ blocks, lang, tz, today }: { blocks: KBlock[]; lang: Lang; tz: string; today: string }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('kiosk.soil')} className={`${panel} rise-in p-4`} style={{ animationDelay: '140ms' }}>
      <h3 className="mb-2 flex items-center gap-2 text-xl font-bold"><SoilSprout status="ok" className="h-6 w-7" />{t('kiosk.soil')}</h3>
      <ul className="grid gap-2">
        {blocks.map((b) => {
          const due = b.next_test_due !== null && b.next_test_due <= today
          return (
            <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-salt px-3 py-2">
              <SoilSprout status={b.soil.status} className="h-10 w-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{b.name} <span className="font-normal text-ink-soft">· {pick(b.crop_names, lang)}</span></div>
                <div className={`text-sm ${b.soil.status === 'high' ? 'font-semibold text-brine' : b.soil.status === 'warn' ? 'text-dune' : 'text-ink-soft'}`}>
                  {b.soil.status === 'none' ? t('empty.noTest') : (
                    <>{t(`status.${b.soil.status}`)} · <span className="num">ECe {b.soil.ece?.toFixed(1)}</span></>
                  )}
                </div>
              </div>
              {b.next_test_due && (
                <div className={`rounded-xl px-2.5 py-1 text-end text-sm ${due ? 'bg-dune text-white' : 'bg-white'}`}>
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
