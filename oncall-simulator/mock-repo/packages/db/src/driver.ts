import type { Connection } from './pool.ts';

export interface Driver {
  connect(id: number): Promise<Connection>;
}

/** In-memory driver used by tests and local development. */
export function createMemoryDriver(tables: Record<string, unknown[]> = {}): Driver {
  return {
    async connect(id: number): Promise<Connection> {
      return {
        id,
        async query<T>(sql: string): Promise<T[]> {
          const match = /from\s+(\w+)/i.exec(sql);
          return ((match && tables[match[1]]) ?? []) as T[];
        },
      };
    },
  };
}
