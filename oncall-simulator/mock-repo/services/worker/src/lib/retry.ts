import { HttpError, NetworkError } from '../../../../packages/shared/src/errors.ts';

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Errors worth retrying: transient network failures and retryable HTTP responses. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status >= 400;
  }
  return err instanceof NetworkError;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = { retries: 8, baseDelayMs: 200, maxDelayMs: 10_000 }): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > opts.retries || !isRetryable(err)) throw err;
      const delay = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
      await sleep(delay * (0.5 + Math.random() / 2));
    }
  }
}
