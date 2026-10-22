import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Siren } from 'lucide-react';
import { useData } from '../state/data';
import { useSettings } from '../state/settings';
import { isDemoMode } from '../services';
import { TabBar } from './TabBar';
import { Toasts } from './Toasts';

export function AppShell() {
  const start = useData((s) => s.start);
  const emergencyMode = useSettings((s) => s.emergencyMode);
  const onEmergencyTab = useLocation().pathname.startsWith('/emergency');
  // The dark high-contrast theme belongs to the Emergency tab; elsewhere a banner leads back to it.
  const emergency = emergencyMode && onEmergencyTab;

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    document.documentElement.dataset.emergency = emergency ? 'on' : 'off';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', emergency ? '#111214' : '#F4F1EA');
  }, [emergency]);

  return (
    <div className="min-h-dvh">
      {isDemoMode() && !emergencyMode && (
        <p className="bg-ochre-soft px-4 pt-[calc(env(safe-area-inset-top)+0.375rem)] pb-1.5 text-center text-xs text-ink-2">
          Demo Mode: your data is saved in this browser only. Connect Supabase to sync it.
        </p>
      )}
      {emergencyMode && !onEmergencyTab && (
        <Link
          to="/emergency"
          className="flex items-center justify-center gap-2 bg-siren-deep px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 text-sm font-bold text-white"
        >
          <Siren className="size-4" aria-hidden /> Emergency Mode is on. Back to your steps
        </Link>
      )}
      <main className="pt-safe pb-tabbar mx-auto max-w-2xl px-5">
        <Outlet />
      </main>
      <Toasts />
      <TabBar />
    </div>
  );
}
