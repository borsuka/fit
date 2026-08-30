/**
 * The error type that crosses the service boundary.
 *
 * Users never see a status code. `500 INTERNAL_SERVER_ERROR` tells someone
 * standing over their lunch nothing they can act on; "We couldn't analyze your
 * meal. Please try again." tells them whether to wait or to type it in.
 *
 * Every AppError carries both halves: `userMessage` for the UI, `cause` for
 * Sentry. Losing the cause to produce a friendly message is how a bug becomes
 * unreproducible.
 */

export type ErrorCode =
  | 'network_unavailable'
  | 'timeout'
  | 'unauthorized'
  | 'session_expired'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_failed'
  | 'quota_exceeded'
  | 'premium_required'
  | 'ai_unavailable'
  | 'ai_invalid_response'
  | 'not_food'
  | 'storage_failed'
  | 'server_error'
  | 'unknown';

export interface AppErrorOptions {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly cause?: unknown;
  readonly retryable?: boolean;
  /** Structured detail for logs. Must never contain tokens, passwords, image
   *  bytes, signed URLs, or a user's body metrics. */
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly context: Readonly<Record<string, string | number | boolean>>;

  constructor(options: AppErrorOptions) {
    super(options.userMessage, options.cause === undefined ? {} : { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(options.code);
    this.context = options.context ?? {};
  }
}

/**
 * Codes worth retrying automatically. Deliberately narrow: retrying a 403 just
 * spends the user's battery, and retrying a validation failure will fail
 * identically every time.
 */
const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'network_unavailable',
  'timeout',
  'server_error',
  'ai_unavailable',
  'storage_failed',
]);

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/**
 * Last resort at the boundary: anything thrown that is not already an AppError
 * becomes one, so the UI has exactly one error shape to render. An unknown
 * error is never assumed retryable - a retry loop on a bug is worse than the
 * bug.
 */
export const toAppError = (e: unknown, fallbackMessage: string): AppError => {
  if (isAppError(e)) return e;
  return new AppError({
    code: 'unknown',
    userMessage: fallbackMessage,
    cause: e,
    retryable: false,
  });
};
