/**
 * The vendor seam (decision D-1 in docs/ARCHITECTURE.md).
 *
 * The vision vendor is deferred to a measured bake-off, so everything
 * downstream - JSON extraction, schema validation, clamping, persistence,
 * matching - is written once and knows nothing about who answered.
 *
 * Adapters are thin on purpose. If an adapter starts interpreting the response
 * rather than transporting it, the comparison stops being fair.
 */

export type ProviderId = 'anthropic' | 'openai' | 'google';

export interface VisionRequest {
  /** A short-lived signed URL into the private food-photos bucket. Never a
   *  public URL, and never raw bytes on this interface - a provider that needs
   *  bytes fetches them itself. */
  readonly imageUrl: string;
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
}

export interface VisionResponse {
  /** Raw model text, deliberately unparsed: parsing belongs to the shared
   *  contract, not to a vendor adapter. */
  readonly text: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface VisionProvider {
  readonly id: ProviderId;
  analyze(request: VisionRequest): Promise<VisionResponse>;
}

export class VisionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VisionError';
  }
}

/**
 * Whether a failed call is worth repeating.
 *
 * 429 and 5xx are transient. A 400 means our request was wrong and will be
 * wrong again; retrying it spends the user's time and our money to arrive at
 * the same place.
 */
export const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

/**
 * Fetch with a hard deadline. Without one, a hung vendor connection holds the
 * function open until the platform kills it, and the user watches a spinner
 * with no error to act on.
 */
export const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
