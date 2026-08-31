import { describe, expect, it } from '@jest/globals';

import { parseEvent, shouldApply, toSubscriptionState, type RevenueCatEvent } from './revenuecat';

const event = (patch: Partial<RevenueCatEvent> = {}): RevenueCatEvent => ({
  id: 'evt_1',
  type: 'INITIAL_PURCHASE',
  app_user_id: '11111111-1111-1111-1111-111111111111',
  event_timestamp_ms: 1_760_000_000_000,
  product_id: 'fit_premium_monthly',
  period_type: 'NORMAL',
  store: 'APP_STORE',
  expiration_at_ms: 1_762_592_000_000,
  ...patch,
});

const state = (e: RevenueCatEvent) => {
  const result = toSubscriptionState(e);
  if (!result.ok) throw new Error(`expected success: ${result.reason}`);
  return result.value;
};

describe('parseEvent', () => {
  it('accepts a well-formed event', () => {
    expect(parseEvent(event())?.id).toBe('evt_1');
  });

  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['no id', { ...event(), id: undefined }],
    ['no type', { ...event(), type: undefined }],
    ['no app_user_id', { ...event(), app_user_id: '' }],
    ['no timestamp', { ...event(), event_timestamp_ms: undefined }],
    ['timestamp as string', { ...event(), event_timestamp_ms: '1760000000000' }],
  ])('rejects %s', (_label, raw) => {
    expect(parseEvent(raw)).toBeNull();
  });

  it('tolerates missing optional fields', () => {
    const parsed = parseEvent({
      id: 'evt_2',
      type: 'EXPIRATION',
      app_user_id: 'u',
      event_timestamp_ms: 1,
    });
    expect(parsed?.product_id).toBeUndefined();
    expect(parsed?.expiration_at_ms).toBeNull();
  });
});

describe('toSubscriptionState - granting', () => {
  it('grants premium on an initial purchase', () => {
    const s = state(event());
    expect(s?.tier).toBe('premium');
    expect(s?.status).toBe('active');
    expect(s?.productId).toBe('fit_premium_monthly');
    expect(s?.store).toBe('app_store');
    expect(s?.currentPeriodEnd).toBe(new Date(1_762_592_000_000).toISOString());
  });

  it('marks a trial as trialing rather than active', () => {
    const s = state(event({ period_type: 'TRIAL' }));
    expect(s?.status).toBe('trialing');
    expect(s?.isTrial).toBe(true);
    expect(s?.tier).toBe('premium');
  });

  it.each(['RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE', 'TRANSFER'])(
    'keeps premium on %s',
    (type) => {
      expect(state(event({ type }))?.tier).toBe('premium');
    },
  );

  it('keeps access on CANCELLATION until the period ends', () => {
    // On every store, cancelling means "do not renew". Revoking immediately
    // takes away time the user has already paid for.
    const s = state(event({ type: 'CANCELLATION' }));
    expect(s?.tier).toBe('premium');
    expect(s?.status).toBe('cancelled');
    expect(s?.currentPeriodEnd).not.toBeNull();
  });

  it('keeps access during a billing issue', () => {
    // The store is retrying payment. Cutting someone off mid-retry punishes an
    // expired card.
    const s = state(event({ type: 'BILLING_ISSUE' }));
    expect(s?.tier).toBe('premium');
    expect(s?.status).toBe('grace');
  });

  it('maps each store', () => {
    expect(state(event({ store: 'PLAY_STORE' }))?.store).toBe('play_store');
    expect(state(event({ store: 'MAC_APP_STORE' }))?.store).toBe('app_store');
    expect(state(event({ store: 'PROMOTIONAL' }))?.store).toBe('promo');
  });

  it('leaves an unrecognised store null rather than guessing', () => {
    expect(state(event({ store: 'AMAZON' }))?.store).toBeNull();
  });
});

describe('toSubscriptionState - revoking', () => {
  it('drops to free on expiration', () => {
    const s = state(event({ type: 'EXPIRATION' }));
    expect(s?.tier).toBe('free');
    expect(s?.status).toBe('expired');
    expect(s?.isTrial).toBe(false);
  });

  it('drops to free when a subscription is paused', () => {
    expect(state(event({ type: 'SUBSCRIPTION_PAUSED' }))?.tier).toBe('free');
  });

  it('does not leave isTrial set on an expired trial', () => {
    const s = state(event({ type: 'EXPIRATION', period_type: 'TRIAL' }));
    expect(s?.isTrial).toBe(false);
    expect(s?.tier).toBe('free');
  });
});

describe('toSubscriptionState - refusals', () => {
  it('acknowledges the TEST ping without changing anything', () => {
    const result = toSubscriptionState(event({ type: 'TEST' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it('refuses an event type it has never seen', () => {
    // An unrecognised type falling through to "premium" would be a free
    // subscription for anyone who could make one up.
    const result = toSubscriptionState(event({ type: 'SOMETHING_NEW' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('SOMETHING_NEW');
  });
});

describe('shouldApply', () => {
  it('applies the first event we ever see', () => {
    expect(shouldApply(1000, null)).toBe(true);
  });

  it('applies a newer event', () => {
    expect(shouldApply(2000, 1000)).toBe(true);
  });

  it('ignores a redelivered event', () => {
    expect(shouldApply(1000, 1000)).toBe(false);
  });

  it('ignores an out-of-order event', () => {
    // A retried EXPIRATION landing after a RENEWAL would downgrade a paying
    // customer, and all they would notice is that the feature they pay for
    // stopped working.
    expect(shouldApply(500, 1000)).toBe(false);
  });
});
