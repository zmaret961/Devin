import type { ApiRequest, ApiResponse } from '../server.ts';

const WINDOW_MS = 60_000;
const LIMIT = 120;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: ApiRequest, now = Date.now()): ApiResponse | undefined {
  const key = req.headers['x-forwarded-for'] ?? 'anonymous';
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return undefined;
  }
  bucket.count += 1;
  if (bucket.count > LIMIT) return { status: 429, body: { error: 'rate_limited' } };
  if (buckets.size > 50_000) buckets.delete(key);
  return undefined;
}
