import { withConnection, type ConnectionPool } from '../../../../packages/db/src/pool.ts';
import { createLogger } from '../../../../packages/shared/src/logger.ts';
import type { StripeClient } from '../clients/stripe.ts';
import { withRetry } from '../lib/retry.ts';

const log = createLogger('payment-worker');

export interface ChargeJob {
  orderId: string;
  amountCents: number;
  paymentMethodId: string;
}

export async function chargePayment(job: ChargeJob, pool: ConnectionPool, stripe: StripeClient): Promise<string> {
  return withConnection(pool, async (conn) => {
    const charge = await withRetry(() =>
      stripe.request('/charges', { amount: job.amountCents, currency: 'usd', payment_method: job.paymentMethodId }, `charge-${job.orderId}`),
    );
    await conn.query('update orders set status = $1, charge_id = $2 where id = $3', ['paid', charge.id, job.orderId]);
    log.info('charge captured', { orderId: job.orderId, chargeId: charge.id });
    return charge.id;
  });
}
