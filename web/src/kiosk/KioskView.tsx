import { useCallback, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { BundleState } from '../api/hooks'
import type { KAnnouncement, KBlock, KRun, KSource, KTank, Lang } from '../api/types'
import { Check, ChevronLeft, ChevronRight, Clock, Home, Leaf, Mic, Plus, Rain, Speaker, Warn, Wifi } from '../components/icons'
import { Bar, Card, EarthShell, FarmView, Rail, Stat, WeatherCard } from '../earth/Earth'
import { pick } from '../i18n'
import { ageText, dayMonth, hhmm, hoursSince, litres, localDay } from '../lib/format'
import { CropArt } from './art/CropArt'
import { DropIcon, SoilSprout, TankArt } from './art/Tank'
import { PipeBar } from './PipeBar'
import { MilhLogo } from '../brand/Logo'
import { greetingKey } from './greeting'

const LANG_LABEL: Record<string, string> = { en: 'EN', ur: 'اردو', ar: 'عربي', hi: 'हिंदी' }
const STAGGER_MS = 70

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

function scrollToId(id: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

export function KioskView(props: KioskViewProps) {
  const { state, lang, now } = props
  const { t } = useTranslation()
  const b = state.bundle
  const tz = b.farm.timezone
  const focus = focusRun(b.runs)
  const nextAnn = b.announcements.find((a) => a.status === 'scheduled' && Date.parse(a.scheduled_at) >= now) ?? null
  const [bursts, setBursts] = useState<Burst[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [section, setSection] = useState('today')
  const selected = b.runs.find((r) => r.plan_id === picked) ?? focus

  const burstAt = useCallback((e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const id = Date.now() + Math.random()
    setBursts((list) => [...list, { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }])
    window.setTimeout(() => setBursts((list) => list.filter((x) => x.id !== id)), 800)
  }, [])

  const go = (key: string) => { setSection(key); scrollToId(`k-${key}`) }
  const rail = (
    <Rail label="Milh" items={[
      { key: 'today', label: t('kiosk.home'), icon: <Home />, active: section === 'today', onClick: () => go('today') },
      { key: 'water', label: t('kiosk.water'), icon: <DropIcon className="size-6" color="currentColor" />, active: section === 'water', onClick: () => go('water') },
      { key: 'soil', label: t('kiosk.soil'), icon: <Leaf />, active: section === 'soil', onClick: () => go('soil') },
      { key: 'add', label: t('kiosk.addReading'), icon: <Plus />, onClick: props.onAddReading },
      { key: 'listen', label: t('common.listen'), icon: <Speaker />, onClick: () => props.onListen(nextAnn), disabled: !nextAnn, end: true },
      ...(props.canAsk && !state.offline
        ? [{ key: 'ask', label: t('kiosk.ask'), icon: <Mic />, accent: true, onClick: props.onAsk, end: true }] : []),
    ]} />
  )

  const doneCount = b.runs.filter((r) => r.done).length
  const workRuns = b.runs.filter((r) => r.steps.length > 0)
  const totalMin = workRuns.reduce((s, r) => s + r.minutes, 0)
  const usualMin = workRuns.reduce((s, r) => s + r.habit_minutes, 0)
  const saved = b.runs.reduce((s, r) => s + Math.max(0, r.saved_l), 0)

  return (
    <EarthShell rail={rail}>
      <TopBar {...props} />
      {b.day !== localDay(now, tz) && (
        <div role="alert" className="card-in rounded-2xl bg-brine/90 px-5 py-3 text-lg font-semibold text-white">
          {t('kiosk.notToday', { day: dayMonth(b.day, tz) })}
        </div>
      )}
      {props.soundBlocked && (
        <button type="button" onClick={props.onUnblockSound}
          className="press card-in flex items-center gap-3 rounded-2xl bg-dune px-5 py-3 text-start text-lg font-semibold text-white">
          <Speaker className="text-2xl" /> {t('kiosk.soundBlocked')}
        </button>
      )}

      <div id="k-today" className="grid scroll-mt-4 gap-3 md:gap-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2.4fr)]">
        <WeatherCard bundle={b} now={now} delay={60} />
        <FarmView ariaLabel={t('kiosk.now')} delay={120}
          top={b.runs.length > 1 ? <RunPicker runs={b.runs} selected={selected} onPick={setPicked} /> : undefined}>
          <RunPopover run={selected} focus={focus} hasRuns={b.runs.length > 0} onBurst={burstAt} {...props} />
        </FarmView>
      </div>

      <div id="k-water" className="grid scroll-mt-4 grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat delay={180} icon={<Clock />} label={t('kiosk.minutesToday')} value={totalMin} unit={t('common.minutes')}
          sub={usualMin > totalMin ? t('kiosk.instead', { n: usualMin }) : undefined}>
          <Bar value={b.runs.length ? doneCount / b.runs.length : 0} label={t('kiosk.doneOf', { done: doneCount, total: b.runs.length })} />
          <div className="mt-1.5 text-xs text-ink-soft">{t('kiosk.doneOf', { done: doneCount, total: b.runs.length })}</div>
        </Stat>
        <Stat delay={240} icon={<DropIcon className="size-5" color="currentColor" />} label={t('kiosk.savedToday')}
          value={saved > 0 ? litres(saved).replace(/\s?L$/, '') : '0'} unit="L" sub={t('kiosk.vsUsual')} tone="good" />
        <WaterSection tanks={b.tanks} sources={b.sources} lang={lang} now={now} onAdd={props.onAddReading} />
      </div>

      <div className="grid gap-3 md:gap-4 lg:grid-cols-3">
        <TasksCard runs={b.runs} tz={tz} lang={lang} selected={selected} onPick={(r) => { setPicked(r.plan_id); go('today') }} />
        <SoilCard blocks={b.blocks} lang={lang} tz={tz} today={b.day} />
        <AnnouncementsCard anns={b.announcements} tz={tz} lang={lang} now={now} onListen={props.onListen} />
      </div>
      {bursts.map((bu) => <DropBurst key={bu.id} x={bu.x} y={bu.y} />)}
    </EarthShell>
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
          <DropIcon className="size-6" color={i % 2 ? '#49a7e6' : '#8fd0ff'} />
        </span>
      ))}
    </div>
  )
}

