import { useId } from 'react'

// A water tank whose level is the real reading, with a gently moving surface. Empty state: a dashed tank.

export function TankArt({ pct, className = '' }: { pct: number | null; className?: string }) {
  const clip = `tank-${useId().replace(/:/g, '')}`
  const level = pct === null ? 0 : Math.max(0, Math.min(100, pct))
  const low = pct !== null && pct < 25
  const water = low ? '#d98a2b' : '#2e86c1'
  // Water fills a 76-unit-tall body (y 18..94); the wave group is moved, never resized.
  const y = 94 - (76 * level) / 100
  return (
    <svg viewBox="0 0 80 104" className={className} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <rect x="8" y="18" width="64" height="76" rx="10" />
        </clipPath>
      </defs>
      <rect x="22" y="6" width="36" height="12" rx="4" fill="#9aa8a3" />
      <rect x="8" y="18" width="64" height="76" rx="10" fill="#eef3f1"
        stroke={pct === null ? '#9aa8a3' : '#5d6b66'} strokeWidth="3" strokeDasharray={pct === null ? '6 5' : undefined} />
      {pct !== null && (
        <g clipPath={`url(#${clip})`}>
          <g style={{ transform: `translateY(${y - 18}px)`, transition: 'transform 600ms var(--ease-out)' }}>
            <g className="wave">
              <path d="M0 18 Q10 12 20 18 T40 18 T60 18 T80 18 T100 18 T120 18 T140 18 T160 18 V200 H0Z" fill={water} opacity="0.85" />
            </g>
          </g>
        </g>
      )}
      {[38, 56, 74].map((ly) => <path key={ly} d={`M64 ${ly} h-8`} stroke="#5d6b66" strokeWidth="2" />)}
      <rect x="8" y="18" width="64" height="76" rx="10" fill="none" stroke={pct === null ? 'none' : '#5d6b66'} strokeWidth="3" />
    </svg>
  )
}

export function DropIcon({ color = '#2e86c1', className = '' }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 2.5c-4.3 5.9-6.5 9.3-6.5 12.1a6.5 6.5 0 0 0 13 0C18.5 11.8 16.3 8.4 12 2.5z" fill={color} />
      <path d="M9 15.5a3.2 3.2 0 0 0 2.5 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.7" />
    </svg>
  )
}

/** Soil plot with a sprout whose look follows the soil-salt status. */
export function SoilSprout({ status, className = '' }: { status: 'ok' | 'warn' | 'high' | 'none'; className?: string }) {
  const leaf = status === 'high' ? '#a3a36a' : status === 'warn' ? '#7fae5d' : '#4f9d69'
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden>
      <ellipse cx="24" cy="34" rx="20" ry="5" fill="#8a6440" />
      {status !== 'none' && (
        <g>
          <path d={status === 'high' ? 'M24 33 C24 26 26 22 30 20' : 'M24 33 V20'} stroke="#3f7d4f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d={status === 'high' ? 'M28 22 C22 24 16 22 14 18 C20 16 26 18 28 22Z' : 'M24 24 C16 24 12 18 12 12 C20 13 24 18 24 23Z'} fill={leaf} />
          <path d={status === 'high' ? 'M30 20 C34 24 38 24 40 22 C38 18 34 18 30 20Z' : 'M24 22 C32 22 36 16 36 10 C28 11 24 16 24 21Z'} fill={leaf} />
        </g>
      )}
      {(status === 'warn' || status === 'high') && (
        <g fill="#fff" stroke="#b7c2be" strokeWidth="0.8">
          <rect x="8" y="30" width="4" height="4" transform="rotate(20 10 32)" />
          <rect x="36" y="31" width="3.5" height="3.5" transform="rotate(-15 38 33)" />
          {status === 'high' && <rect x="18" y="31" width="3" height="3" transform="rotate(35 19 32)" />}
        </g>
      )}
    </svg>
  )
}

