import { createLogger } from '../../shared/src/logger.ts';
import type { Driver } from './driver.ts';

const log = createLogger('db');

export interface Connection {
  id: number;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface PoolOptions {
  max: number;
  acquireTimeoutMs: number;
}

export class PoolTimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out acquiring connection after ${ms}ms`);
    this.name = 'PoolTimeoutError';
  }
}

export class ConnectionPool {
  private idle: Connection[] = [];
  private inUse = new Set<Connection>();
  private waiters: Array<(conn: Connection) => void> = [];
  private nextId = 1;

  constructor(
    private readonly driver: Driver,
    private readonly opts: PoolOptions = { max: 20, acquireTimeoutMs: 5000 },
  ) {}

  get stats() {
    return { idle: this.idle.length, inUse: this.inUse.size, waiting: this.waiters.length };
  }

  async acquire(): Promise<Connection> {
    const idle = this.idle.pop();
    if (idle) {
      this.inUse.add(idle);
      return idle;
    }
    if (this.inUse.size < this.opts.max) {
      const conn = await this.driver.connect(this.nextId++);
      this.inUse.add(conn);
      return conn;
    }
    return new Promise<Connection>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        log.warn('pool acquire timeout', this.stats);
        reject(new PoolTimeoutError(this.opts.acquireTimeoutMs));
      }, this.opts.acquireTimeoutMs);
      const waiter = (conn: Connection) => {
        clearTimeout(timer);
        this.inUse.add(conn);
        resolve(conn);
      };
      this.waiters.push(waiter);
    });
  }

  release(conn: Connection): void {
    this.inUse.delete(conn);
    const waiter = this.waiters.shift();
    if (waiter) waiter(conn);
    else this.idle.push(conn);
  }
}

/** Runs `fn` with a pooled connection and returns the connection to the pool. */
export async function withConnection<T>(pool: ConnectionPool, fn: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = await pool.acquire();
  const result = await fn(conn);
  pool.release(conn);
  return result;
}
