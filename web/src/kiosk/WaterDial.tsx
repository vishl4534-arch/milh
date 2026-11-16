import { useId, type ReactNode } from 'react'

export type DialState = 'upcoming' | 'running' | 'overdue' | 'done'

const R = 104 // ring radius
const C = 2 * Math.PI * R
const INNER = 90 // water circle radius
const TOP = 120 - INNER
const SPAN = INNER * 2

/** The signature of the tablet: the run's minutes inside a ring that fills, with water rising in the circle
 *  as the watering goes on. Upcoming: an empty ring and a little water. Overdue: full ring in amber. */
export function WaterDial({ minutes, progress, state, unit, sub, className = '' }: {
  minutes: number; progress: number; state: DialState; unit: string; sub?: ReactNode; className?: string
}) {
  const clip = `dial-${useId().replace(/:/g, '')}`
  const p = state === 'done' || state === 'overdue' ? 1 : Math.max(0, Math.min(1, progress))
  const water = state === 'upcoming' ? 0.08 : Math.max(0.08, p)
  const ring = state === 'overdue' ? '#d98a2b' : '#2f6b4f'
  const y = TOP + SPAN * (1 - water)
  return (
    <div className={`relative aspect-square ${className}`}>
      <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <clipPath id={clip}><circle cx="120" cy="120" r={INNER} /></clipPath>
          <linearGradient id={`${clip}-w`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bfe3f8" />
            <stop offset="100%" stopColor="#7fc4ec" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r={INNER} fill="#f8fbfd" />
        <g clipPath={`url(#${clip})`}>
          <g style={{ transform: `translateY(${y}px)`, transition: 'transform 900ms var(--ease-out)' }}>
            <g className="fill-up" style={{ ['--rise' as string]: `${SPAN}px` }}>
              <g className="wave" style={{ animationDuration: '4.5s' }}>
                <path d="M0 0 Q30 -9 60 0 T120 0 T180 0 T240 0 T300 0 T360 0 T420 0 T480 0 V240 H0Z" fill={`url(#${clip}-w)`} opacity="0.95" />
              </g>
              <g className="wave" style={{ animationDuration: '7s', animationDirection: 'reverse' }}>
                <path d="M0 6 Q30 -2 60 6 T120 6 T180 6 T240 6 T300 6 T360 6 T420 6 T480 6 V240 H0Z" fill="#9fd4f2" opacity="0.45" />
              </g>
            </g>
          </g>
        </g>
        <circle cx="120" cy="120" r={R} fill="none" stroke="#efe6d3" strokeWidth="16" />
        <circle cx="120" cy="120" r={R} fill="none" stroke={ring} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(p, 0.001))} transform="rotate(-90 120 120)" className="ring-glide" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" dir="ltr">
        <div className="-mt-2">
          <div className="num text-[clamp(3.5rem,8vw,6rem)] font-black leading-[0.9]">{minutes}</div>
          <div className="text-xl font-bold text-[var(--k-ink)]/80">{unit}</div>
          {sub && <div className="mt-2 text-base font-semibold text-[#1d4f6e]">{sub}</div>}
        </div>
      </div>
    </div>
  )
}
