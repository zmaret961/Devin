import { HttpError, NetworkError } from '../../../../packages/shared/src/errors.ts';

export interface ChargeRequest {
  amountCents: number;
  currency: string;
  paymentMethodId: string;
  idempotencyKey: string;
}

export interface StripeClient {
  request(path: string, body: unknown, idempotencyKey: string): Promise<{ id: string; amount: number }>;
}

export function createStripeClient(fetchImpl: typeof fetch, apiKey: string): StripeClient {
  return {
    async request(path, body, idempotencyKey) {
      let res: Response;
      try {
        res = await fetchImpl(`https://api.stripe.com/v1${path}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'idempotency-key': idempotencyKey },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new NetworkError(`stripe unreachable: ${String(err)}`);
      }
      if (!res.ok) throw new HttpError(res.status, `stripe ${path} failed with ${res.status}`);
      return (await res.json()) as { id: string; amount: number };
    },
  };
}
