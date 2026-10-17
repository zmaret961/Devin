// Process-local in-memory cache for catalog lookups (prices, inventory snapshots).

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const entries = new Map<string, CacheEntry<unknown>>();

export function cacheSet<T>(key: string, value: T, ttlMs = 60_000, now = Date.now()): void {
  entries.set(key, { value, expiresAt: now + ttlMs });
}

export function cacheGet<T>(key: string, now = Date.now()): T | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < now) return undefined;
  return entry.value as T;
}

export function cacheSize(): number {
  return entries.size;
}
