import type { SessionToken } from './session.ts';

export function encodeToken(token: SessionToken): string {
  return Buffer.from(JSON.stringify(token)).toString('base64url');
}

export function decodeToken(raw: string | undefined): SessionToken | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number') return undefined;
    return parsed as SessionToken;
  } catch {
    return undefined;
  }
}