/** The Water tab's tank: a farm water tank on its base with a pipe and valve. The water rises to the real
 *  reading once, then its surface keeps moving. Empty state: no water, dashed outline. */
export function TankScene({ pct, className = '' }: { pct: number | null; className?: string }) {
  const clip = `tank-scene-${useId().replace(/:/g, '')}`
  const level = pct === null ? 0 : Math.max(0, Math.min(100, pct))
  const low = pct !== null && pct < 25
  // body inner area: y 62..232 (170 tall)
  const y = 232 - (170 * level) / 100
  return (
    <svg viewBox="0 0 300 280" className={className} aria-hidden>
      <defs>
        <clipPath id={clip}><rect x="78" y="62" width="150" height="170" rx="22" /></clipPath>
        <linearGradient id={`${clip}-w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={low ? '#f3c27a' : '#a9dbf6'} />
          <stop offset="100%" stopColor={low ? '#e09a3c' : '#6cbbe9'} />
        </linearGradient>
      </defs>
      {/* ground, base and bushes */}
      <ellipse cx="150" cy="262" rx="140" ry="12" fill="#e7d3ad" />
      <path d="M30 262 C34 240 54 236 62 250 C66 236 84 238 86 256Z" fill="#7cb85a" />
      <path d="M216 260 C220 236 244 232 252 248 C258 234 276 240 276 258Z" fill="#7cb85a" />
      <path d="M44 262 C48 248 60 246 66 256Z" fill="#5c9e45" />
      <rect x="66" y="232" width="174" height="26" rx="8" fill="#e9dfcc" />
      <rect x="66" y="232" width="174" height="8" rx="4" fill="#f4ecdc" />
      {/* pipe and valve */}
      <path d="M78 214 H52 V86 Q52 70 68 70 H92" fill="none" stroke="#3f8a5c" strokeWidth="14" strokeLinecap="round" />
      <rect x="40" y="168" width="24" height="12" rx="4" fill="#f2c14e" />
      <rect x="47" y="156" width="10" height="14" rx="3" fill="#e0a92e" />
      {/* tank body */}
      <rect x="78" y="62" width="150" height="170" rx="22" fill="#fbf8f2"
        stroke={pct === null ? '#c9bfae' : '#d9cfbd'} strokeWidth="3" strokeDasharray={pct === null ? '8 6' : undefined} />
      {pct !== null && (
        <g clipPath={`url(#${clip})`}>
          <g style={{ transform: `translateY(${y}px)`, transition: 'transform 900ms var(--ease-out)' }}>
            <g className="fill-up" style={{ ['--rise' as string]: '170px' }}>
              <g className="wave" style={{ animationDuration: '5s' }}>
                <path d="M60 0 Q80 -7 100 0 T140 0 T180 0 T220 0 T260 0 T300 0 T340 0 T380 0 T420 0 V200 H60Z" fill={`url(#${clip}-w)`} />
              </g>
            </g>
          </g>
        </g>
      )}
      {/* bands, highlight and level marks */}
      <path d="M80 140 H226 M80 190 H226" stroke="#e6ddcc" strokeWidth="2" opacity="0.8" />
      <rect x="92" y="74" width="12" height="140" rx="6" fill="#fff" opacity="0.6" />
      {[88, 112, 136, 160, 184, 208].map((ly) => <path key={ly} d={`M212 ${ly} h-14`} stroke="#9aa39e" strokeWidth="3" strokeLinecap="round" />)}
      {/* lid */}
      <rect x="104" y="40" width="98" height="26" rx="10" fill="#2f6b4f" />
      <rect x="104" y="40" width="98" height="8" rx="4" fill="#3f8a5c" />
      <path d="M120 44 v18 M138 44 v18 M156 44 v18 M174 44 v18 M190 44 v18" stroke="#25563f" strokeWidth="2" opacity="0.6" />
    </svg>
  )
}
