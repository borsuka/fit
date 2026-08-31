/**
 * RevenueCat webhook events, mapped to the subscription state we store.
 *
 * Dependency-free and shared with the Deno edge runtime, for the same reason as
 * the other contracts in this folder.
 *
 * Entitlement is the one thing in this app a client must never be able to
 * assert about itself, so the whole path is: store -> RevenueCat -> this
 * webhook -> `subscriptions` (service_role) -> read back server-side before
 * anything expensive happens. The client's `isPremium` is a hint for showing a
 * paywall and nothing more.
 */

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'trialing' | 'grace' | 'expired' | 'cancelled';

/** Every event type RevenueCat sends. Listed exhaustively rather than matched
 *  loosely: a type we have never seen must not silently grant entitlement. */
export const KNOWN_EVENT_TYPES = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'TRANSFER',
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'TEST',
] as const;

export type EventType = (typeof KNOWN_EVENT_TYPES)[number];

export interface RevenueCatEvent {
  readonly id: string;
  readonly type: string;
  readonly app_user_id: string;
  readonly event_timestamp_ms: number;
  readonly product_id?: string;
  readonly period_type?: string;
  readonly store?: string;
  readonly expiration_at_ms?: number | null;
}

export interface SubscriptionState {
  readonly tier: SubscriptionTier;
  readonly status: SubscriptionStatus;
  readonly productId: string | null;
  readonly store: 'app_store' | 'play_store' | 'promo' | null;
  readonly currentPeriodEnd: string | null;
  readonly isTrial: boolean;
  readonly eventMs: number;
}

export type MappingResult =
  | { readonly ok: true; readonly value: SubscriptionState }
  | { readonly ok: false; readonly reason: string }
  /** A valid event we deliberately do not act on, e.g. RevenueCat's TEST ping. */
  | { readonly ok: true; readonly value: null };

const STORE_MAP: Readonly<Record<string, SubscriptionState['store']>> = {
  APP_STORE: 'app_store',
  MAC_APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
  PROMOTIONAL: 'promo',
};

/**
 * Which events grant access and which withdraw it.
 *
 * CANCELLATION is deliberately in the granting group: on every store, cancelling
 * means "do not renew", and the user keeps what they paid for until the period
 * ends. Treating it as immediate revocation would take away time someone has
 * already bought - and EXPIRATION arrives later to do the actual withdrawing.
 */
const GRANTS_ACCESS: ReadonlySet<string> = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'TRANSFER',
  'CANCELLATION',
]);

const REVOKES_ACCESS: ReadonlySet<string> = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const parseEvent = (raw: unknown): RevenueCatEvent | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;

  if (typeof e.id !== 'string' || e.id.length === 0) return null;
  if (typeof e.type !== 'string' || e.type.length === 0) return null;
  if (typeof e.app_user_id !== 'string' || e.app_user_id.length === 0) return null;
  if (!isFiniteNumber(e.event_timestamp_ms)) return null;

  // Optional fields are spread in only when present. Under
  // exactOptionalPropertyTypes an explicit `undefined` is not the same as an
  // absent key, and assigning one is a type error rather than a shrug.
  return {
    id: e.id,
    type: e.type,
    app_user_id: e.app_user_id,
    event_timestamp_ms: e.event_timestamp_ms,
    expiration_at_ms: isFiniteNumber(e.expiration_at_ms) ? e.expiration_at_ms : null,
    ...(typeof e.product_id === 'string' ? { product_id: e.product_id } : {}),
    ...(typeof e.period_type === 'string' ? { period_type: e.period_type } : {}),
    ...(typeof e.store === 'string' ? { store: e.store } : {}),
  };
};

export const toSubscriptionState = (event: RevenueCatEvent): MappingResult => {
  // RevenueCat's test ping carries no real entitlement. Acknowledged so the
  // dashboard shows a green check, acted on not at all.
  if (event.type === 'TEST') return { ok: true, value: null };

  const grants = GRANTS_ACCESS.has(event.type);
  const revokes = REVOKES_ACCESS.has(event.type);

  // BILLING_ISSUE is neither: the store is retrying payment and the user is in
  // a grace period. Cutting them off mid-retry punishes an expired card.
  const isBillingIssue = event.type === 'BILLING_ISSUE';

  if (!grants && !revokes && !isBillingIssue) {
    // An unrecognised type must not fall through to "premium". Refusing to
    // guess is the whole point of listing them.
    return { ok: false, reason: `unhandled event type: ${event.type}` };
  }

  const isTrial = event.period_type === 'TRIAL';
  const expiry =
    event.expiration_at_ms !== null && event.expiration_at_ms !== undefined
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

  const status: SubscriptionStatus = revokes
    ? 'expired'
    : isBillingIssue
      ? 'grace'
      : event.type === 'CANCELLATION'
        ? 'cancelled'
        : isTrial
          ? 'trialing'
          : 'active';

  return {
    ok: true,
    value: {
      // Cancelled and grace both still carry the tier: the entitlement check
      // reads tier AND status, and the period end decides when it lapses.
      tier: revokes ? 'free' : 'premium',
      status,
      productId: event.product_id ?? null,
      store: event.store === undefined ? null : (STORE_MAP[event.store] ?? null),
      currentPeriodEnd: expiry,
      isTrial: isTrial && !revokes,
      eventMs: event.event_timestamp_ms,
    },
  };
};

/**
 * Whether an incoming event should overwrite what we already hold.
 *
 * Webhooks arrive out of order and get redelivered. Without this, a retried
 * EXPIRATION landing after a RENEWAL downgrades a paying customer - and the
 * only thing they will notice is that the feature they pay for stopped working.
 */
export const shouldApply = (incomingMs: number, storedMs: number | null): boolean =>
  storedMs === null || incomingMs > storedMs;
