import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeToken, encodeToken } from '../services/auth/src/tokens.ts';
import { issueSession } from '../services/auth/src/session.ts';

test('tokens round-trip', () => {
  const token = issueSession('user_1', ['checkout'], 1_700_000_000_000);
  assert.deepEqual(decodeToken(encodeToken(token)), token);
});

test('garbage tokens decode to undefined', () => {
  assert.equal(decodeToken('not-a-token'), undefined);
});
