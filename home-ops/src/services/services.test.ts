import { describe, expect, it } from 'vitest';
import { documentStoragePath, safeFileName } from './paths';
import { ServiceError, toServiceError } from './errors';

describe('storage paths', () => {
  it('sanitizes file names', () => {
    expect(safeFileName('My Manual (v2).PDF')).toBe('my-manual-v2.pdf');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('.pdf')).toBe('pdf');
  });

  it('puts the owner id first so storage RLS applies', () => {
    const p = documentStoragePath('user-1', null, 'Policy.pdf', 'doc-1');
    expect(p).toBe('user-1/general/doc-1-policy.pdf');
    expect(p.split('/')[0]).toBe('user-1');
  });
});

describe('toServiceError', () => {
  it('maps network failures', () => {
    expect(toServiceError(new TypeError('Failed to fetch')).code).toBe('network');
  });
  it('maps auth and RLS errors', () => {
    expect(toServiceError({ message: 'Invalid login credentials' }).code).toBe('auth');
    expect(toServiceError({ message: 'new row violates row-level security policy', code: '42501' }).code).toBe('permission');
  });
  it('passes ServiceErrors through and never leaks raw messages for unknown errors', () => {
    const e = new ServiceError('validation', 'x');
    expect(toServiceError(e)).toBe(e);
    expect(toServiceError(new Error('pg internal detail')).message).not.toContain('pg internal');
  });
});
