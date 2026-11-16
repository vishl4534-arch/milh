// The signature of the farm tablet: a living sky that follows the farm's real sunrise and sunset, with
// dunes, date palms and green field rows. Everything is drawn here, so it works offline.
import type { ReactNode } from 'react'
import { skyAt, type Phase } from './sky'

const SKIES: Record<Phase, string> = {
  night: 'linear-gradient(180deg, #0f1a3a 0%, #24366b 70%, #3a4a7c 100%)',
  dawn: 'linear-gradient(180deg, #4a63a8 0%, #e9a17b 62%, #f9d39a 100%)',
  day: 'linear-gradient(180deg, #4ea3e0 0%, #9fd3f0 60%, #e6f4fa 100%)',
  dusk: 'linear-gradient(180deg, #3e3a78 0%, #c96a7b 58%, #f3a964 100%)',
}

const STARS = [[8, 18], [16, 40], [24, 12], [35, 30], [47, 9], [58, 26], [66, 14], [74, 36], [83, 10], [91, 28], [12, 58], [52, 50], [88, 52]]

interface Props {
  now: number
  sunrise: number | null
  sunset: number | null
  tz: string
  children?: ReactNode
  tall?: boolean
  className?: string
  /** where the sun's arc runs; a small card keeps it low so it never sits behind its text */
  sunBand?: string
}

export function SkyScene({ now, sunrise, sunset, tz, children, tall = false, className = '', sunBand = 'inset-x-[6%] top-[10%] bottom-[46%]' }: Props) {
  const sky = skyAt(now, sunrise, sunset, tz)
  const night = sky.phase === 'night'
  return (
    <div data-phase={sky.phase}
      className={`relative isolate overflow-hidden rounded-3xl ${tall ? 'min-h-dvh' : 'min-h-[13.5rem]'} ${className}`}>
      {(Object.keys(SKIES) as Phase[]).map((p) => (
        <div key={p} aria-hidden className="sky-layer absolute inset-0" style={{ background: SKIES[p], opacity: p === sky.phase ? 1 : 0 }} />
      ))}

      {/* stars at night */}
      <svg aria-hidden className="sky-layer absolute inset-0 h-full w-full" style={{ opacity: night ? 1 : 0 }}>
        {STARS.map(([x, y], i) => (
          <circle key={i} cx={`${x}%`} cy={`${y}%`} r={i % 3 ? 1.4 : 2} fill="#fff" className="twinkle"
            style={{ animationDelay: `${(i % 5) * 0.6}s` }} />
        ))}
      </svg>

      {/* the sun (or moon) on its arc: X follows the time of day, Y follows the height of the arc */}
      <div aria-hidden className={`pointer-events-none absolute ${sunBand}`}>
        <div className="sun-glide h-full w-full" style={{ transform: `translateX(${night ? 50 : sky.progress * 100}%)` }}>
          <div className="sun-glide h-full w-full" style={{ transform: `translateY(${night ? 8 : (1 - sky.height) * 100}%)` }}>
            {night ? (
              <svg viewBox="0 0 60 60" className="-ms-7 -mt-7 size-14">
                <circle cx="30" cy="30" r="20" fill="#f4efe0" />
                <circle cx="40" cy="24" r="18" fill="#24366b" />
              </svg>
            ) : (
              <svg viewBox="0 0 80 80" className="-ms-10 -mt-10 size-20">
                <circle cx="40" cy="40" r="34" fill="#f6b73c" opacity="0.22" />
                <circle cx="40" cy="40" r="24" fill="#f6b73c" opacity="0.35" />
                <circle cx="40" cy="40" r="16" fill="#ffd25e" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* clouds drifting by (not at night) */}
      <div aria-hidden className="sky-layer pointer-events-none absolute inset-0" style={{ opacity: night ? 0 : 0.9 }}>
        {[{ top: '14%', delay: '-12s', scale: 1 }, { top: '30%', delay: '-55s', scale: 0.7 }].map((c, i) => (
          <div key={i} className="drift absolute start-0" style={{ top: c.top, animationDelay: c.delay }}>
            <svg viewBox="0 0 120 50" style={{ width: `${8 * c.scale}rem` }}>
              <path d="M20 40 C6 40 6 24 20 24 C22 12 40 8 48 18 C56 6 80 8 82 24 C98 22 104 40 88 40Z" fill="#fff" opacity="0.92" />
            </svg>
          </div>
        ))}
      </div>

      {/* dunes, date palms and field rows */}
      <svg aria-hidden viewBox="0 0 1200 160" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[42%] w-full">
        <path d="M0 70 C180 30 330 40 480 72 C640 104 760 46 930 50 C1050 54 1130 76 1200 66 V160 H0Z"
          fill={night ? '#5b5470' : '#e2c48f'} className="sky-layer" />
        <path d="M0 104 C220 74 420 86 600 104 C780 122 980 88 1200 98 V160 H0Z"
          fill={night ? '#4a4560' : '#d6b177'} className="sky-layer" />
        <rect x="0" y="128" width="1200" height="32" fill={night ? '#2f4a3b' : '#4f9d69'} className="sky-layer" />
        {Array.from({ length: 24 }, (_, i) => (
          <path key={i} d={`M${i * 52} 160 L${i * 52 + 26} 128`} stroke={night ? '#26402f' : '#3f8c5a'} strokeWidth="6" />
        ))}
      </svg>
      <div aria-hidden className="pointer-events-none absolute bottom-[14%] end-[6%] flex items-end gap-6 opacity-95">
        {[1, 0.78, 0.9].map((s, i) => (
          <svg key={i} viewBox="0 0 60 90" className="sway-slow" style={{ width: `${3.6 * s}rem`, animationDelay: `${-i * 1.7}s` }}>
            <path d="M28 90 C27 70 29 52 30 34 L34 34 C34 52 34 70 34 90Z" fill={night ? '#2b2a3a' : '#7d5330'} />
            <g fill={night ? '#203325' : '#2f6b4f'}>
              <path d="M32 32 C22 24 10 24 2 34 C14 30 24 31 32 35Z" />
              <path d="M32 32 C42 24 54 24 60 36 C48 30 40 31 32 35Z" />
              <path d="M32 31 C27 20 18 13 8 13 C18 19 26 25 31 34Z" />
              <path d="M32 31 C37 20 46 13 56 14 C46 19 38 25 33 34Z" />
              <path d="M32 31 C31 21 34 12 40 5 C37 15 35 23 33 33Z" />
            </g>
          </svg>
        ))}
      </div>

      <div className="relative z-10 h-full">{children}</div>
    </div>
  )
}
