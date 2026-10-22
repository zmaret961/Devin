export type ServiceErrorCode = 'network' | 'auth' | 'not_found' | 'validation' | 'permission' | 'storage' | 'unknown';

/** Error thrown by every service function. `message` is safe to show to the user. */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly cause?: unknown;

  constructor(code: ServiceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.cause = cause;
  }
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
}

const NETWORK_HINTS = ['failed to fetch', 'networkerror', 'network request failed', 'load failed', 'fetch failed'];

export function toServiceError(err: unknown, fallback = 'Something went wrong. Please try again.'): ServiceError {
  if (err instanceof ServiceError) return err;
  const e = (typeof err === 'object' && err !== null ? err : {}) as ErrorLike;
  const raw = typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : '';
  const lower = raw.toLowerCase();
  const status = Number(e.status ?? e.statusCode ?? 0);
  const code = typeof e.code === 'string' ? e.code : '';

  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || NETWORK_HINTS.some((h) => lower.includes(h))) {
    return new ServiceError('network', "Can't reach the server. Check your connection and try again.", err);
  }
  if (lower.includes('invalid login credentials')) {
    return new ServiceError('auth', 'That email and password don\u2019t match an account.', err);
  }
  if (lower.includes('user already registered')) {
    return new ServiceError('auth', 'An account with that email already exists. Try signing in.', err);
  }
  if (lower.includes('email not confirmed')) {
    return new ServiceError('auth', 'Check your inbox and confirm your email first.', err);
  }
  if (lower.includes('password should be') || lower.includes('weak password')) {
    return new ServiceError('validation', 'Choose a password with at least 8 characters.', err);
  }
  if (lower.includes('jwt') || status === 401 || code === 'PGRST301') {
    return new ServiceError('auth', 'Your session has expired. Please sign in again.', err);
  }
  if (code === '42501' || status === 403 || lower.includes('row-level security')) {
    return new ServiceError('permission', 'You don\u2019t have access to that item.', err);
  }
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22007' || code === '22008') {
    return new ServiceError('validation', 'Some details look invalid. Check the highlighted fields.', err);
  }
  if (code === 'PGRST116' || status === 404) {
    return new ServiceError('not_found', 'That item no longer exists.', err);
  }
  if (lower.includes('payload too large') || status === 413 || lower.includes('maximum allowed size')) {
    return new ServiceError('storage', 'That file is too large. The limit is 25 MB.', err);
  }
  if (lower.includes('mime type') || lower.includes('invalid_mime_type')) {
    return new ServiceError('storage', 'Upload a PDF or a photo (JPG, PNG, HEIC).', err);
  }
  return new ServiceError('unknown', fallback, err);
}
