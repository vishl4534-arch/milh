import type { TFunction } from 'i18next'

const fmtCache = new Map<string, Intl.DateTimeFormat>()

function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts)
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts })
    fmtCache.set(key, f)
  }
  return f
}

/** "05:03" in the farm's timezone (not the device's). */
export function hhmm(iso: string | number | null | undefined, tz: string): string {
  if (iso === null || iso === undefined) return '--:--'
  return fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** "16 Nov" in the farm's timezone. */
export function dayMonth(iso: string | number, tz: string): string {
  const d = typeof iso === 'string' && iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso)
  return fmt(tz, { day: 'numeric', month: 'short' }).format(d)
}

export function ageText(hours: number | null | undefined, t: TFunction): string {
  if (hours === null || hours === undefined) return ''
  if (hours < 1 / 60) return t('time.justNow')
  if (hours < 1) return t('time.minutes', { n: Math.round(hours * 60) })
  if (hours < 48) return t('time.hours', { n: Math.round(hours) })
  return t('time.days', { n: Math.round(hours / 24) })
}

export function hoursSince(iso: string | null | undefined, now: number): number | null {
  return iso ? (now - Date.parse(iso)) / 3_600_000 : null
}

export const litres = (n: number) => `${Math.round(n).toLocaleString('en-US')} L`
