import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Bell, Calendar, Chart, Clock, Gear, Upload } from '../components/icons'

const TABS: readonly (readonly [string, string, ReactNode])[] = [
  ['', 'Today', <Calendar key="c" />], ['data', 'Add data', <Upload key="u" />], ['salt', 'Salt clock', <Clock key="k" />],
  ['reports', 'Water report', <Chart key="r" />], ['alerts', 'Alerts', <Bell key="b" />], ['setup', 'Setup', <Gear key="g" />],
]

/** Owner tabs: the tablet's pill tabs, with the green pill gliding to the open one. Links are absolute:
 *  relative links inside the farm's splat route would stack onto the current tab ("…/salt/data"). */
export function TabNav({ farmId, alerts }: { farmId: string; alerts: number }) {
  const base = `/owner/farms/${farmId}`
  const { pathname } = useLocation()
  const here = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '').split('/')[0] : ''
  const idx = Math.max(0, TABS.findIndex(([p]) => p === here))
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <nav className="relative grid min-w-[46rem] grid-cols-6 rounded-[1.4rem] bg-white p-1.5 shadow-[0_14px_34px_-24px_rgba(92,74,40,.45)]">
        <span aria-hidden className="tab-glide absolute inset-y-1.5 start-1.5 w-[calc((100%-0.75rem)/6)] rounded-[1.05rem] bg-[var(--k-green)] shadow-[0_10px_22px_-12px_rgba(47,107,79,.9)]"
          style={{ transform: `translateX(${idx * 100}%)` }} />
        {TABS.map(([path, label, icon]) => (
          <NavLink key={path} end to={path ? `${base}/${path}` : base}
            className={({ isActive }) => `press relative z-10 flex items-center justify-center gap-2 whitespace-nowrap rounded-[1.05rem] px-3 py-2.5 text-base font-bold transition-colors duration-300 ${isActive ? 'text-white' : 'text-[var(--k-ink)]/75 hover:text-[var(--k-ink)]'}`}>
            <span aria-hidden className="text-lg">{icon}</span>
            {label}
            {path === 'alerts' && alerts > 0 && (
              <span className="num ms-0.5 rounded-full bg-brine px-1.5 text-xs text-white" aria-label={`${alerts} open`}>{alerts}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
