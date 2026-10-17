import { createLogger } from '../../../packages/shared/src/logger.ts';
import { requireSession } from './middleware/auth.ts';
import { rateLimit } from './middleware/rateLimit.ts';
import { handleCheckout, type CheckoutDeps, type CheckoutRequest } from './routes/checkout.ts';

const log = createLogger('checkout-api');

export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export function createRouter(deps: CheckoutDeps) {
  return async function router(req: ApiRequest): Promise<ApiResponse> {
    const limited = rateLimit(req);
    if (limited) return limited;
    if (req.method === 'POST' && req.path === '/v1/checkout') {
      const body = req.body as CheckoutRequest;
      if (!body.customer.isGuest) {
        const denied = requireSession(req);
        if (denied) return denied;
      }
      try {
        return await handleCheckout(body, deps);
      } catch (err) {
        log.error('checkout failed', { err: String(err) });
        return { status: 500, body: { error: 'internal_error' } };
      }
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
