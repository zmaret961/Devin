import type { UUID } from '../types';

/** `My Manual (v2).pdf` -> `my-manual-v2.pdf`; keeps storage keys URL- and policy-safe. */
export function safeFileName(input: string): string {
  const name = input.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^\w]/g, '').toLowerCase().slice(0, 8) : '';
  return `${base || 'file'}${ext ? `.${ext}` : ''}`;
}

/** First path segment is the owner's id; the storage RLS policies depend on it. */
export function documentStoragePath(userId: UUID, assetId: UUID | null, fileName: string, id: UUID): string {
  return `${userId}/${assetId ?? 'general'}/${id}-${safeFileName(fileName)}`;
}
