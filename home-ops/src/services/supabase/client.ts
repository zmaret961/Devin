import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from '../config';

let client: SupabaseClient | null = null;

/** The only place a Supabase client is created. Only the Supabase adapter imports this. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'homeops-auth' },
    });
  }
  return client;
}
