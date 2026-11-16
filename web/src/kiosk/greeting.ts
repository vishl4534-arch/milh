/** Which greeting fits the farm's local hour. */
export function greetingKey(now: number, tz: string): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)))
  if (h < 5) return 'kiosk.greet_night'
  if (h < 12) return 'kiosk.greet_morning'
  if (h < 17) return 'kiosk.greet_afternoon'
  if (h < 20) return 'kiosk.greet_evening'
  return 'kiosk.greet_night'
}
