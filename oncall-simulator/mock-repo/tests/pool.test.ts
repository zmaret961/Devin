import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionPool, withConnection } from '../packages/db/src/pool.ts';
import { createMemoryDriver } from '../packages/db/src/driver.ts';

test('withConnection returns the callback result and releases the connection', async () => {
  const pool = new ConnectionPool(createMemoryDriver({ orders: [{ id: 'o1' }] }), { max: 2, acquireTimeoutMs: 50 });
  const rows = await withConnection(pool, (conn) => conn.query('select * from orders'));
  assert.equal(rows.length, 1);
  assert.equal(pool.stats.inUse, 0);
});
