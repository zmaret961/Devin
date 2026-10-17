import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCheckout, type CheckoutDeps } from '../services/api/src/routes/checkout.ts';

const deps: CheckoutDeps = {
  carts: { get: async () => [{ sku: 'sku_1', qty: 2, unitCents: 1000 }] },
  taxRateForZip: () => 0.05,
  enqueueCharge: async () => 'job_1',
};

test('registered customer checkout is accepted', async () => {
  const res = await handleCheckout({
    cartId: 'c1',
    paymentMethodId: 'pm_1',
    customer: { id: 'u1', email: 'a@b.co', isGuest: false, address: { line1: '1 Main', city: 'SF', zip: '94107', country: 'US' } },
  }, deps);
  assert.equal(res.status, 202);
});
