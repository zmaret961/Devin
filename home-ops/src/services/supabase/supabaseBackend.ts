import type { PostgrestError } from '@supabase/supabase-js';
import type { AuthSession, HomeBackend } from '../backend';
import { documentsBucket } from '../config';
import { ServiceError, toServiceError } from '../errors';
import { documentStoragePath } from '../paths';
import { getSupabase } from './client';
import {
  assetFromRow,
  assetToRow,
  contactFromRow,
  contactToRow,
  documentFromRow,
  profileFromRow,
  propertyFromRow,
  propertyToRow,
  taskFromRow,
  taskToRow,
  type AssetRow,
  type ContactRow,
  type DocumentRow,
  type ProfileRow,
  type PropertyRow,
  type TaskRow,
} from './mappers';

const ASSET_SELECT = '*, documents(id)';

function check<T>(result: { data: T | null; error: PostgrestError | null }, fallback?: string): T {
  if (result.error) throw toServiceError(result.error, fallback);
  if (result.data === null) throw new ServiceError('not_found', 'That item no longer exists.');
  return result.data;
}

function checkOk(result: { error: PostgrestError | null }, fallback?: string): void {
  if (result.error) throw toServiceError(result.error, fallback);
}

/** Wraps a call so thrown fetch/network errors become friendly ServiceErrors. */
async function guard<T>(fn: () => Promise<T>, fallback?: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toServiceError(err, fallback);
  }
}

