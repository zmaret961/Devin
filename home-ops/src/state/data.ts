import { create } from 'zustand';
import * as api from '../services';
import { toServiceError } from '../services';
import type {
  Asset,
  AssetInput,
  DocumentUpload,
  EmergencyContact,
  EmergencyContactInput,
  MaintenanceTask,
  MaintenanceTaskInput,
  Property,
  PropertyInput,
  StoredDocument,
  TaskStatus,
  UUID,
} from '../types';
import { toast } from './toasts';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Resource<T> {
  status: LoadStatus;
  items: T[];
  error: string | null;
}

const idle = <T>(): Resource<T> => ({ status: 'idle', items: [], error: null });

type CollectionKey = 'properties' | 'assets' | 'tasks' | 'contacts' | 'documents';

const loaders: { [K in CollectionKey]: () => Promise<DataState[K]['items']> } = {
  properties: api.listProperties,
  assets: api.listAssets,
  tasks: api.listTasks,
  contacts: api.listContacts,
  documents: api.listDocuments,
};

interface DataState {
  bootstrap: { status: LoadStatus; error: string | null };
  properties: Resource<Property>;
  assets: Resource<Asset>;
  tasks: Resource<MaintenanceTask>;
  contacts: Resource<EmergencyContact>;
  documents: Resource<StoredDocument>;

  start(): Promise<void>;
  load(key: CollectionKey): Promise<void>;
  reset(): void;

  saveProperty(input: PropertyInput): Promise<Property>;
  saveAsset(input: AssetInput): Promise<Asset>;
  removeAsset(id: UUID): Promise<void>;
  saveTask(input: MaintenanceTaskInput): Promise<MaintenanceTask>;
  setTaskStatus(id: UUID, status: TaskStatus): Promise<void>;
  removeTask(id: UUID): Promise<void>;
  saveContact(input: EmergencyContactInput): Promise<EmergencyContact>;
  removeContact(id: UUID): Promise<void>;
  upload(upload: DocumentUpload): Promise<StoredDocument>;
  removeDocument(doc: StoredDocument): Promise<void>;
}

const upsertById = <T extends { id: UUID }>(items: T[], item: T) =>
  items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];

export const useData = create<DataState>((set, get) => {
  const patch = <K extends CollectionKey>(key: K, update: (items: DataState[K]['items']) => DataState[K]['items']) =>
    set((s) => ({ [key]: { ...s[key], items: update(s[key].items as never) } }) as Partial<DataState>);

  /** Errors are surfaced as a toast and re-thrown so forms can show them inline. */
  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      const e = toServiceError(err);
      toast(e.message, 'error');
      throw e;
    }
  };

  return {
    bootstrap: { status: 'idle', error: null },
    properties: idle(),
    assets: idle(),
    tasks: idle(),
    contacts: idle(),
    documents: idle(),

    async start() {
      const { status } = get().bootstrap;
      if (status === 'loading' || status === 'ready') return;
      set({ bootstrap: { status: 'loading', error: null } });
      try {
        await api.ensureStarterData();
        set({ bootstrap: { status: 'ready', error: null } });
      } catch (err) {
        // Starter data is optional; still try to load whatever exists.
        set({ bootstrap: { status: 'error', error: toServiceError(err).message } });
      }
      await Promise.all((Object.keys(loaders) as CollectionKey[]).map((k) => get().load(k)));
    },

    async load(key) {
      set({ [key]: { ...get()[key], status: 'loading', error: null } } as Partial<DataState>);
      try {
        const items = await loaders[key]();
        set({ [key]: { status: 'ready', items, error: null } } as Partial<DataState>);
      } catch (err) {
        set({ [key]: { ...get()[key], status: 'error', error: toServiceError(err).message } } as Partial<DataState>);
      }
    },

    reset() {
      set({
        bootstrap: { status: 'idle', error: null },
        properties: idle(),
        assets: idle(),
        tasks: idle(),
        contacts: idle(),
        documents: idle(),
      });
    },

    saveProperty: (input) =>
      run(async () => {
        const saved = await api.upsertProperty(input);
        patch('properties', (items) => upsertById(items, saved));
        return saved;
      }),

    saveAsset: (input) =>
      run(async () => {
        const saved = await api.upsertAsset(input);
        patch('assets', (items) => upsertById(items, saved));
        return saved;
      }),

    removeAsset: (id) =>
      run(async () => {
        await api.deleteAsset(id);
        patch('assets', (items) => items.filter((a) => a.id !== id));
        patch('documents', (items) => items.filter((d) => d.assetId !== id));
      }),

    saveTask: (input) =>
      run(async () => {
        const saved = await api.upsertTask(input);
        patch('tasks', (items) => upsertById(items, saved));
        return saved;
      }),

    async setTaskStatus(id, status) {
      const previous = get().tasks.items.find((t) => t.id === id);
      if (!previous || previous.status === status) return;
      // Optimistic: the Health Score updates the instant the box is ticked.
      patch('tasks', (items) =>
        items.map((t) =>
          t.id === id ? { ...t, status, completedAt: status === 'complete' ? new Date().toISOString() : null } : t,
        ),
      );
      try {
        const saved = await api.setTaskStatus(id, status);
        patch('tasks', (items) => upsertById(items, saved));
      } catch (err) {
        patch('tasks', (items) => upsertById(items, previous));
        toast(toServiceError(err).message, 'error');
      }
    },

    removeTask: (id) =>
      run(async () => {
        await api.deleteTask(id);
        patch('tasks', (items) => items.filter((t) => t.id !== id));
      }),

    saveContact: (input) =>
      run(async () => {
        const saved = await api.upsertContact(input);
        patch('contacts', (items) => upsertById(items, saved));
        return saved;
      }),

    removeContact: (id) =>
      run(async () => {
        await api.deleteContact(id);
        patch('contacts', (items) => items.filter((c) => c.id !== id));
      }),

    upload: (upload) =>
      run(async () => {
        const doc = await api.uploadDocument(upload);
        patch('documents', (items) => [doc, ...items]);
        if (doc.assetId) {
          patch('assets', (items) =>
            items.map((a) => (a.id === doc.assetId ? { ...a, documentIds: [...a.documentIds, doc.id] } : a)),
          );
        }
        return doc;
      }),

    removeDocument: (doc) =>
      run(async () => {
        await api.deleteDocument(doc);
        patch('documents', (items) => items.filter((d) => d.id !== doc.id));
        patch('assets', (items) =>
          items.map((a) => (a.id === doc.assetId ? { ...a, documentIds: a.documentIds.filter((id) => id !== doc.id) } : a)),
        );
      }),
  };
});
