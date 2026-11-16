import { NavLink } from 'react-router-dom'

const TABS = [
  ['', 'Today'], ['data', 'Add data'], ['salt', 'Salt clock'], ['reports', 'Water report'], ['alerts', 'Alerts'], ['setup', 'Setup'],
] as const

/** Owner tabs. Links are absolute: relative links inside the farm's splat route would stack onto the
 *  current tab ("…/salt/data"). */
export function TabNav({ farmId, alerts }: { farmId: string; alerts: number }) {
  const base = `/owner/farms/${farmId}`
  return (
    <nav className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-white/6 p-1 ring-1 ring-white/10">
      {TABS.map(([path, label]) => (
        <NavLink key={path} end to={path ? `${base}/${path}` : base}
          className={({ isActive }) => `press whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors duration-200 ${isActive ? 'bg-[#f7f8f4] font-semibold text-[#0b0e07]' : 'text-ink-soft hover:text-ink'}`}>
          {label}
          {path === 'alerts' && alerts > 0 && (
            <span className="num ms-1.5 rounded-full bg-brine px-1.5 text-xs text-white" aria-label={`${alerts} open`}>{alerts}</span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
