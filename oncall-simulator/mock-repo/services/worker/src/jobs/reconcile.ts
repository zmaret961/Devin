import { applyTax } from '../../../../packages/shared/src/money.ts';
import { OrderTotalMismatch } from '../../../../packages/shared/src/errors.ts';

export interface SettledOrder {
  id: string;
  subtotalCents: number;
  taxRate: number;
  chargedCents: number;
}

/** Nightly reconciliation: recompute each order total and compare with what the processor charged. */
export function reconcileOrder(order: SettledOrder): void {
  const computed = applyTax(order.subtotalCents, order.taxRate);
  if (computed !== order.chargedCents) {
    throw new OrderTotalMismatch(computed, order.chargedCents, order.id);
  }
}
