import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheGet, cacheSet } from '../services/catalog/src/cache.ts';

test('cache returns fresh values and hides expired ones', () => {
  cacheSet('k', 42, 1000, 0);
  assert.equal(cacheGet('k', 500), 42);
  assert.equal(cacheGet('k', 5000), undefined);
});
