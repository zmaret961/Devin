import { createLogger } from '../../../packages/shared/src/logger.ts';

const log = createLogger('auth-service');

/** Decoded session token. `iat` and `exp` are JWT NumericDates (seconds since epoch). */
export interface SessionToken {
  sub: string;
  iat: number;
  exp: number;
  scope: string[];
}

export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export function issueSession(sub: string, scope: string[], now = Date.now()): SessionToken {
  const iat = Math.floor(now / 1000);
  return { sub, iat, exp: iat + SESSION_TTL_SECONDS, scope };
}

export function isExpired(token: SessionToken, now = Date.now()): boolean {
  return token.exp < now;
}

export function validateSession(token: SessionToken | undefined, now = Date.now()): { ok: boolean; reason?: string } {
  if (!token) return { ok: false, reason: 'missing_token' };
  if (isExpired(token, now)) {
    log.info('session expired', { sub: token.sub });
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}
