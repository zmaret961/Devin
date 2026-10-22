import { NavLink, useLocation } from 'react-router';
import { m } from 'framer-motion';
import { House, Siren, Refrigerator, CalendarCheck, type LucideIcon } from 'lucide-react';
import { useSettings } from '../state/settings';

const TABS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/emergency', label: 'Emergency', icon: Siren },
  { to: '/assets', label: 'Assets', icon: Refrigerator },
  { to: '/maintenance', label: 'Maintenance', icon: CalendarCheck },
];

/** Floating liquid-glass tab bar, iOS style, clear of the home indicator. */
export function TabBar() {
  const { pathname } = useLocation();
  const emergency = useSettings((s) => s.emergencyMode) && pathname.startsWith('/emergency');
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.625rem)]"
    >
      <ul className="glass pointer-events-auto mx-auto grid h-[4.25rem] max-w-md grid-cols-4 rounded-[2.25rem] p-1.5">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          const isEmergencyTab = to === '/emergency';
          const tone = emergency
            ? active
              ? 'text-signal'
              : isEmergencyTab
                ? 'text-siren'
                : 'text-stone-300'
            : active
              ? 'text-pine'
              : 'text-ink-2';
          return (
            <li key={to} className="relative">
              <NavLink
                to={to}
                end={to === '/'}
                className={`interactive relative flex h-full flex-col items-center justify-center gap-0.5 rounded-[1.75rem] text-[0.6875rem] font-semibold ${tone}`}
              >
                {active && (
                  <m.span
                    layoutId="tab-lens"
                    aria-hidden
                    className={`absolute inset-0 rounded-[1.75rem] ${
                      emergency
                        ? 'bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                        : 'bg-white/85 shadow-[0_2px_10px_rgba(29,33,31,0.10),inset_0_1px_0_rgba(255,255,255,1)]'
                    }`}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className="relative size-[1.375rem]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                <span className="relative">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
