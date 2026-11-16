import type { ReactNode } from 'react'
import { Bell, Calendar, Chart, Clock, Gear, Upload } from '../components/icons'

/** Owner sections: [path, label, icon, one-line description]. */
export const PAGES: readonly (readonly [string, string, ReactNode, string])[] = [
  ['', 'Today', <Calendar key="c" />, "Today's irrigation decision for every block"],
  ['data', 'Add data', <Upload key="u" />, 'Readings, soil tests, CSV imports and lab reports'],
  ['salt', 'Salt clock', <Clock key="k" />, 'Well salinity trend and when it starts to cost yield'],
  ['reports', 'Water report', <Chart key="r" />, 'Planned, confirmed and usual water over time'],
  ['alerts', 'Alerts', <Bell key="b" />, 'Things on the farm that need your attention'],
  ['setup', 'Setup', <Gear key="g" />, 'Farm rules, water sources, blocks and devices'],
]
