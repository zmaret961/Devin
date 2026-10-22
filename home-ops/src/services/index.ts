/**
 * Public data-access API for the app. UI code imports from here only, so it
 * never knows (or cares) whether data comes from Supabase or Demo Mode.
 */
import { buildSeedContacts, buildSeedTasks } from '../lib/seed';
import type {
  AssetInput,
  DocumentUpload,
  EmergencyContactInput,
  MaintenanceTaskInput,
  PropertyInput,
  StoredDocument,
  TaskStatus,
  UUID,
} from '../types';
import type { AuthSession, HomeBackend, OAuthProvider } from './backend';
import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, appleSignInEnabled, isSupabaseConfigured } from './config';
import { ServiceError } from './errors';
import { createIndexedDbFileStore, createMemoryFileStore } from './local/fileStore';
import { createLocalBackend, type KeyValueStore } from './local/localBackend';
import { createSupabaseBackend } from './supabase/supabaseBackend';

export type { AuthSession, OAuthProvider } from './backend';
export { ServiceError, toServiceError } from './errors';
export { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES };

function memoryKv(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function browserKv(): KeyValueStore {
  try {
    const probe = '__homeops_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryKv();
  }
}

function createBackend(): HomeBackend {
  if (isSupabaseConfigured) return createSupabaseBackend();
  const files = typeof indexedDB !== 'undefined' ? createIndexedDbFileStore() : createMemoryFileStore();
  return createLocalBackend(browserKv(), files, { latencyMs: 150 });
}

let backend: HomeBackend = createBackend();

/** Test hook: swap in a backend (e.g. a local one with in-memory storage). */
export function setBackend(next: HomeBackend) {
  backend = next;
  seeding = null;
}

export const isDemoMode = () => backend.kind === 'local';
export const canUseAppleSignIn = () => appleSignInEnabled && backend.kind === 'supabase';

// --- Auth --------------------------------------------------------------------
export const getSession = () => backend.getSession();
export const onAuthChange = (listener: (session: AuthSession | null) => void) => backend.onAuthChange(listener);
export const signUp = (email: string, password: string) => backend.signUp(email.trim(), password);
export const signIn = (email: string, password: string) => backend.signIn(email.trim(), password);
export const signInWithProvider = (provider: OAuthProvider) => backend.signInWithOAuth(provider);
export const signOut = () => {
  seeding = null;
  return backend.signOut();
};

// --- Starter data --------------------------------------------------------------
let seeding: Promise<void> | null = null;

/**
 * First sign-in: create a default property, the seasonal checklist and blank
 * emergency-contact rows. Idempotent (seed keys are unique per user) and
 * de-duplicated if called twice at once (React StrictMode).
 */
export function ensureStarterData(today = new Date()): Promise<void> {
  seeding ??= (async () => {
    const profile = await backend.getProfile();
    if (profile?.seededAt) return;
    const properties = await backend.listProperties();
    const property =
      properties[0] ?? (await backend.upsertProperty({ nickname: 'My home', address: '', zipCode: '', yearBuilt: null }));
    await backend.insertSeedTasks(buildSeedTasks(today, property.id));
    await backend.insertSeedContacts(buildSeedContacts());
    await backend.markSeeded();
  })().catch((err) => {
    seeding = null;
    throw err;
  });
  return seeding;
}

// --- Profile & property --------------------------------------------------------
export const getProfile = () => backend.getProfile();
export const listProperties = () => backend.listProperties();
export const upsertProperty = (input: PropertyInput) => backend.upsertProperty(input);

// --- Assets ----------------------------------------------------------------------
export const listAssets = () => backend.listAssets();
export const upsertAsset = (input: AssetInput) => backend.upsertAsset(input);
export const deleteAsset = (id: UUID) => backend.deleteAsset(id);

// --- Maintenance -----------------------------------------------------------------
export const listTasks = () => backend.listTasks();
export const upsertTask = (input: MaintenanceTaskInput) => {
  if (!input.title.trim()) return Promise.reject(new ServiceError('validation', 'Give the task a title.'));
  return backend.upsertTask(input);
};
export const setTaskStatus = (id: UUID, status: TaskStatus) => backend.setTaskStatus(id, status);
export const deleteTask = (id: UUID) => backend.deleteTask(id);

// --- Emergency contacts ------------------------------------------------------------
export const listContacts = () => backend.listContacts();
export const upsertContact = (input: EmergencyContactInput) => backend.upsertContact(input);
export const deleteContact = (id: UUID) => backend.deleteContact(id);

// --- Documents ------------------------------------------------------------------------
export const listDocuments = () => backend.listDocuments();
export function uploadDocument(upload: DocumentUpload) {
  if (upload.file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(new ServiceError('storage', 'That file is too large. The limit is 25 MB.'));
  }
  if (upload.file.type && !ACCEPTED_UPLOAD_TYPES.includes(upload.file.type)) {
    return Promise.reject(new ServiceError('storage', 'Upload a PDF or a photo (JPG, PNG, HEIC).'));
  }
  return backend.uploadDocument(upload);
}
export const getDocumentUrl = (doc: StoredDocument) => backend.getDocumentUrl(doc);
export const deleteDocument = (doc: StoredDocument) => backend.deleteDocument(doc);
