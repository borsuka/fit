import type { AuthError, PostgrestError } from '@supabase/supabase-js';
import { describe, expect, it } from '@jest/globals';

import { AppError } from '@/lib/errors';

import { errorMessageKey, mapAuthError, mapPostgrestError, mapUnknownError } from './errors';

const pgError = (code: string): PostgrestError =>
  ({
    code,
    message: 'new row for relation "weight_logs" violates check constraint — weight_kg=412',
    details: '',
    hint: '',
    name: 'PostgrestError',
  }) as PostgrestError;

const authError = (status: number): AuthError =>
  ({ status, message: 'boom', name: 'AuthApiError', code: undefined }) as unknown as AuthError;

describe('mapPostgrestError', () => {
  const cases: [label: string, pgCode: string, expected: string][] = [
    ['no rows from .single()', 'PGRST116', 'not_found'],
    ['expired JWT', 'PGRST301', 'session_expired'],
    ['unique violation', '23505', 'conflict'],
    ['check violation', '23514', 'validation_failed'],
    ['foreign key violation', '23503', 'validation_failed'],
    ['not null violation', '23502', 'validation_failed'],
    ['RLS denial', '42501', 'forbidden'],
    ['bad uuid text', '22P02', 'validation_failed'],
    ['query cancelled', '57014', 'timeout'],
  ];

  it.each(cases)('maps %s', (_label, pgCode, expected) => {
    expect(mapPostgrestError(pgError(pgCode)).code).toBe(expected);
  });

  it('falls back to server_error for an unmapped code', () => {
    // A wrong-but-specific message is worse than an honest generic one.
    expect(mapPostgrestError(pgError('XX000')).code).toBe('server_error');
  });

  it('keeps the original error as the cause for Sentry', () => {
    const original = pgError('23505');
    const mapped = mapPostgrestError(original);
    expect(mapped.cause).toBe(original);
  });

  it('never copies the Postgres message into logged context', () => {
    // Constraint violations include the offending row values, which here means
    // a user's body weight. That belongs nowhere near a log line.
    const mapped = mapPostgrestError(pgError('23514'));
    const serialised = JSON.stringify(mapped.context);
    expect(serialised).not.toContain('412');
    expect(serialised).not.toContain('weight_kg');
    expect(mapped.context).toEqual({ pgCode: '23514' });
  });

  it('does not mark a validation failure retryable', () => {
    // It would fail identically every time.
    expect(mapPostgrestError(pgError('23514')).retryable).toBe(false);
    expect(mapPostgrestError(pgError('42501')).retryable).toBe(false);
  });

  it('marks a timeout retryable', () => {
    expect(mapPostgrestError(pgError('57014')).retryable).toBe(true);
  });
});

describe('mapAuthError', () => {
  const cases: [label: string, status: number, expected: string][] = [
    ['bad credentials', 400, 'unauthorized'],
    ['missing token', 401, 'unauthorized'],
    ['forbidden', 403, 'forbidden'],
    ['not found', 404, 'not_found'],
    ['already registered', 409, 'conflict'],
    ['unprocessable', 422, 'validation_failed'],
    ['rate limited', 429, 'server_error'],
    ['upstream failure', 500, 'server_error'],
    ['gateway failure', 503, 'server_error'],
  ];

  it.each(cases)('maps %s', (_label, status, expected) => {
    expect(mapAuthError(authError(status)).code).toBe(expected);
  });

  it('treats a missing status as a network failure', () => {
    // Status 0 is the fetch layer failing before any HTTP response existed:
    // no connection, DNS failure, or a captive portal.
    expect(mapAuthError(authError(0)).code).toBe('network_unavailable');
  });

  it('flags rate limiting in context so the UI can say to wait', () => {
    expect(mapAuthError(authError(429)).context).toEqual({ rateLimited: 'true' });
  });
});

describe('mapUnknownError', () => {
  it('passes an AppError through unchanged', () => {
    const original = new AppError({ code: 'quota_exceeded', userMessage: 'nope' });
    expect(mapUnknownError(original)).toBe(original);
  });

  it('treats a TypeError as a network failure', () => {
    // fetch throws TypeError for network-level failures in every runtime we
    // target.
    expect(mapUnknownError(new TypeError('Network request failed')).code).toBe(
      'network_unavailable',
    );
  });

  it('treats an abort as a timeout', () => {
    expect(mapUnknownError(new DOMException('aborted', 'AbortError')).code).toBe('timeout');
  });

  it('does not assume an unrecognised throw is retryable', () => {
    // A retry loop on a bug is worse than the bug.
    const mapped = mapUnknownError(new Error('something odd'));
    expect(mapped.code).toBe('unknown');
    expect(mapped.retryable).toBe(false);
  });

  it('handles a thrown non-Error value', () => {
    expect(mapUnknownError('a string').code).toBe('unknown');
  });
});

describe('errorMessageKey', () => {
  it('produces the i18n key the UI looks up', () => {
    // The code is the contract; the English string on AppError is only a
    // fallback for logs.
    expect(errorMessageKey('quota_exceeded')).toBe('errors.quota_exceeded');
  });
});
