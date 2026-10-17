import { withConnection, type ConnectionPool } from './pool.ts';

export interface OrderRow {
  id: string;
  customer_id: string;
  total_cents: number;
  status: 'pending' | 'paid' | 'failed';
}

export function findOrder(pool: ConnectionPool, id: string): Promise<OrderRow | undefined> {
  return withConnection(pool, async (conn) => {
    const rows = await conn.query<OrderRow>('select * from orders where id = $1', [id]);
    return rows[0];
  });
}

export function markOrderPaid(pool: ConnectionPool, id: string): Promise<void> {
  return withConnection(pool, async (conn) => {
    await conn.query('update orders set status = $1 where id = $2', ['paid', id]);
  });
}
