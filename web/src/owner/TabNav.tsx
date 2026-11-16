import { NavLink } from 'react-router-dom'

const TABS = [
  ['', 'Today'], ['data', 'Add data'], ['salt', 'Salt clock'], ['reports', 'Water report'], ['alerts', 'Alerts'], ['setup', 'Setup'],
] as const

/** Owner tabs. Links are absolute: relative links inside the farm's splat route would stack onto the
 *  current tab ("…/salt/data"). */
export function TabNav({ farmId, alerts }: { farmId: string; alerts: number }) {
  const base = `/owner/farms/${farmId}`
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
      {TABS.map(([path, label]) => (
        <NavLink key={path} end to={path ? `${base}/${path}` : base}
          className={({ isActive }) => `whitespace-nowrap border-b-2 px-3 py-2 ${isActive ? 'border-ink font-semibold' : 'border-transparent text-ink-soft'}`}>
          {label}
          {path === 'alerts' && alerts > 0 && (
            <span className="num ms-1.5 rounded-full bg-brine px-1.5 text-xs text-white" aria-label={`${alerts} open`}>{alerts}</span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
