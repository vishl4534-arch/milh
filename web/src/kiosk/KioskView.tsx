import { useCallback, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { BundleState } from '../api/hooks'
import type { KAnnouncement, KBlock, KRun, KSource, KTank, Lang } from '../api/types'
import { Calendar, Check, MapPin, Mic, Plus, Rain, Speaker, Sprout, Sunrise, Sunset, Thermo, Warn, Wifi } from '../components/icons'
import { pick } from '../i18n'
import { ageText, dayMonth, hhmm, hoursSince, litres, localDay } from '../lib/format'
import { MilhLogo } from '../brand/Logo'
import { CropArt } from './art/CropArt'
import { DropIcon, SoilSprout, TankScene } from './art/Tank'
import { WaterDial, type DialState } from './WaterDial'

const LANG_LABEL: Record<string, string> = { en: 'EN', ur: 'اردو', ar: 'عربي', hi: 'हिंदी' }
const FORECAST_STALE_H = 6
const STAGGER_MS = 70
const TABS = ['today', 'water', 'soil'] as const
type Tab = (typeof TABS)[number]

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

function greetingKey(now: number, tz: string): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)))
  if (h < 5) return 'kiosk.greet_night'
  if (h < 12) return 'kiosk.greet_morning'
  if (h < 17) return 'kiosk.greet_afternoon'
  if (h < 20) return 'kiosk.greet_evening'
  return 'kiosk.greet_night'
}

export function KioskView(props: KioskViewProps) {
  const { state, lang, now } = props
  const { t, i18n } = useTranslation()
  const b = state.bundle
  const tz = b.farm.timezone
  const rtl = i18n.dir(lang) === 'rtl'
  const focus = focusRun(b.runs)
  const nextAnn = b.announcements.find((a) => a.status === 'scheduled' && Date.parse(a.scheduled_at) >= now) ?? null
  const [tab, setTab] = useState<Tab>('today')
  const [slide, setSlide] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [bursts, setBursts] = useState<Burst[]>([])
  const selected = b.runs.find((r) => r.plan_id === picked) ?? focus

  const burstAt = useCallback((e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const id = Date.now() + Math.random()
    setBursts((list) => [...list, { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }])
    window.setTimeout(() => setBursts((list) => list.filter((x) => x.id !== id)), 800)
  }, [])

  function go(next: Tab) {
    setSlide((TABS.indexOf(next) - TABS.indexOf(tab)) * (rtl ? -1 : 1))
    setTab(next)
  }
  const panelStyle = { ['--from' as string]: `${Math.sign(slide) * 24}px` } as CSSProperties

  return (
    <div className="kiosk">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col gap-4 px-4 pt-4 pb-3 md:px-8">
        <TopBar {...props} />
        {b.day !== localDay(now, tz) && (
          <div role="alert" className="card-in rounded-2xl bg-brine px-5 py-3 text-lg font-bold text-white">
            {t('kiosk.notToday', { day: dayMonth(b.day, tz) })}
          </div>
        )}
        {props.soundBlocked && (
          <button type="button" onClick={props.onUnblockSound}
            className="press card-in flex items-center gap-3 rounded-2xl bg-dune px-5 py-3 text-start text-lg font-bold text-white">
            <Speaker className="text-2xl" /> {t('kiosk.soundBlocked')}
          </button>
        )}
        <TabBar tab={tab} onTab={go} rtl={rtl} />

        <main className="flex-1">
          {tab === 'today' && (
            <div key="today" className="panel-in grid h-full gap-4 md:gap-5 lg:grid-cols-[1.45fr_1fr]" style={panelStyle}>
              <JobCard run={selected} focus={focus} hasRuns={b.runs.length > 0} onBurst={burstAt} {...props} />
              <Timeline runs={b.runs} tz={tz} lang={lang} selected={selected} onPick={(r) => setPicked(r.plan_id)} />
            </div>
          )}
          {tab === 'water' && (
            <div key="water" className="panel-in h-full" style={panelStyle}>
              <WaterTab tanks={b.tanks} sources={b.sources} lang={lang} now={now} onAdd={props.onAddReading} />
            </div>
          )}
          {tab === 'soil' && (
            <div key="soil" className="panel-in h-full" style={panelStyle}>
              <SoilTab blocks={b.blocks} lang={lang} tz={tz} today={b.day} />
            </div>
          )}
        </main>

        <Dock nextAnn={nextAnn} run={selected} tz={tz} lang={lang} canAsk={!!props.canAsk && !state.offline} onAsk={props.onAsk} onListen={props.onListen} />
      </div>
      {bursts.map((bu) => <DropBurst key={bu.id} x={bu.x} y={bu.y} />)}
    </div>
  )
}

