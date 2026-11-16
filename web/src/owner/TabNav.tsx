import { NavLink } from 'react-router-dom'
import { PAGES } from './pages'

/** Owner navigation: a vertical list in the sidebar on wide screens, a scrolling row on narrow ones.
 *  Links are absolute: relative links inside the farm's splat route would stack ("…/salt/data"). */
export function TabNav({ farmId, alerts }: { farmId: string; alerts: number }) {
  const base = `/owner/farms/${farmId}`
  return (
    <nav aria-label="Farm sections" className="-mx-1 flex gap-0.5 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
      {PAGES.map(([path, label, icon]) => (
        <NavLink key={path} end to={path ? `${base}/${path}` : base}
          className={({ isActive }) => `group flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[0.875rem] font-medium transition-colors duration-150 ${
            isActive ? 'bg-white text-[var(--k-ink)] shadow-[0_1px_2px_rgb(17_21_19/0.06)] ring-1 ring-[var(--k-line)]'
              : 'text-[var(--k-muted)] hover:bg-[var(--k-sand)] hover:text-[var(--k-ink)]'}`}>
          {({ isActive }) => (
            <>
              <span aria-hidden className={`text-[1.05rem] ${isActive ? 'text-[var(--k-green)]' : ''}`}>{icon}</span>
              {label}
              {path === 'alerts' && alerts > 0 && (
                <span className="mono ms-auto rounded-md bg-[var(--k-red-soft)] px-1.5 text-[0.6875rem] font-semibold leading-5 text-[var(--k-red)]"
                  aria-label={`${alerts} open`}>{alerts}</span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
