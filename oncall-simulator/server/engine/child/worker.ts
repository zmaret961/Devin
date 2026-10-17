import { parentPort, workerData } from 'node:worker_threads';
import type { Brief, ChildRpc, RpcMethod } from './brief.ts';
import { Cancelled, investigate } from './investigator.ts';

const port = parentPort!;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let seq = 0;
let cancelled = false;

port.on('message', (msg: { type: string; id?: number; result?: unknown; error?: string }) => {
  if (msg.type === 'cancel') {
    cancelled = true;
    for (const p of pending.values()) p.reject(new Cancelled());
    pending.clear();
    return;
  }
  if (msg.type === 'rpc-result' && msg.id !== undefined) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (!p) return;
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  }
});

const rpc = new Proxy({} as ChildRpc, {
  get: (_t, method: RpcMethod) => (params?: unknown) =>
    new Promise((resolve, reject) => {
      if (cancelled) return reject(new Cancelled());
      const id = ++seq;
      pending.set(id, { resolve, reject });
      port.postMessage({ type: 'rpc', id, method, params });
    }),
});

investigate(workerData as Brief, rpc, () => cancelled)
  .then((result) => port.postMessage({ type: 'done', result }))
  .catch((err: Error) => port.postMessage(err instanceof Cancelled ? { type: 'cancelled' } : { type: 'failed', error: err.stack ?? String(err) }));