/** DONE celebration: water drops fly out from the button (rare, so it may delight). */
function DropBurst({ x, y }: { x: number; y: number }) {
  const drops = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    const d = 80 + (i % 3) * 26
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 24 }
  })
  return (
    <div aria-hidden className="pointer-events-none fixed z-40" style={{ left: x, top: y }}>
      {drops.map((d, i) => (
        <span key={i} className="drop-burst absolute -ms-3 -mt-3 block size-6"
          style={{ ['--dx' as string]: `${d.dx}px`, ['--dy' as string]: `${d.dy}px`, animationDelay: `${(i % 3) * 25}ms` }}>
          <DropIcon className="size-6" color={i % 2 ? '#2e86c1' : '#7fc4ec'} />
        </span>
      ))}
    </div>
  )
}

function Divider() {
  return <span aria-hidden className="hidden h-8 w-px bg-[var(--k-ink)]/10 sm:block" />
}

function TopBar({ state, lang, now, onLang }: KioskViewProps) {
  const { t } = useTranslation()
  const b = state.bundle
  const tz = b.farm.timezone
  const today = b.weather?.daily.find((d) => d.day === b.day)
  const temp = b.weather?.current.temperature_2m
  return (
    <header className="card-in flex flex-wrap items-center gap-x-5 gap-y-3">
      <MilhLogo className="h-10 w-auto shrink-0" />
      <Divider />
      <span className="text-xl font-extrabold">{t(greetingKey(now, tz))}</span>
      <Divider />
      <span className="flex min-w-0 items-center gap-1.5 text-lg text-[var(--k-muted)]">
        <MapPin className="shrink-0 text-xl" />
        <span className="truncate font-semibold">{b.farm.name}</span>
        {b.farm.example_label && <span className="ms-1 rounded-md bg-[var(--k-sand-soft)] px-2 py-0.5 text-xs">example setup</span>}
      </span>
      <div className="ms-auto flex flex-wrap items-center gap-x-5 gap-y-2">
        {state.offline && (
          <span className="flex items-center gap-1.5 rounded-full bg-dune px-3.5 py-1.5 text-sm font-bold text-white">
            <Wifi /> {t('kiosk.offline', { time: hhmm(state.cachedAt, tz) })}
          </span>
        )}
        {b.weather ? (
          <span className="flex items-center gap-3 text-base text-[var(--k-muted)]">
            <span className="flex items-center gap-1"><Thermo className="text-lg text-dune" />
              <span className="num text-lg font-bold text-[var(--k-ink)]">{typeof temp === 'number' ? Math.round(temp) : '–'}°</span>
              {today && <span className="num">/ {Math.round(today.tmax_c)}°</span>}
            </span>
            {b.sun && (
              <>
                <span className="flex items-center gap-1" title={t('kiosk.sunrise')}><Sunrise className="text-xl text-dune" /><span className="num">{hhmm(b.sun.sunrise, tz)}</span></span>
                <span className="flex items-center gap-1" title={t('kiosk.sunset')}><Sunset className="text-xl" /><span className="num">{hhmm(b.sun.sunset, tz)}</span></span>
              </>
            )}
            {b.weather.age_h > FORECAST_STALE_H && (
              <span className="rounded-full bg-dune px-3 py-0.5 text-sm font-bold text-white">{t('kiosk.forecastAge', { age: ageText(b.weather.age_h, t) })}</span>
            )}
          </span>
        ) : (
          <span className="text-base text-[var(--k-muted)]">{t('empty.noForecast')}</span>
        )}
        <span className="num text-3xl font-extrabold">{hhmm(now, tz)}</span>
        {b.farm.languages.length > 1 && (
          <div role="group" aria-label={t('kiosk.lang')} className="flex items-center rounded-full bg-[var(--k-sand)] p-1">
            {b.farm.languages.map((l) => (
              <button key={l} type="button" onClick={() => onLang(l)} aria-pressed={l === lang}
                className={`press min-w-14 rounded-full px-4 py-1.5 text-lg font-bold transition-colors duration-200 ${l === lang ? 'bg-white text-[var(--k-ink)] shadow-sm' : 'text-[var(--k-ink)]/60'}`}>
                {LANG_LABEL[l] ?? l}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="sr-only">{hoursSince(b.generated_at, now)}</span>
    </header>
  )
}

/** Three big tabs; the green pill glides to the chosen one. */
function TabBar({ tab, onTab, rtl }: { tab: Tab; onTab: (t: Tab) => void; rtl: boolean }) {
  const { t } = useTranslation()
  const idx = TABS.indexOf(tab)
  const icons: Record<Tab, ReactNode> = { today: <Calendar />, water: <DropIcon className="size-6" color="currentColor" />, soil: <Sprout /> }
  const labels: Record<Tab, string> = { today: t('kiosk.today'), water: t('kiosk.water'), soil: t('kiosk.soil') }
  return (
    <div role="tablist" aria-label={t('kiosk.tabs')}
      className="card-in relative mx-auto grid w-full max-w-5xl grid-cols-[repeat(3,minmax(0,1fr))] rounded-[1.5rem] bg-white p-1.5 shadow-[0_14px_34px_-24px_rgba(92,74,40,.45)]"
      style={{ animationDelay: '60ms' }}>
      <span aria-hidden className="tab-glide absolute inset-y-1.5 start-1.5 w-[calc((100%-0.75rem)/3)] rounded-[1.15rem] bg-[var(--k-green)] shadow-[0_10px_22px_-12px_rgba(47,107,79,.9)]"
        style={{ transform: `translateX(${(rtl ? -1 : 1) * idx * 100}%)` }} />
      {TABS.map((k) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => onTab(k)}
          className={`press relative z-10 flex items-center justify-center gap-1.5 rounded-[1.15rem] py-2.5 text-lg font-extrabold sm:gap-2.5 sm:text-xl transition-colors duration-300 md:text-2xl ${tab === k ? 'text-white' : 'text-[var(--k-ink)]'}`}>
          <span className="text-xl sm:text-2xl">{icons[k]}</span>{labels[k]}
        </button>
      ))}
    </div>
  )
}

/** Which tap step is flowing right now, from the minutes since the run started. */
function activeStep(run: KRun, now: number): number {
  if (!run.start) return -1
  let t = (now - Date.parse(run.start)) / 60000
  if (t < 0) return -1
  for (let i = 0; i < run.steps.length; i++) {
    t -= run.steps[i].minutes
    if (t < 0) return i
  }
  return -1
}

/** The job card: what to water, how long (the dial), from which taps, and DONE. */
function JobCard({ run, focus, hasRuns, state, lang, now, onDone, onListen, onBurst }:
  KioskViewProps & { run: KRun | null; focus: KRun | null; hasRuns: boolean; onBurst: (e: MouseEvent<HTMLElement>) => void }) {
  const { t } = useTranslation()
  const [why, setWhy] = useState(false)
  const tz = state.bundle.farm.timezone
  if (!run) {
    return (
      <section aria-label={t('kiosk.now')} className="k-card card-in grid place-items-center gap-4 p-10 text-center" style={{ animationDelay: '120ms' }}>
        <div className="pop grid size-28 place-items-center rounded-full bg-[var(--k-green-soft)] text-6xl text-[var(--k-green)]"><Check /></div>
        <p className="text-3xl font-extrabold">{hasRuns ? t('kiosk.allDone') : t('kiosk.noPlan')}</p>
      </section>
    )
  }
  const started = run.start !== null && Date.parse(run.start) <= now
  const ended = run.end !== null && Date.parse(run.end) < now
  const running = started && !ended
  const overdue = ended && !run.done
  const progress = run.start && run.end ? (now - Date.parse(run.start)) / (Date.parse(run.end) - Date.parse(run.start)) : 0
  const left = running && run.end ? Math.max(1, Math.ceil((Date.parse(run.end) - now) / 60000)) : null
  const dial: DialState = run.done ? 'done' : overdue ? 'overdue' : running ? 'running' : 'upcoming'
  const startAnn = state.bundle.announcements.find((a) => a.plan_id === run.plan_id && a.type === 'irrigation_start') ?? null
  const block = state.bundle.blocks.find((x) => x.id === run.block_id)
  const skipped = run.steps.length === 0
  const flowing = running ? activeStep(run, now) : -1
  const badge = run.done ? ['bg-[var(--k-green-soft)] text-[var(--k-green)]', t('kiosk.doneSaved')]
    : overdue ? ['bg-dune text-white', t('kiosk.unconfirmed')]
      : running ? ['bg-water text-white', t('kiosk.now')]
        : run === focus ? ['bg-[var(--k-sand)] text-[var(--k-ink)]', t('kiosk.next')] : ['bg-[var(--k-sand-soft)] text-[var(--k-muted)]', t('kiosk.later')]
  return (
    <section key={run.plan_id} aria-label={t('kiosk.now')} className="k-card card-in flex flex-col p-6 md:px-8 md:py-6" style={{ animationDelay: '120ms' }}>
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
        <div className="flex h-full min-w-0 flex-col">
          {!skipped && (
            <span className={`inline-flex items-center gap-2 self-start whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider md:px-3.5 md:text-sm ${badge[0]}`}>
              {running && <span aria-hidden className="twinkle size-2 rounded-full bg-white" />}{badge[1]}
            </span>
          )}
          <h2 className="mt-2 text-4xl font-black leading-[1.05] tracking-tight md:text-5xl">{run.block_name}</h2>
          <p className="mt-1 text-2xl font-semibold text-[var(--k-muted)]">{pick(run.crop_names, lang)}</p>
          <div className="relative mt-1 flex min-h-32 flex-1 items-end justify-center">
            <div aria-hidden className="absolute inset-x-6 bottom-1 h-8 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(138,100,64,.18)_0%,transparent_70%)]" />
            <CropArt crop={block?.crop_key ?? ''} sway={running || dial === 'upcoming'} className="relative h-full max-h-40 w-full" />
          </div>
        </div>
        {!skipped && (
          <WaterDial minutes={run.minutes} progress={progress} state={dial} unit={t('common.minutes')}
            className="w-[clamp(9rem,36vw,11rem)] md:w-[clamp(11rem,20vw,15rem)]"
            sub={left !== null ? t('kiosk.left', { n: left }) : dial === 'upcoming' && run.start ? t('kiosk.startsAt', { time: hhmm(run.start, tz) }) : null} />
        )}
      </div>

      {skipped ? (
        <SkipLine reason={run.skip_reason} className="mt-4 justify-center text-2xl font-bold" />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-[var(--k-muted)]">
            <span className="line-through">{t('kiosk.instead', { n: run.habit_minutes })}</span>
            {run.saved_l > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-water/10 px-3 py-0.5 font-semibold text-water">
                <DropIcon className="size-4" color="currentColor" /> {t('kiosk.saves', { l: litres(run.saved_l) })}
              </span>
            )}
            {run.flush && <span className="rounded-full bg-water/10 px-3 py-0.5 font-semibold text-water">{t('kiosk.flush')}</span>}
            <Fallbacks codes={run.fallbacks} />
            <button type="button" onClick={() => setWhy((w) => !w)} aria-expanded={why}
              className="ms-auto text-sm font-bold underline-offset-4 hover:underline">{t('kiosk.why')}</button>
            <button type="button" onClick={() => onListen(startAnn, run)} aria-label={t('common.listen')}
              className="press grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--k-sand)] text-xl text-[var(--k-ink)]">
              <Speaker />
            </button>
          </div>
          <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(run.steps.length, 3)}, minmax(0, 1fr))` }}>
            {run.steps.map((s, i) => (
              <div key={`${s.source_id}-${i}`} data-testid="pipe-step"
                className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-xl font-extrabold transition-shadow duration-300 ${flowing === i ? 'ring-[3px]' : ''}`}
                style={{ background: `color-mix(in srgb, ${s.tap_color} 16%, white)`, ['--tw-ring-color' as string]: s.tap_color }}>
                <span aria-hidden className={`size-3 shrink-0 rounded-full ${flowing === i ? 'twinkle' : ''}`} style={{ background: s.tap_color }} />
                <span className="truncate">{pick(s.tap_label, lang)}</span>
                <span aria-hidden>·</span>
                <span className="num whitespace-nowrap">{s.minutes}</span>
                <span className="text-base font-bold">{t('common.minutes')}</span>
              </div>
            ))}
          </div>
          {why && <p className="fade-in mt-2 max-w-prose text-sm leading-relaxed text-[var(--k-muted)]">{pick(run.text, lang)}</p>}
          <div className="mt-3">
            {run.done ? (
              <div className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-[var(--k-green-soft)] text-2xl font-extrabold text-[var(--k-green)]">
                <Check className="text-3xl" /> {t('kiosk.doneSaved')}
              </div>
            ) : (
              <button type="button" onClick={(e) => { onBurst(e); onDone(run) }}
                className="press flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[var(--k-green)] text-2xl font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(47,107,79,.95)] active:bg-palm-deep">
                <Check className="text-3xl" /> {t('kiosk.done')}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function SkipLine({ reason, className = '' }: { reason: KRun['skip_reason']; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={`flex items-center gap-2 text-water ${className}`}>
      {reason === 'rain' ? <Rain label="rain" className="text-2xl" /> : <Check className="text-2xl" />}
      {reason === 'rain' ? t('kiosk.skipRain') : t('kiosk.skipNoNeed')}
    </div>
  )
}

function Fallbacks({ codes }: { codes: string[] }) {
  const { t } = useTranslation()
  const shown = [...new Set(codes.map((c) => c.split(':')[0]))]
  return (
    <>
      {shown.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-dune/12 px-3 py-0.5 font-semibold text-dune">
          <Warn /> {t(`fallback.${c}`, { defaultValue: c })}
        </span>
      ))}
    </>
  )
}

