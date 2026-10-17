import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/types.ts';

export function useSnapshot(intervalMs = 700) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) throw new Error(`engine returned ${res.status}`);
        const s = (await res.json()) as Snapshot;
        if (alive) {
          setSnap(s);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) timer.current = window.setTimeout(tick, intervalMs);
      }
    };
    tick();
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
    };
  }, [intervalMs]);
  return { snap, error };
}

export async function control(body: Record<string, unknown>) {
  const res = await fetch('/api/control', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) {
    window.alert(`That didn't work: ${json.error ?? 'request failed'}`);
    throw new Error(json.error ?? 'request failed');
  }
  return json;
}
