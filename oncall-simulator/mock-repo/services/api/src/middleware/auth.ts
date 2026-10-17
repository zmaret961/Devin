import { validateSession } from '../../../auth/src/session.ts';
import { decodeToken } from '../../../auth/src/tokens.ts';
import type { ApiRequest, ApiResponse } from '../server.ts';

/** Rejects requests without a valid session with 401 Unauthorized. */
export function requireSession(req: ApiRequest): ApiResponse | undefined {
  const raw = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  const result = validateSession(decodeToken(raw));
  if (!result.ok) {
    return { status: 401, body: { error: 'unauthorized', reason: result.reason } };
  }
  return undefined;
}
