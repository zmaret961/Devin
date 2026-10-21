// Compact recording of engine snapshots, used by the static (Vercel) replay of the dashboard.
import type { Snapshot } from './types.ts';

type Patch = { len: number; upd: [number, unknown][] };
export interface Frame {
  /** Simulated ms since the segment started. */
  t: number;
  set?: Record<string, unknown>;
  arr?: Record<string, Patch>;
}
export interface Recording {
  recordedAt: string;
  initial: Snapshot;
  /** One segment per shift: frames from "Start shift" until the retrospective is done. */
  segments: { startNow: number; frames: Frame[] }[];
  /** Rendered playbook markdown keyed by version. */
  playbooks: Record<number, string>;
}

export function diffSnapshot(prev: Snapshot, next: Snapshot, t: number): Frame | null {
  const f: Frame = { t };
  const p = prev as unknown as Record<string, unknown>;
  const n = next as unknown as Record<string, unknown>;
  for (const k of Object.keys(n)) {
    if (k === 'now') continue;
    const a = p[k];
    const b = n[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (Array.isArray(a) && Array.isArray(b)) {
      const upd: [number, unknown][] = [];
      b.forEach((x, i) => JSON.stringify(x) !== JSON.stringify(a[i]) && upd.push([i, x]));
      (f.arr ??= {})[k] = { len: b.length, upd };
    } else (f.set ??= {})[k] = b;
  }
  return f.set || f.arr ? f : null;
}

export function applyFrame(s: Snapshot, f: Frame): Snapshot {
  const out = { ...s } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(f.set ?? {})) out[k] = v;
  for (const [k, { len, upd }] of Object.entries(f.arr ?? {})) {
    const arr = [...((out[k] as unknown[]) ?? [])].slice(0, len);
    for (const [i, x] of upd) arr[i] = x;
    out[k] = arr;
  }
  return out as unknown as Snapshot;
}
