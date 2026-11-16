import { useTranslation } from 'react-i18next'
import type { KStep, Lang } from '../api/types'
import { pick } from '../i18n'

interface Props {
  steps: KStep[]
  lang: Lang
  progress?: number | null // 0..1 while the run is in progress
  compact?: boolean
}

/** The run drawn as a length of pipe: one segment per tap, in that tap's real colour, sized by minutes.
 *  A bead travels along it while water is flowing. Always left-to-right: it is a timeline. */
export function PipeBar({ steps, lang, progress = null, compact = false }: Props) {
  const { t } = useTranslation()
  return (
    <div dir="ltr" className={`relative flex w-full overflow-hidden rounded-full bg-line ${compact ? 'h-4' : 'h-16'}`}>
      {steps.map((s, i) => (
        <div key={`${s.source_id}-${i}`} data-testid="pipe-step"
          className={`flex min-w-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap text-white ${i > 0 ? 'border-s-4 border-salt' : ''}`}
          style={{ flexGrow: s.minutes, flexBasis: 0, background: s.tap_color }}
          title={`${pick(s.tap_label, lang)} · ${s.minutes} ${t('common.minutes')}`}>
          {compact ? <span className="sr-only">{pick(s.tap_label, lang)} {s.minutes}</span> : (
            <>
              <span className="truncate text-lg font-semibold" dir="auto">{pick(s.tap_label, lang)}</span>
              <span className="num text-2xl font-bold">{s.minutes}</span>
            </>
          )}
        </div>
      ))}
      {progress !== null && (
        <div aria-hidden className="absolute inset-y-1 w-2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(27,36,33,.55)] transition-[left] duration-1000"
          style={{ left: `${Math.max(1, Math.min(99, progress * 100))}%` }} />
      )}
    </div>
  )
}
