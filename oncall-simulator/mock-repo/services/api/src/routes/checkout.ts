import { applyTax, sumCents } from '../../../../packages/shared/src/money.ts';
import { createLogger } from '../../../../packages/shared/src/logger.ts';
import type { ApiResponse } from '../server.ts';

const log = createLogger('checkout-api');

export interface Address {
  line1: string;
  city: string;
  zip: string;
  country: string;
}

export interface CheckoutRequest {
  cartId: string;
  paymentMethodId: string;
  customer: {
    id?: string;
    email: string;
    isGuest: boolean;
    address?: Address;
  };
}

export interface CartLine {
  sku: string;
  qty: number;
  unitCents: number;
}

export interface CheckoutDeps {
  carts: { get(id: string): Promise<CartLine[] | undefined> };
  taxRateForZip(zip: string): number;
  enqueueCharge(job: { cartId: string; amountCents: number; paymentMethodId: string }): Promise<string>;
}

export async function handleCheckout(req: CheckoutRequest, deps: CheckoutDeps): Promise<ApiResponse> {
  const lines = await deps.carts.get(req.cartId);
  if (!lines || lines.length === 0) {
    return { status: 404, body: { error: 'cart_not_found' } };
  }
  const subtotal = sumCents(lines.map((l) => l.qty * l.unitCents));
  const rate = deps.taxRateForZip(req.customer.address.zip);
  const total = applyTax(subtotal, rate);
  const jobId = await deps.enqueueCharge({ cartId: req.cartId, amountCents: total, paymentMethodId: req.paymentMethodId });
  log.info('checkout accepted', { cartId: req.cartId, total, guest: req.customer.isGuest });
  return { status: 202, body: { jobId, totalCents: total } };
}