function TopBar({ state, lang, now, onLang }: KioskViewProps) {
  const { t } = useTranslation()
  const b = state.bundle
  const tz = b.farm.timezone
  return (
    <header className="glass card-in flex flex-wrap items-center gap-3 rounded-[1.75rem] py-2.5 ps-4 pe-2.5">
      <MilhLogo color="#f7f8f4" className="h-9 w-auto shrink-0" />
      <div className="min-w-0 border-s border-white/10 ps-3">
        <div className="text-sm text-ink-soft">{t(greetingKey(now, tz))}</div>
        <div className="truncate text-lg font-semibold leading-tight">
          {b.farm.name}
          {b.farm.example_label && <span className="ms-2 rounded-full bg-white/10 px-2 py-0.5 align-middle text-xs font-normal text-ink-soft">example setup</span>}
        </div>
      </div>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        {state.offline && (
          <span className="flex items-center gap-1.5 rounded-full bg-dune px-3 py-1.5 text-sm font-semibold text-white">
            <Wifi /> {t('kiosk.offline', { time: hhmm(state.cachedAt, tz) })}
          </span>
        )}
        <span className="glass-chip num rounded-full px-3 py-1.5 text-base">{dayMonth(now, tz)} · {hhmm(now, tz)}</span>
        {b.farm.languages.length > 1 && (
          <div className="flex rounded-full bg-white/8 p-1 ring-1 ring-white/10" role="group" aria-label="Language">
            {b.farm.languages.map((l) => (
              <button key={l} type="button" onClick={() => onLang(l)} aria-pressed={l === lang}
                className={`press min-w-14 rounded-full px-4 py-1.5 text-base font-semibold transition-colors duration-200 ${l === lang ? 'bg-[#f7f8f4] text-[#0b0e07]' : 'text-ink-soft'}`}>
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

/** "‹ Block 2 ›" over the farm picture: step through today's blocks. */
function RunPicker({ runs, selected, onPick }: { runs: KRun[]; selected: KRun | null; onPick: (id: string) => void }) {
  const { t } = useTranslation()
  const i = selected ? runs.indexOf(selected) : -1
  const go = (d: number) => onPick(runs[(Math.max(0, i) + d + runs.length) % runs.length].plan_id)
  const btn = 'press glass-chip grid size-11 place-items-center rounded-full text-xl text-white'
  return (
    <div className="flex items-center gap-2" dir="ltr">
      <button type="button" className={btn} onClick={() => go(-1)} aria-label={t('kiosk.prevBlock')}><ChevronLeft /></button>
      <span key={selected?.plan_id ?? 'none'} className="fade-in min-w-28 rounded-full bg-[#f7f8f4] px-5 py-2 text-center text-base font-semibold text-[#0b0e07]">
        {selected?.block_name ?? '—'}
      </span>
      <button type="button" className={btn} onClick={() => go(1)} aria-label={t('kiosk.nextBlock')}><ChevronRight /></button>
    </div>
  )
}

/** The block's card over the farm picture: what to do now, for how long, from which taps, and DONE. */
function RunPopover({ run, focus, hasRuns, state, lang, now, onDone, onListen, onBurst }:
  KioskViewProps & { run: KRun | null; focus: KRun | null; hasRuns: boolean; onBurst: (e: MouseEvent<HTMLElement>) => void }) {
  const { t } = useTranslation()
  const tz = state.bundle.farm.timezone
  const shell = 'glass sheet-in w-full max-w-[34rem] rounded-[1.5rem] p-4 md:p-5'
  if (!run) {
    return (
      <div className={`${shell} grid place-items-center gap-2 py-10 text-center`}>
        <div className="pop grid size-20 place-items-center rounded-full bg-palm/20 text-5xl text-leaf"><Check /></div>
        <p className="text-2xl font-semibold">{hasRuns ? t('kiosk.allDone') : t('kiosk.noPlan')}</p>
      </div>
    )
  }
  const running = run.start !== null && Date.parse(run.start) <= now && (run.end === null || Date.parse(run.end) >= now)
  const overdue = run.end !== null && Date.parse(run.end) < now && !run.done
  const progress = running && run.start && run.end
    ? Math.min(1, (now - Date.parse(run.start)) / (Date.parse(run.end) - Date.parse(run.start))) : null
  const left = running && run.end ? Math.max(1, Math.ceil((Date.parse(run.end) - now) / 60000)) : null
  const startAnn = state.bundle.announcements.find((a) => a.plan_id === run.plan_id && a.type === 'irrigation_start') ?? null
  const block = state.bundle.blocks.find((b) => b.id === run.block_id)
  const skipped = run.steps.length === 0
  const badge = run.done ? 'bg-palm/25 text-leaf' : overdue ? 'bg-dune text-white' : running ? 'bg-water text-white' : 'bg-white/12 text-ink'
  const badgeText = run.done ? t('kiosk.doneSaved') : overdue ? t('kiosk.unconfirmed') : running ? t('kiosk.now') : run === focus ? t('kiosk.next') : t('kiosk.later')
  return (
    <div key={run.plan_id} className={shell}>
      <div className="flex items-start gap-3">
        <div className="relative hidden size-24 shrink-0 sm:block">
          <div aria-hidden className="absolute inset-x-1 bottom-0 h-8 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(234,217,181,.35)_0%,transparent_70%)]" />
          <CropArt crop={block?.crop_key ?? ''} sway={running} className="relative h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          {!skipped && (
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${badge}`}>
              {running && <span aria-hidden className="size-2 rounded-full bg-white twinkle" />}
              {badgeText}
            </span>
          )}
          <h2 className="mt-1.5 text-4xl font-bold leading-tight">{run.block_name}</h2>
          <div className="text-lg text-ink-soft">{pick(run.crop_names, lang)}</div>
        </div>
        {!skipped && (
          <div className="shrink-0 text-end">
            <div className="flex items-baseline justify-end gap-1">
              <span className="num text-6xl leading-none md:text-7xl">{run.minutes}</span>
              <span className="text-lg text-ink-soft">{t('common.minutes')}</span>
            </div>
            <div className="text-sm text-ink-soft"><span className="line-through">{t('kiosk.instead', { n: run.habit_minutes })}</span></div>
            {run.saved_l > 0 && (
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-water/15 px-2.5 py-0.5 text-sm text-water">
                <DropIcon className="size-4" color="currentColor" /> <span className="num">−{litres(run.saved_l)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {skipped ? (
        <SkipLine reason={run.skip_reason} className="mt-4 text-xl" />
      ) : (
        <>
          <div className="mt-4">
            <PipeBar steps={run.steps} lang={lang} progress={progress} flowing={running} />
            <div className="num mt-1.5 flex justify-between text-sm text-ink-soft" dir="ltr">
              <span>{hhmm(run.start, tz)}</span>
              {left !== null && <span className="font-semibold text-water">{t('kiosk.left', { n: left })}</span>}
              <span>{hhmm(run.end, tz)}</span>
            </div>
          </div>
          {run.flush && <p className="mt-3 rounded-xl bg-water/15 px-3 py-2 font-semibold text-water">{t('kiosk.flush')}</p>}
          <p className="mt-3 line-clamp-3 text-sm text-ink-soft">{pick(run.text, lang)}</p>
          <Fallbacks codes={run.fallbacks} />
          <div className="mt-4 flex gap-3">
            {run.done ? (
              <div className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-palm/20 py-4 text-xl font-semibold text-leaf">
                <Check className="text-2xl" /> {t('kiosk.doneSaved')}
              </div>
            ) : (
              <button type="button" onClick={(e) => { onBurst(e); onDone(run) }}
                className="press flex flex-1 items-center justify-center gap-3 rounded-2xl bg-palm py-4 text-2xl font-bold text-white shadow-[0_12px_28px_-12px_rgba(63,157,92,.95)] active:bg-palm-deep">
                <Check className="text-3xl" /> {t('kiosk.done')}
              </button>
            )}
            <button type="button" onClick={() => onListen(startAnn, run)} aria-label={t('common.listen')}
              className="press glass-chip grid w-20 place-items-center rounded-2xl text-3xl text-sun">
              <Speaker />
            </button>
          </div>
        </>
      )}
    </div>
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
  if (!shown.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {shown.map((c) => (
        <span key={c} className="flex items-center gap-1.5 rounded-full bg-dune/20 px-3 py-1 text-sm text-dune">
          <Warn /> {t(`fallback.${c}`, { defaultValue: c })}
        </span>
      ))}
    </div>
  )
}

/** Today's watering as a checklist (the reference's "Daily tasks"); a row opens that block above. */
function TasksCard({ runs, tz, lang, selected, onPick }: { runs: KRun[]; tz: string; lang: Lang; selected: KRun | null; onPick: (r: KRun) => void }) {
  const { t } = useTranslation()
  const done = runs.filter((r) => r.done).length
  return (
    <Card ariaLabel={t('kiosk.later')} title={t('kiosk.tasks')} icon={<Check />} delay={300}>
      {runs.length === 0 ? <p className="text-ink-soft">{t('kiosk.noPlan')}</p> : (
        <>
          <div className="mb-1 text-center text-sm text-ink-soft"><span className="num text-leaf">{done}</span> {t('kiosk.ofDone', { total: runs.length })}</div>
          <Bar value={done / runs.length} className="mb-3" />
          <ul className="grid gap-1.5">
            {runs.map((r, i) => (
              <li key={r.plan_id} className="card-in" style={{ animationDelay: `${360 + i * STAGGER_MS}ms` }}>
                <button type="button" onClick={() => onPick(r)}
                  className={`press flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-start transition-colors duration-200 ${r === selected ? 'bg-white/12' : 'hover:bg-white/5'}`}>
                  <CropArt crop={cropKeyOf(r)} className="size-11 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold ${r.done ? 'text-ink-soft line-through decoration-white/30' : ''}`}>{r.block_name}</div>
                    {r.skip_reason ? <SkipLine reason={r.skip_reason} className="text-sm" /> : (
                      <div className="text-sm text-ink-soft">{pick(r.crop_names, lang)} · <span className="num">{hhmm(r.start, tz)}</span></div>
                    )}
                  </div>
                  {!r.skip_reason && <span className="num text-xl">{r.minutes}<span className="ms-0.5 text-xs font-normal text-ink-soft">{t('common.minutes')}</span></span>}
                  <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-sm ${r.done ? 'bg-palm text-white' : 'ring-1 ring-white/20'}`}>
                    {r.done && <Check label={t('kiosk.doneSaved')} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

/** The bundle's runs carry crop names, not keys; match the English name to the drawings. */
function cropKeyOf(r: KRun): string {
  const en = (r.crop_names.en ?? '').toLowerCase()
  if (en.includes('date')) return 'date_palm'
  if (en.includes('pepper')) return 'sweet_pepper'
  return en.replace(/\s+/g, '_')
}

/** Tank and tap-water salt: the two water readings a worker can add. */
function WaterSection({ tanks, sources, lang, now, onAdd }: { tanks: KTank[]; sources: KSource[]; lang: Lang; now: number; onAdd: () => void }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('kiosk.water')} className="col-span-2 grid gap-3 md:grid-cols-2 md:gap-4">
      <div className="glass card-in flex flex-col gap-2 rounded-[1.75rem] p-4" style={{ animationDelay: '300ms' }}>
        <div className="flex items-center gap-2 text-sm font-medium text-ink-soft"><DropIcon className="size-5" color="currentColor" />{t('kiosk.tank')}</div>
        {tanks.length === 0 && <p className="text-ink-soft">{t('empty.noReading')}</p>}
        {tanks.map((tk) => (
          <div key={tk.id} className="flex items-center gap-3">
            <TankArt pct={tk.level_pct} className="h-[4.5rem] w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink-soft">{tk.name}</div>
              {tk.level_pct === null ? (
                <div className="text-lg text-ink-soft">{t('empty.noReading')}</div>
              ) : (
                <>
                  <div className={`num text-4xl leading-none ${tk.level_pct < 25 ? 'text-dune' : ''}`}>{Math.round(tk.level_pct)}%</div>
                  <Bar value={tk.level_pct / 100} color={tk.level_pct < 25 ? 'var(--color-dune)' : 'var(--color-water)'} className="mt-2" />
                </>
              )}
            </div>
            {tk.measured_at && <Age iso={tk.measured_at} now={now} />}
          </div>
        ))}
      </div>
      <div className="glass card-in flex flex-col gap-2 rounded-[1.75rem] p-4" style={{ animationDelay: '360ms' }}>
        <div className="flex items-center gap-2 text-sm font-medium text-ink-soft">
          <Warn className="text-base" />{t('kiosk.waterSalt')}
          <button type="button" onClick={onAdd} aria-label={t('kiosk.addReading')}
            className="press ms-auto grid size-9 place-items-center rounded-full bg-[#f7f8f4] text-lg text-[#0b0e07]"><Plus /></button>
        </div>
        {sources.map((s) => (
          <div key={s.id} className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8"><DropIcon className="size-6" color={s.tap_color} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-ink-soft">{pick(s.tap_label, lang) || s.name}</div>
              {s.ec === null ? (
                <div className="text-base text-ink-soft">{t('empty.noReading')}</div>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="num text-2xl">{s.ec.toFixed(1)}</span>
                  <span className="text-xs text-ink-soft">dS/m</span>
                  {s.trend === 'up' && <span className="text-dune" aria-label="rising">▲</span>}
                  {s.trend === 'down' && <span className="text-leaf" aria-label="falling">▼</span>}
                </div>
              )}
            </div>
            {s.stale && s.ec !== null && <Warn label="old reading" className="text-lg text-dune" />}
            {s.ec_measured_at && <Age iso={s.ec_measured_at} now={now} />}
          </div>
        ))}
      </div>
    </section>
  )
}

function Age({ iso, now }: { iso: string; now: number }) {
  const { t } = useTranslation()
  return <span className="shrink-0 text-xs text-ink-soft">{t('common.ago', { age: ageText(hoursSince(iso, now), t) })}</span>
}

/** Soil salt per block, as bars against the crop's own limit (the reference's "Soil analysis"). */
function SoilCard({ blocks, lang, tz, today }: { blocks: KBlock[]; lang: Lang; tz: string; today: string }) {
  const { t } = useTranslation()
  return (
    <Card id="k-soil" ariaLabel={t('kiosk.soil')} title={t('kiosk.soil')} icon={<SoilSprout status="ok" className="h-5 w-6" />} delay={360}>
      <ul className="grid gap-3">
        {blocks.map((b, i) => {
          const due = b.next_test_due !== null && b.next_test_due <= today
          const color = b.soil.status === 'high' ? 'var(--color-brine)' : b.soil.status === 'warn' ? 'var(--color-dune)' : 'var(--color-palm)'
          return (
            <li key={b.id} className="card-in" style={{ animationDelay: `${420 + i * STAGGER_MS}ms` }}>
              <div className="flex items-center gap-2.5">
                <SoilSprout status={b.soil.status} className="h-8 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{b.name} <span className="font-normal text-ink-soft">· {pick(b.crop_names, lang)}</span></span>
                    {b.soil.status !== 'none' && <span className="num shrink-0 text-sm">ECe {b.soil.ece?.toFixed(1)}</span>}
                  </div>
                  {b.soil.status === 'none' ? (
                    <div className="text-sm text-ink-soft">{t('empty.noTest')}</div>
                  ) : (
                    <>
                      <div className="relative mt-1.5">
                        <Bar value={(b.soil.ece ?? 0) / (b.salt_threshold * 1.5)} color={color} label={t(`status.${b.soil.status}`)} />
                        <span aria-hidden className="absolute -top-0.5 h-3 w-0.5 rounded bg-white/60" style={{ insetInlineStart: `${100 / 1.5}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-ink-soft">
                        <span style={{ color }}>{t(`status.${b.soil.status}`)}</span>
                        <span className="num">{t('kiosk.saltLimit', { n: b.salt_threshold.toFixed(1) })}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {b.next_test_due && (
                <div className={`mt-1.5 ms-12 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${due ? 'bg-dune text-white' : 'bg-white/8 text-ink-soft'}`}>
                  {due ? t('kiosk.testDue') : t('kiosk.nextTest')} · <span className="num">{dayMonth(b.next_test_due, tz)}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** The day's spoken announcements, next first; each can be played again. */
function AnnouncementsCard({ anns, tz, lang, now, onListen }: { anns: KAnnouncement[]; tz: string; lang: Lang; now: number; onListen: (a: KAnnouncement | null) => void }) {
  const { t } = useTranslation()
  const upcoming = anns.filter((a) => Date.parse(a.scheduled_at) >= now - 30 * 60_000)
  const shown = (upcoming.length ? upcoming : anns.slice(-4)).slice(0, 5)
  return (
    <Card title={t('kiosk.announcements')} icon={<Speaker />} delay={420}>
      {shown.length === 0 ? <p className="text-ink-soft">{t('kiosk.noAnnouncements')}</p> : (
        <ul className="grid gap-1.5">
          {shown.map((a, i) => (
            <li key={a.id} className="card-in flex items-center gap-3 rounded-2xl px-1 py-1.5" style={{ animationDelay: `${480 + i * STAGGER_MS}ms` }}>
              <span className="num w-12 shrink-0 text-sm text-sun">{hhmm(a.scheduled_at, tz)}</span>
              <span className={`min-w-0 flex-1 text-sm ${a.status === 'played' ? 'text-ink-soft' : ''}`}>{pick(a.text, lang)}</span>
              <button type="button" onClick={() => onListen(a)} aria-label={t('common.listen')}
                className="press grid size-10 shrink-0 place-items-center rounded-full bg-white/8 text-lg text-sun"><Speaker /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
