import type { AuthError, PostgrestError } from '@supabase/supabase-js';

import { AppError, type ErrorCode } from '@/lib/errors';

/**
 * Translates Supabase failures into the single AppError shape the UI renders.
 *
 * `userMessage` here is an English fallback for logs and for the rare surface
 * with no translation loaded. Screens should prefer the i18n key
 * `errors.<code>`, so the code is the real contract and the string is not.
 */

/**
 * Postgres SQLSTATEs the schema can actually produce, and PostgREST's own
 * codes. Anything unmapped becomes 'server_error' rather than being guessed
 * at - a wrong-but-specific message is worse than an honest generic one.
 */
const POSTGREST_CODE_MAP: Readonly<Record<string, ErrorCode>> = {
  // PostgREST
  PGRST116: 'not_found', // .single() matched no rows
  PGRST301: 'session_expired', // JWT expired

  // Postgres
  '23505': 'conflict', // unique_violation - e.g. two weights for one day
  '23514': 'validation_failed', // check_violation - our nutrition sanity bounds
  '23503': 'validation_failed', // foreign_key_violation
  '23502': 'validation_failed', // not_null_violation
  '42501': 'forbidden', // insufficient_privilege - an RLS policy said no
  '22P02': 'validation_failed', // invalid_text_representation
  '57014': 'timeout', // query_canceled
};

const FALLBACK_MESSAGE: Readonly<Record<ErrorCode, string>> = {
  network_unavailable: "You're offline. Check your connection and try again.",
  timeout: 'That took too long. Please try again.',
  unauthorized: 'Please sign in to continue.',
  session_expired: 'Your session expired. Please sign in again.',
  forbidden: "You don't have access to that.",
  not_found: "We couldn't find that.",
  conflict: 'That was already saved.',
  validation_failed: 'Please check the highlighted fields.',
  quota_exceeded: "You've used all your scans for today.",
  premium_required: 'This is a Premium feature.',
  ai_unavailable: "We couldn't analyze your meal. Please try again.",
  ai_invalid_response: "We couldn't read the result. Please try again.",
  not_food: "That doesn't look like a meal. Try another photo?",
  storage_failed: "We couldn't upload your photo. Please try again.",
  server_error: 'Something went wrong on our side. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** The i18n key a screen should look up for this error. */
export const errorMessageKey = (code: ErrorCode): string => `errors.${code}`;

const build = (code: ErrorCode, cause: unknown, context?: Record<string, string>): AppError =>
  new AppError({
    code,
    userMessage: FALLBACK_MESSAGE[code],
    cause,
    ...(context === undefined ? {} : { context }),
  });

export const mapPostgrestError = (error: PostgrestError): AppError => {
  const mapped = POSTGREST_CODE_MAP[error.code];
  // Never log `error.message` into context: Postgres includes the offending
  // row values in constraint violations, which here means a user's weight.
  return build(mapped ?? 'server_error', error, { pgCode: error.code });
};

export const mapAuthError = (error: AuthError): AppError => {
  const status = error.status ?? 0;

  if (status === 400 || status === 401) return build('unauthorized', error);
  if (status === 403) return build('forbidden', error);
  if (status === 404) return build('not_found', error);
  if (status === 409) return build('conflict', error);
  if (status === 422) return build('validation_failed', error);
  // Supabase rate-limits sign-in and sign-up attempts. Retryable, but only
  // after a wait - the UI should say so rather than spinning.
  if (status === 429) return build('server_error', error, { rateLimited: 'true' });
  if (status >= 500) return build('server_error', error);

  // Status 0 is the fetch layer failing before any HTTP response existed:
  // no connection, DNS failure, or a captive portal.
  return build('network_unavailable', error);
};

/**
 * For anything thrown outside a Supabase response - a fetch rejection, an
 * abort, a bug in our own mapping code.
 */
export const mapUnknownError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return build('timeout', error);
  }
  if (error instanceof TypeError) {
    // fetch throws TypeError for network-level failures in every runtime we
    // target.
    return build('network_unavailable', error);
  }
  return build('unknown', error);
};
