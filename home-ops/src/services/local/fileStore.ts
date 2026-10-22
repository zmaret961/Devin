/** Blob storage for Demo Mode: IndexedDB in the browser, memory elsewhere (tests). */
export interface FileStore {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  remove(key: string): Promise<void>;
}

export function createMemoryFileStore(): FileStore {
  const files = new Map<string, Blob>();
  return {
    put: async (k, b) => void files.set(k, b),
    get: async (k) => files.get(k) ?? null,
    remove: async (k) => void files.delete(k),
  };
}

const DB_NAME = 'homeops-demo-files';
const STORE = 'files';

export function createIndexedDbFileStore(): FileStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    put: async (k, b) => void (await run('readwrite', (s) => s.put(b, k))),
    get: async (k) => ((await run('readonly', (s) => s.get(k))) as Blob | undefined) ?? null,
    remove: async (k) => void (await run('readwrite', (s) => s.delete(k))),
  };
}
