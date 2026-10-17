import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, formatCents, sumCents } from '../packages/shared/src/money.ts';

test('sumCents adds integer cents', () => {
  assert.equal(sumCents([100, 250, 1]), 351);
});

test('applyDiscount rounds to the nearest cent', () => {
  assert.equal(applyDiscount(1999, 15), 1699);
});

test('formatCents renders dollars', () => {
  assert.equal(formatCents(12345), '$123.45');
});
