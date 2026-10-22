import type {
  Asset,
  EmergencyContact,
  MaintenanceTask,
  Profile,
  Property,
  StoredDocument,
  UUID,
} from '../../types';
import type { AuthSession, HomeBackend } from '../backend';
import { ServiceError } from '../errors';
import { documentStoragePath } from '../paths';
import type { FileStore } from './fileStore';

/**
 * Demo Mode backend. Same contract as Supabase, but data lives in this
 * browser (localStorage + IndexedDB for files). Accounts here are a
 * convenience for trying the app, not real security.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface DemoUser {
  id: UUID;
  email: string;
  passwordHash: string;
}

interface Tables {
  profiles: Profile[];
  properties: Property[];
  assets: Omit<Asset, 'documentIds'>[];
  maintenance_tasks: MaintenanceTask[];
  emergency_contacts: EmergencyContact[];
  documents: StoredDocument[];
}

const PREFIX = 'homeops:demo:';

async function hashPassword(email: string, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${email.toLowerCase()}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createLocalBackend(kv: KeyValueStore, files: FileStore, opts: { latencyMs?: number } = {}): HomeBackend {
  const listeners = new Set<(s: AuthSession | null) => void>();
  const wait = () => (opts.latencyMs ? new Promise((r) => setTimeout(r, opts.latencyMs)) : Promise.resolve());

  const readJson = <T>(key: string, fallback: T): T => {
    try {
      const raw = kv.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const writeJson = (key: string, value: unknown) => {
    try {
      kv.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) {
      throw new ServiceError('storage', 'This browser is out of storage space for Demo Mode.', err);
    }
  };

  const session = (): AuthSession | null => readJson<AuthSession | null>('session', null);
  const requireUserId = (): UUID => {
    const s = session();
    if (!s) throw new ServiceError('auth', 'Your session has expired. Please sign in again.');
    return s.user.id;
  };
  const table = <K extends keyof Tables>(name: K): Tables[K] => readJson<Tables[K]>(`${requireUserId()}:${name}`, [] as Tables[K]);
  const save = <K extends keyof Tables>(name: K, rows: Tables[K]) => writeJson(`${requireUserId()}:${name}`, rows);
  const now = () => new Date().toISOString();

  function upsertRow<K extends keyof Tables>(name: K, row: Tables[K][number] & { id: UUID }) {
    const rows = table(name) as (Tables[K][number] & { id: UUID })[];
    const i = rows.findIndex((r) => r.id === row.id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
    save(name, rows as Tables[K]);
  }

  function find<K extends keyof Tables>(name: K, id: UUID): Tables[K][number] | undefined {
    return (table(name) as (Tables[K][number] & { id: UUID })[]).find((r) => r.id === id);
  }

  const setSession = (s: AuthSession | null) => {
    if (s) writeJson('session', s);
    else kv.removeItem(PREFIX + 'session');
    listeners.forEach((l) => l(s));
  };

  const withDocs = (a: Omit<Asset, 'documentIds'>): Asset => ({
    ...a,
    documentIds: table('documents')
      .filter((d) => d.assetId === a.id)
      .map((d) => d.id),
  });

  return {
    kind: 'local',

    async getSession() {
      await wait();
      return session();
    },

    onAuthChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async signUp(email, password) {
      await wait();
      const users = readJson<DemoUser[]>('users', []);
      const normalized = email.trim().toLowerCase();
      if (users.some((u) => u.email === normalized)) {
        throw new ServiceError('auth', 'An account with that email already exists. Try signing in.');
      }
      if (password.length < 8) throw new ServiceError('validation', 'Choose a password with at least 8 characters.');
      const user: DemoUser = { id: crypto.randomUUID(), email: normalized, passwordHash: await hashPassword(normalized, password) };
      writeJson('users', [...users, user]);
      const s = { user: { id: user.id, email: user.email } };
      setSession(s);
      upsertRow('profiles', { id: user.id, email: user.email, fullName: '', seededAt: null, createdAt: now() });
      return { session: s, needsConfirmation: false };
    },

    async signIn(email, password) {
      await wait();
      const normalized = email.trim().toLowerCase();
      const user = readJson<DemoUser[]>('users', []).find((u) => u.email === normalized);
      if (!user || user.passwordHash !== (await hashPassword(normalized, password))) {
        throw new ServiceError('auth', 'That email and password don\u2019t match an account.');
      }
      const s = { user: { id: user.id, email: user.email } };
      setSession(s);
      return s;
    },

    async signInWithOAuth() {
      throw new ServiceError('auth', 'Sign in with Apple needs a Supabase project. Demo Mode supports email only.');
    },

    async signOut() {
      setSession(null);
    },

    async getProfile() {
      await wait();
      return find('profiles', requireUserId()) ?? null;
    },

    async markSeeded() {
      const id = requireUserId();
      const existing = find('profiles', id);
      upsertRow('profiles', {
        id,
        email: session()?.user.email ?? '',
        fullName: existing?.fullName ?? '',
        createdAt: existing?.createdAt ?? now(),
        seededAt: now(),
      });
    },

    async listProperties() {
      await wait();
      return table('properties');
    },

    async upsertProperty(input) {
      await wait();
      const existing = input.id ? find('properties', input.id) : undefined;
      const row: Property = {
        id: existing?.id ?? crypto.randomUUID(),
        userId: requireUserId(),
        nickname: input.nickname.trim() || 'My home',
        address: input.address.trim(),
        zipCode: input.zipCode.trim(),
        yearBuilt: input.yearBuilt,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      if (row.zipCode && !/^\d{5}(-\d{4})?$/.test(row.zipCode)) {
        throw new ServiceError('validation', 'Enter a 5-digit ZIP code.');
      }
      upsertRow('properties', row);
      return row;
    },

    async listAssets() {
      await wait();
      return table('assets').map(withDocs);
    },

    async upsertAsset(input) {
      await wait();
      const existing = input.id ? find('assets', input.id) : undefined;
      const row = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        userId: requireUserId(),
        installDate: input.installDate || null,
        warrantyExpiration: input.warrantyExpiration || null,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      upsertRow('assets', row);
      return withDocs(row);
    },

    async deleteAsset(id) {
      await wait();
      const docs = table('documents').filter((d) => d.assetId === id);
      await Promise.all(docs.map((d) => files.remove(d.storagePath)));
      save('documents', table('documents').filter((d) => d.assetId !== id));
      save('assets', table('assets').filter((a) => a.id !== id));
    },

    async listTasks() {
      await wait();
      return [...table('maintenance_tasks')].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    },

    async upsertTask(input) {
      await wait();
      if (!input.title.trim()) throw new ServiceError('validation', 'Give the task a title.');
      const existing = input.id ? find('maintenance_tasks', input.id) : undefined;
      const row: MaintenanceTask = {
        ...input,
        title: input.title.trim(),
        id: existing?.id ?? crypto.randomUUID(),
        userId: requireUserId(),
        completedAt: input.status === 'complete' ? (existing?.completedAt ?? now()) : null,
        seedKey: existing?.seedKey ?? null,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      upsertRow('maintenance_tasks', row);
      return row;
    },

    async insertSeedTasks(tasks) {
      const userId = requireUserId();
      const rows = table('maintenance_tasks');
      const keys = new Set(rows.map((r) => r.seedKey));
      for (const t of tasks) {
        if (keys.has(t.seedKey)) continue;
        rows.push({ ...t, id: crypto.randomUUID(), userId, completedAt: null, createdAt: now(), updatedAt: now() });
      }
      save('maintenance_tasks', rows);
    },

    async setTaskStatus(id, status) {
      await wait();
      const existing = find('maintenance_tasks', id);
      if (!existing) throw new ServiceError('not_found', 'That item no longer exists.');
      const row: MaintenanceTask = { ...existing, status, completedAt: status === 'complete' ? now() : null, updatedAt: now() };
      upsertRow('maintenance_tasks', row);
      return row;
    },

    async deleteTask(id) {
      await wait();
      save('maintenance_tasks', table('maintenance_tasks').filter((t) => t.id !== id));
    },

    async listContacts() {
      await wait();
      return [...table('emergency_contacts')].sort((a, b) => a.sortOrder - b.sortOrder);
    },

    async upsertContact(input) {
      await wait();
      const existing = input.id ? find('emergency_contacts', input.id) : undefined;
      const row: EmergencyContact = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        userId: requireUserId(),
        seedKey: existing?.seedKey ?? null,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      upsertRow('emergency_contacts', row);
      return row;
    },

    async insertSeedContacts(contacts) {
      const userId = requireUserId();
      const rows = table('emergency_contacts');
      const keys = new Set(rows.map((r) => r.seedKey));
      for (const c of contacts) {
        if (keys.has(c.seedKey)) continue;
        rows.push({ ...c, id: crypto.randomUUID(), userId, createdAt: now(), updatedAt: now() });
      }
      save('emergency_contacts', rows);
    },

    async deleteContact(id) {
      await wait();
      save('emergency_contacts', table('emergency_contacts').filter((c) => c.id !== id));
    },

    async listDocuments() {
      await wait();
      return [...table('documents')].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async uploadDocument({ file, name, type, assetId }) {
      await wait();
      const userId = requireUserId();
      if (assetId && !find('assets', assetId)) throw new ServiceError('not_found', 'That appliance no longer exists.');
      const id = crypto.randomUUID();
      const fileName = file instanceof File ? file.name : name;
      const storagePath = documentStoragePath(userId, assetId, fileName, id);
      try {
        await files.put(storagePath, file);
      } catch (err) {
        throw new ServiceError('storage', 'This browser couldn\u2019t store the file.', err);
      }
      const doc: StoredDocument = {
        id,
        userId,
        assetId,
        name: name.trim() || fileName,
        type,
        storagePath,
        mimeType: file.type,
        sizeBytes: file.size,
        createdAt: now(),
      };
      upsertRow('documents', doc);
      return doc;
    },

    async getDocumentUrl(doc) {
      const blob = await files.get(doc.storagePath);
      if (!blob) throw new ServiceError('not_found', 'This file is no longer stored on this device.');
      return URL.createObjectURL(blob);
    },

    async deleteDocument(doc) {
      await wait();
      await files.remove(doc.storagePath);
      save('documents', table('documents').filter((d) => d.id !== doc.id));
    },
  };
}
