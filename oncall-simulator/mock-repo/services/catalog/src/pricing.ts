import { applyDiscount } from '../../../packages/shared/src/money.ts';
import { cacheGet, cacheSet } from './cache.ts';

export interface PriceQuote {
  sku: string;
  listCents: number;
  saleCents: number;
}

export async function quotePrice(sku: string, region: string, lookup: (sku: string) => Promise<{ listCents: number; percentOff: number }>): Promise<PriceQuote> {
  const key = `price:${sku}:${region}`;
  const cached = cacheGet<PriceQuote>(key);
  if (cached) return cached;
  const { listCents, percentOff } = await lookup(sku);
  const quote = { sku, listCents, saleCents: applyDiscount(listCents, percentOff) };
  cacheSet(key, quote);
  return quote;
}