/** Today's blocks on a vertical line: ticks for done, a ring for the current one. A row opens that block. */
function Timeline({ runs, tz, lang, selected, onPick }: { runs: KRun[]; tz: string; lang: Lang; selected: KRun | null; onPick: (r: KRun) => void }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('kiosk.later')} className="k-card card-in flex flex-col p-6 md:p-8" style={{ animationDelay: '180ms' }}>
      <h3 className="mb-4 text-4xl font-black tracking-tight">{t('kiosk.today')}</h3>
      {runs.length === 0 ? <p className="text-xl text-[var(--k-muted)]">{t('kiosk.noPlan')}</p> : (
        <ol className="flex flex-col gap-1">
          {runs.map((r, i) => {
            const current = r === selected
            const last = i === runs.length - 1
            return (
              <li key={r.plan_id} className="card-in relative" style={{ animationDelay: `${240 + i * STAGGER_MS}ms` }}>
                {!last && <span aria-hidden className={`absolute start-[2.1rem] top-[3.4rem] bottom-[-0.9rem] w-[3px] rounded-full ${r.done ? 'bg-[var(--k-green)]' : 'bg-[var(--k-sand)]'}`} />}
                <button type="button" onClick={() => onPick(r)}
                  className={`press grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl px-3 py-3 text-start transition-colors duration-300 ${current ? 'bg-[var(--k-green-soft)]' : 'hover:bg-[var(--k-sand-soft)]'}`}>
                  <span className={`relative grid size-11 place-items-center rounded-full text-xl ${
                    r.done ? 'bg-[var(--k-green)] text-white'
                      : r.skip_reason ? 'bg-water/12 text-water'
                        : current ? 'border-[5px] border-[var(--k-green)] bg-white' : 'border-[3px] border-[var(--k-sand)] bg-white'}`}>
                    {r.done && <Check label={t('kiosk.doneSaved')} />}
                    {!r.done && r.skip_reason === 'rain' && <Rain />}
                  </span>
                  <span className="min-w-0">
                    <span className="num block text-base font-semibold text-[var(--k-muted)]">{r.start ? hhmm(r.start, tz) : '—'}</span>
                    <span className="block truncate text-2xl font-extrabold leading-tight">{r.block_name}</span>
                    {r.skip_reason ? <SkipLine reason={r.skip_reason} className="text-base font-semibold" />
                      : <span className="block truncate text-lg text-[var(--k-muted)]">{pick(r.crop_names, lang)}</span>}
                  </span>
                  {!r.skip_reason && (
                    <span className="num whitespace-nowrap rounded-xl bg-[var(--k-sand-soft)] px-3.5 py-2 text-xl font-extrabold">
                      {r.minutes} <span className="text-base font-bold">{t('common.minutes')}</span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function Age({ iso, now, className = '' }: { iso: string; now: number; className?: string }) {
  const { t } = useTranslation()
  return <span className={`text-[var(--k-muted)] ${className}`}>{t('common.ago', { age: ageText(hoursSince(iso, now), t) })}</span>
}

/** Water tab: the tank as a picture with its level, one tile per tap with its salt, and Add reading. */
function WaterTab({ tanks, sources, lang, now, onAdd }: { tanks: KTank[]; sources: KSource[]; lang: Lang; now: number; onAdd: () => void }) {
  const { t } = useTranslation()
  const [main, ...others] = tanks
  return (
    <section aria-label={t('kiosk.water')} className="grid h-full gap-4 md:gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="k-card card-in flex flex-col justify-center p-6 md:p-8">
        {!main ? <p className="text-center text-2xl text-[var(--k-muted)]">{t('empty.noReading')}</p> : (
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <TankScene pct={main.level_pct} className="mx-auto w-full max-w-[22rem]" />
            <div>
              {main.level_pct === null ? (
                <div className="text-3xl font-extrabold text-[var(--k-muted)]">{t('empty.noReading')}</div>
              ) : (
                <div className={`num text-[clamp(4rem,9vw,7rem)] font-black leading-none ${main.level_pct < 25 ? 'text-dune' : ''}`}>{Math.round(main.level_pct)}%</div>
              )}
              <div className="mt-3 text-xl text-[var(--k-muted)]">
                {main.name}{main.measured_at && <> · <Age iso={main.measured_at} now={now} /></>}
              </div>
            </div>
          </div>
        )}
        {others.map((tk) => (
          <div key={tk.id} className="mt-4 flex items-center justify-between rounded-2xl bg-[var(--k-sand-soft)] px-5 py-3 text-lg">
            <span className="font-semibold">{tk.name}</span>
            {tk.level_pct === null ? <span className="text-[var(--k-muted)]">{t('empty.noReading')}</span>
              : <span className="num text-2xl font-extrabold">{Math.round(tk.level_pct)}%</span>}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 md:gap-5">
        {sources.map((s, i) => (
          <div key={s.id} className="k-card card-in grid grid-cols-[auto_1px_minmax(0,1fr)] items-center gap-5 p-6"
            style={{ animationDelay: `${120 + i * STAGGER_MS}ms` }}>
            <DropIcon className="size-16" color={s.tap_color} />
            <span aria-hidden className="h-full w-px bg-[var(--k-ink)]/10" />
            <div className="min-w-0">
              <div className="truncate text-2xl font-extrabold">{pick(s.tap_label, lang) || s.name}</div>
              {s.ec === null ? (
                <div className="mt-1 text-2xl text-[var(--k-muted)]">{t('empty.noReading')}</div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="num text-5xl font-black">{s.ec.toFixed(1)}</span>
                  <span className="text-2xl font-extrabold">dS/m</span>
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-lg">
                {s.trend === 'up' && <span className="text-dune" aria-label="rising">▲</span>}
                {s.trend === 'down' && <span className="text-palm" aria-label="falling">▼</span>}
                {s.stale && s.ec !== null && <Warn label="old reading" className="text-dune" />}
                {s.ec_measured_at && <Age iso={s.ec_measured_at} now={now} />}
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={onAdd}
          className="press card-in flex h-20 items-center justify-center gap-3 rounded-[1.5rem] bg-[var(--k-green)] text-3xl font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(47,107,79,.95)]"
          style={{ animationDelay: '260ms' }}>
          <Plus /> {t('kiosk.addReading')}
        </button>
      </div>
    </section>
  )
}

/** Soil tab: one roomy row per block, salt as a bar against the crop's own limit. */
function SoilTab({ blocks, lang, tz, today }: { blocks: KBlock[]; lang: Lang; tz: string; today: string }) {
  const { t } = useTranslation()
  const SCALE = 1.25 // the bar runs to 125% of the crop's limit, so the limit sits at 80%
  return (
    <section aria-label={t('kiosk.soil')} className="flex flex-col gap-4">
      {blocks.map((b, i) => {
        const due = b.next_test_due !== null && b.next_test_due <= today
        const color = b.soil.status === 'high' ? 'var(--color-brine)' : b.soil.status === 'warn' ? '#e0962f' : '#3f8a3a'
        return (
          <div key={b.id} className="k-card card-in grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 p-5 md:grid-cols-[auto_1px_minmax(0,1fr)_auto] md:gap-7 md:px-8"
            style={{ animationDelay: `${80 + i * STAGGER_MS}ms` }}>
            <div className="relative">
              <CropArt crop={b.crop_key} className="size-24 md:size-28" />
              <SoilSprout status={b.soil.status} className="absolute -bottom-1 end-0 h-8 w-10" />
            </div>
            <span aria-hidden className="hidden h-24 w-px bg-[var(--k-ink)]/10 md:block" />
            <div className="min-w-0">
              <div className="truncate text-2xl font-black md:text-3xl">{b.name} <span className="font-semibold text-[var(--k-ink)]/80">· {pick(b.crop_names, lang)}</span></div>
              <div className="mt-2 grid items-end gap-x-6 gap-y-2 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <div>
                  <div className="text-base text-[var(--k-muted)]">{t('kiosk.soilSalt')}</div>
                  {b.soil.status === 'none' ? (
                    <div className="text-3xl font-extrabold text-[var(--k-muted)]">{t('empty.noTest')}</div>
                  ) : (
                    <div className="num text-3xl font-black md:text-4xl" style={{ color }}>
                      {b.soil.ece?.toFixed(1)} <span className="text-2xl">dS/m</span>
                      <span className="ms-2 align-middle text-base font-bold">{t(`status.${b.soil.status}`)}</span>
                    </div>
                  )}
                </div>
                <div className="relative pt-9">
                  <span className="num absolute top-0 -translate-x-1/2 text-center text-sm leading-tight text-[var(--k-muted)] rtl:translate-x-1/2"
                    style={{ insetInlineStart: `${100 / SCALE}%` }}>
                    {t('kiosk.cropLimit')}<br />{b.salt_threshold.toFixed(1)} dS/m
                  </span>
                  <div className="relative h-4 overflow-hidden rounded-full bg-[var(--k-sand-soft)]">
                    {b.soil.ece !== null && b.soil.status !== 'none' && (
                      <div className="grow-x h-full rounded-full" style={{ width: `${Math.min(100, (b.soil.ece / (b.salt_threshold * SCALE)) * 100)}%`, background: color, animationDelay: `${200 + i * STAGGER_MS}ms` }} />
                    )}
                  </div>
                  <span aria-hidden className="absolute bottom-[-6px] h-7 w-[3px] -translate-x-1/2 rounded-full bg-[var(--k-ink)]/80 rtl:translate-x-1/2"
                    style={{ insetInlineStart: `${100 / SCALE}%` }} />
                </div>
              </div>
            </div>
            {b.next_test_due && (
              <div className={`col-span-2 flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-bold md:col-span-1 ${due ? 'bg-dune text-white' : 'bg-[var(--k-sand)]'}`}>
                <Calendar className="text-xl" />
                {due ? t('kiosk.testDue') : t('kiosk.nextTest')} · <span className="num">{dayMonth(b.next_test_due, tz)}</span>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

/** The bar at the bottom: replay the next announcement, see what it says, and ask by voice. */
function Dock({ nextAnn, run, tz, lang, canAsk, onAsk, onListen }: {
  nextAnn: KAnnouncement | null; run: KRun | null; tz: string; lang: Lang; canAsk: boolean; onAsk?: () => void
  onListen: (a: KAnnouncement | null, run?: KRun) => void
}) {
  const { t } = useTranslation()
  return (
    <footer className="k-card card-in sticky bottom-3 z-10 flex items-center gap-4 p-3 md:p-3.5" style={{ animationDelay: '240ms' }}>
      {/* The next announcement; with none left today, the job on screen is read instead. */}
      <button type="button" onClick={() => (nextAnn ? onListen(nextAnn) : onListen(null, run ?? undefined))}
        disabled={!nextAnn && !run} aria-label={t('common.listen')}
        className="press grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--k-sand)] text-3xl disabled:opacity-40">
        <Speaker />
      </button>
      <span aria-hidden className="h-10 w-px shrink-0 bg-[var(--k-ink)]/10" />
      <p className="min-w-0 flex-1 truncate text-xl">
        {nextAnn ? (
          <><span className="font-extrabold text-[var(--k-green)]">{t('kiosk.nextLabel')}</span> <span className="num font-semibold">{hhmm(nextAnn.scheduled_at, tz)}</span> {pick(nextAnn.text, lang)}</>
        ) : <span className="text-[var(--k-muted)]">{t('kiosk.noAnnouncements')}</span>}
      </p>
      {canAsk && (
        <span className="relative shrink-0">
          <span aria-hidden className="ring absolute inset-0 rounded-full bg-[var(--k-green)]" />
          <button type="button" onClick={onAsk}
            className="press relative flex items-center gap-2.5 rounded-full bg-[var(--k-green)] px-7 py-3.5 text-2xl font-extrabold text-white shadow-[0_12px_26px_-12px_rgba(47,107,79,.9)]">
            <Mic className="text-2xl" /> {t('kiosk.ask')}
          </button>
        </span>
      )}
    </footer>
  )
}
