// Where the sun is and what the sky looks like, from the farm's real sunrise and sunset (Open-Meteo).
// Pure, so the header scene is just a drawing of this.

export type Phase = 'night' | 'dawn' | 'day' | 'dusk'

export interface Sky {
  phase: Phase
  progress: number // 0 at sunrise, 1 at sunset (clamped)
  height: number // 0 on the horizon, 1 at the top of the arc
  sunUp: boolean
}

const TWILIGHT_MS = 45 * 60_000

function minutesIntoLocalDay(now: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

export function skyAt(now: number, sunrise: number | null, sunset: number | null, tz = 'Asia/Dubai'): Sky {
  let rise = sunrise
  let set = sunset
  if (rise === null || set === null || !(set > rise)) {
    const mins = minutesIntoLocalDay(now, tz) // no forecast yet: a plain 06:00-18:00 day
    rise = now - (mins - 6 * 60) * 60_000
    set = now - (mins - 18 * 60) * 60_000
  }
  let phase: Phase = 'day'
  if (now < rise - TWILIGHT_MS || now > set + TWILIGHT_MS) phase = 'night'
  else if (Math.abs(now - rise) <= TWILIGHT_MS) phase = 'dawn'
  else if (Math.abs(now - set) <= TWILIGHT_MS) phase = 'dusk'
  const progress = Math.min(1, Math.max(0, (now - rise) / (set - rise)))
  return { phase, progress, height: Math.sin(Math.PI * progress), sunUp: now >= rise && now <= set }
}