export function createSupabaseBackend(): HomeBackend {
  const sb = getSupabase();

  async function requireUserId(): Promise<string> {
    const { data, error } = await sb.auth.getSession();
    if (error) throw toServiceError(error);
    const id = data.session?.user.id;
    if (!id) throw new ServiceError('auth', 'Your session has expired. Please sign in again.');
    return id;
  }

  const toSession = (user: { id: string; email?: string | null } | null | undefined): AuthSession | null =>
    user ? { user: { id: user.id, email: user.email ?? '' } } : null;

  return {
    kind: 'supabase',

    getSession: () =>
      guard(async () => {
        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        return toSession(data.session?.user);
      }),

    onAuthChange(listener) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => listener(toSession(session?.user)));
      return () => data.subscription.unsubscribe();
    },

    signUp: (email, password) =>
      guard(async () => {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        return { session: toSession(data.session?.user), needsConfirmation: !data.session };
      }),

    signIn: (email, password) =>
      guard(async () => {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const session = toSession(data.user);
        if (!session) throw new ServiceError('auth', 'Sign-in failed. Please try again.');
        return session;
      }),

    signInWithOAuth: (provider) =>
      guard(async () => {
        const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
        if (error) throw error;
      }),

    signOut: () =>
      guard(async () => {
        const { error } = await sb.auth.signOut();
        if (error) throw error;
      }),

    getProfile: () =>
      guard(async () => {
        const id = await requireUserId();
        const res = await sb.from('profiles').select('*').eq('id', id).maybeSingle<ProfileRow>();
        checkOk(res);
        return res.data ? profileFromRow(res.data) : null;
      }),

    markSeeded: () =>
      guard(async () => {
        const id = await requireUserId();
        const { data } = await sb.auth.getSession();
        checkOk(
          await sb
            .from('profiles')
            .upsert({ id, email: data.session?.user.email ?? null, seeded_at: new Date().toISOString() }, { onConflict: 'id' }),
        );
      }),

    listProperties: () =>
      guard(async () => {
        const rows = check(await sb.from('properties').select('*').order('created_at').returns<PropertyRow[]>());
        return rows.map(propertyFromRow);
      }),

    upsertProperty: (input) =>
      guard(async () => {
        const userId = await requireUserId();
        const row = check(
          await sb.from('properties').upsert(propertyToRow(input, userId)).select('*').single<PropertyRow>(),
          'Couldn\u2019t save your home details.',
        );
        return propertyFromRow(row);
      }),

    listAssets: () =>
      guard(async () => {
        const rows = check(await sb.from('assets').select(ASSET_SELECT).order('created_at').returns<AssetRow[]>());
        return rows.map(assetFromRow);
      }),

    upsertAsset: (input) =>
      guard(async () => {
        const userId = await requireUserId();
        const row = check(
          await sb.from('assets').upsert(assetToRow(input, userId)).select(ASSET_SELECT).single<AssetRow>(),
          'Couldn\u2019t save this appliance.',
        );
        return assetFromRow(row);
      }),

    deleteAsset: (id) =>
      guard(async () => {
        // Rows cascade in Postgres, but files in Storage must be removed explicitly.
        const docs = check(await sb.from('documents').select('storage_path').eq('asset_id', id).returns<{ storage_path: string }[]>());
        if (docs.length) {
          const { error } = await sb.storage.from(documentsBucket).remove(docs.map((d) => d.storage_path));
          if (error) throw error;
        }
        checkOk(await sb.from('assets').delete().eq('id', id), 'Couldn\u2019t delete this appliance.');
      }),

    listTasks: () =>
      guard(async () => {
        const rows = check(await sb.from('maintenance_tasks').select('*').order('due_date').returns<TaskRow[]>());
        return rows.map(taskFromRow);
      }),

    upsertTask: (input) =>
      guard(async () => {
        const userId = await requireUserId();
        const row = check(
          await sb.from('maintenance_tasks').upsert(taskToRow(input, userId)).select('*').single<TaskRow>(),
          'Couldn\u2019t save this task.',
        );
        return taskFromRow(row);
      }),

    insertSeedTasks: (tasks) =>
      guard(async () => {
        const userId = await requireUserId();
        checkOk(
          await sb
            .from('maintenance_tasks')
            .upsert(
              tasks.map((t) => taskToRow(t, userId)),
              { onConflict: 'user_id,seed_key', ignoreDuplicates: true },
            ),
        );
      }),

    setTaskStatus: (id, status) =>
      guard(async () => {
        const row = check(
          await sb
            .from('maintenance_tasks')
            .update({ status, completed_at: status === 'complete' ? new Date().toISOString() : null })
            .eq('id', id)
            .select('*')
            .single<TaskRow>(),
          'Couldn\u2019t update this task.',
        );
        return taskFromRow(row);
      }),

    deleteTask: (id) =>
      guard(async () => checkOk(await sb.from('maintenance_tasks').delete().eq('id', id), 'Couldn\u2019t delete this task.')),

    listContacts: () =>
      guard(async () => {
        const rows = check(
          await sb.from('emergency_contacts').select('*').order('sort_order').order('created_at').returns<ContactRow[]>(),
        );
        return rows.map(contactFromRow);
      }),

    upsertContact: (input) =>
      guard(async () => {
        const userId = await requireUserId();
        const row = check(
          await sb.from('emergency_contacts').upsert(contactToRow(input, userId)).select('*').single<ContactRow>(),
          'Couldn\u2019t save this contact.',
        );
        return contactFromRow(row);
      }),

    insertSeedContacts: (contacts) =>
      guard(async () => {
        const userId = await requireUserId();
        checkOk(
          await sb
            .from('emergency_contacts')
            .upsert(
              contacts.map((c) => contactToRow(c, userId)),
              { onConflict: 'user_id,seed_key', ignoreDuplicates: true },
            ),
        );
      }),

    deleteContact: (id) =>
      guard(async () => checkOk(await sb.from('emergency_contacts').delete().eq('id', id), 'Couldn\u2019t delete this contact.')),

    listDocuments: () =>
      guard(async () => {
        const rows = check(await sb.from('documents').select('*').order('created_at', { ascending: false }).returns<DocumentRow[]>());
        return rows.map(documentFromRow);
      }),

    uploadDocument: ({ file, name, type, assetId }) =>
      guard(async () => {
        const userId = await requireUserId();
        const id = crypto.randomUUID();
        const fileName = file instanceof File ? file.name : name;
        const storagePath = documentStoragePath(userId, assetId, fileName, id);
        const contentType = file.type || 'application/octet-stream';
        const up = await sb.storage.from(documentsBucket).upload(storagePath, file, { contentType, upsert: false });
        if (up.error) throw up.error;
        const res = await sb
          .from('documents')
          .insert({
            id,
            user_id: userId,
            asset_id: assetId,
            name: name.trim() || fileName,
            type,
            storage_path: storagePath,
            mime_type: contentType,
            size_bytes: file.size,
          })
          .select('*')
          .single<DocumentRow>();
        if (res.error) {
          // Don't leave an orphaned file behind if the metadata row fails.
          await sb.storage.from(documentsBucket).remove([storagePath]);
          throw res.error;
        }
        return documentFromRow(check(res));
      }, 'Upload failed. Please try again.'),

    getDocumentUrl: (doc) =>
      guard(async () => {
        const { data, error } = await sb.storage.from(documentsBucket).createSignedUrl(doc.storagePath, 60 * 10);
        if (error) throw error;
        return data.signedUrl;
      }, 'Couldn\u2019t open this file.'),

    deleteDocument: (doc) =>
      guard(async () => {
        const { error } = await sb.storage.from(documentsBucket).remove([doc.storagePath]);
        if (error) throw error;
        checkOk(await sb.from('documents').delete().eq('id', doc.id), 'Couldn\u2019t delete this file.');
      }),
  };
}
