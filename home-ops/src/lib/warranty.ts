import type { ISODate } from '../types';
import { daysBetween, formatDate } from './dates';

export type WarrantyState = 'none' | 'active' | 'expiring' | 'expired';

export function warrantyState(expiration: ISODate | null, today: ISODate): WarrantyState {
  if (!expiration) return 'none';
  const days = daysBetween(today, expiration);
  if (days < 0) return 'expired';
  if (days <= 90) return 'expiring';
  return 'active';
}

export function warrantyLabel(expiration: ISODate | null, today: ISODate): string {
  const state = warrantyState(expiration, today);
  if (state === 'none' || !expiration) return 'No warranty on file';
  if (state === 'expired') return `Warranty ended ${formatDate(expiration, { withYear: true })}`;
  const days = daysBetween(today, expiration);
  if (state === 'expiring') return days === 0 ? 'Warranty ends today' : `Warranty ends in ${days} days`;
  return `Under warranty until ${formatDate(expiration, { withYear: true })}`;
}
