const env = import.meta.env;

export const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim();
export const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const documentsBucket = (env.VITE_SUPABASE_DOCUMENTS_BUCKET ?? '').trim() || 'home-documents';
export const appleSignInEnabled = env.VITE_ENABLE_APPLE_SIGN_IN === 'true';

/** Without both values the app runs in on-device Demo Mode. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
