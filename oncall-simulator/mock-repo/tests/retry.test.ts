import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRetryable, withRetry } from '../services/worker/src/lib/retry.ts';
import { HttpError, NetworkError } from '../packages/shared/src/errors.ts';

test('server errors and network errors are retryable', () => {
  assert.equal(isRetryable(new HttpError(503, 'unavailable')), true);
  assert.equal(isRetryable(new NetworkError('reset')), true);
});

test('withRetry eventually succeeds', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw new HttpError(503, 'unavailable');
    return 'ok';
  }, { retries: 5, baseDelayMs: 1, maxDelayMs: 2, sleep: async () => {} });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});
