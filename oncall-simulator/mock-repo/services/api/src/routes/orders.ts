import { findOrder } from '../../../../packages/db/src/queries.ts';
import type { ConnectionPool } from '../../../../packages/db/src/pool.ts';
import type { ApiResponse } from '../server.ts';

export async function getOrder(pool: ConnectionPool, id: string): Promise<ApiResponse> {
  const order = await findOrder(pool, id);
  if (!order) return { status: 404, body: { error: 'order_not_found' } };
  return { status: 200, body: order };
}
