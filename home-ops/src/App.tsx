import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import { AppShell } from './components/AppShell';
import { RequireAuth } from './features/auth/RequireAuth';
import { AuthPage } from './features/auth/AuthPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { EmergencyPage } from './features/emergency/EmergencyPage';
import { AssetsPage } from './features/assets/AssetsPage';
import { MaintenancePage } from './features/maintenance/MaintenancePage';
import { useSession } from './state/session';
import { useSettings } from './state/settings';

export function App() {
  const init = useSession((s) => s.init);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  useEffect(() => init(), [init]);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion);
  }, [reducedMotion]);

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="emergency" element={<EmergencyPage />} />
              <Route path="assets" element={<AssetsPage />} />
              <Route path="maintenance" element={<MaintenancePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </MotionConfig>
    </LazyMotion>
  );
}
