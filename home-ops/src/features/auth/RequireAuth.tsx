import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../../state/session';
import { useData } from '../../state/data';
import { ErrorState } from '../../components/States';

export function Splash({ label = 'Opening your home' }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <img src="/icons/icon-192.png" alt="" className="size-14 rounded-2xl" />
        <p className="text-sm text-muted">{label}…</p>
      </div>
    </div>
  );
}

/** Route guard: only signed-in users get past here. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error } = useSession();
  const reset = useData((s) => s.reset);
  const location = useLocation();

  useEffect(() => {
    if (status === 'signedOut') reset();
  }, [status, reset]);

  if (status === 'loading') return <Splash />;
  if (status === 'error') {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-6">
        <ErrorState message={error ?? 'Couldn\u2019t check your sign-in.'} onRetry={() => window.location.reload()} />
      </div>
    );
  }
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
