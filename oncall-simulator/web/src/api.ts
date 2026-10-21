/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/types.ts';
import { getPlayer } from './replay.ts';

/** Static build (e.g. Vercel): no engine server, so the dashboard replays a recorded run. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

export function useSnapshot(intervalMs = 700) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => {
    let alive = true;
    let last: number | undefined;
    const tick = async () => {
      try {
        if (STATIC_DEMO) {
          const p = await getPlayer();
          const t = performance.now();
          p.tick(t - (last ?? t));
          last = t;
          if (alive) {
            setSnap(p.snapshot());
            setError(null);
          }
          return;
        }
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
  if (STATIC_DEMO) return (await getPlayer()).control(body);
  const res = await fetch('/api/control', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) {
    window.alert(`That didn't work: ${json.error ?? 'request failed'}`);
    throw new Error(json.error ?? 'request failed');
  }
  return json;
}

export async function playbookMarkdown(version: number) {
  if (STATIC_DEMO) return (await getPlayer()).playbookMarkdown(version);
  return (await fetch(`/api/playbook/v${version}.md`)).text();
}
