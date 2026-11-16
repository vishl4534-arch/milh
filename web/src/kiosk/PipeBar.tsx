import { useTranslation } from 'react-i18next'
import type { KStep, Lang } from '../api/types'
import { pick } from '../i18n'
import { DropIcon } from './art/Tank'

interface Props {
  steps: KStep[]
  lang: Lang
  progress?: number | null // 0..1 while the run is in progress
  compact?: boolean
  flowing?: boolean // water is running now: it visibly flows along the pipe
}

/** The run drawn as a length of pipe: one segment per tap, in that tap's real colour, sized by minutes.
 *  While water runs, light ripples flow along it and a drop marks how far the run has got.
 *  Always left-to-right: it is a timeline. */
export function PipeBar({ steps, lang, progress = null, compact = false, flowing = false }: Props) {
  const { t } = useTranslation()
  return (
    <div dir="ltr" className={`relative flex w-full rounded-full bg-line p-1 shadow-[inset_0_2px_4px_rgba(27,36,33,.18)] ${compact ? 'h-5' : 'h-[4.5rem]'}`}>
      {steps.map((s, i) => (
        <div key={`${s.source_id}-${i}`} data-testid="pipe-step"
          className={`relative flex min-w-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap text-white first:rounded-s-full last:rounded-e-full ${i > 0 ? 'ms-1' : ''}`}
          style={{ flexGrow: s.minutes, flexBasis: 0, background: s.tap_color }}
          title={`${pick(s.tap_label, lang)} · ${s.minutes} ${t('common.minutes')}`}>
          {/* the pipe's sheen */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-white/15" />
          {flowing && (
            <span aria-hidden className="flow pointer-events-none absolute inset-y-0 start-0 w-[200%]"
              style={{ background: 'repeating-linear-gradient(110deg, transparent 0 22px, rgba(255,255,255,.28) 22px 34px)' }} />
          )}
          {compact ? <span className="sr-only">{pick(s.tap_label, lang)} {s.minutes}</span> : (
            <span className="relative flex items-center gap-2">
              <span className="truncate text-lg font-semibold" dir="auto">{pick(s.tap_label, lang)}</span>
              <span className="num text-2xl font-bold">{s.minutes}</span>
            </span>
          )}
        </div>
      ))}
      {progress !== null && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 start-1 end-1">
          <div className="sun-glide h-full w-full" style={{ transform: `translateX(${Math.max(1, Math.min(99, progress * 100))}%)` }}>
            <span className="absolute top-1/2 -ms-4 -mt-4 grid size-8 place-items-center rounded-full bg-white shadow-md">
              <DropIcon className="size-5" />
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
