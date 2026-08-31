import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  parseEvent,
  shouldApply,
  toSubscriptionState,
} from '../../../shared/billing-contracts/revenuecat.ts';

/**
 * POST /functions/v1/revenuecat-webhook
 * Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
 *
 * The only writer of `subscriptions`. Entitlement is the one thing a client
 * must never assert about itself, so the path is store -> RevenueCat -> here ->
 * database (service_role), and every expensive operation re-reads it
 * server-side. The app's `isPremium` is a hint for showing a paywall.
 *
 * verify_jwt is off because RevenueCat has no user session. Authorisation is
 * the shared secret configured in their dashboard, compared in constant time.
 */

/**
 * Constant-time comparison.
 *
 * `a === b` returns early at the first differing byte, so response timing leaks
 * a matching prefix and the secret can be recovered a character at a time. Rare
 * to exploit across a network, cheap to avoid, and the cost of getting it wrong
 * is that anyone can grant themselves a subscription.
 */
const secretsMatch = (a: string, b: string): boolean => {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const log = (event: string, fields: Record<string, unknown>): void => {
  console.log(JSON.stringify({ level: 'info', event, ...fields }));
};

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const expected = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
    const provided = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');

    // An unset secret denies. A misconfigured deploy must not leave an open
    // endpoint that hands out subscriptions.
    if (expected.length === 0 || !secretsMatch(expected, provided)) {
      console.error(JSON.stringify({ level: 'error', event: 'webhook_unauthorized' }));
      return json({ error: 'unauthorized' }, 401);
    }

    const body = (await request.json().catch(() => null)) as { event?: unknown } | null;
    const parsed = parseEvent(body?.event);

    if (parsed === null) {
      // 400, not 500: RevenueCat retries 5xx, and retrying a malformed body
      // just repeats the same rejection on a schedule.
      return json({ error: 'validation_failed' }, 400);
    }

    const mapped = toSubscriptionState(parsed);
    if (!mapped.ok) {
      // An event type we do not model. 200 so RevenueCat stops retrying, logged
      // loudly so we notice a type worth handling rather than discovering it
      // through a support ticket.
      console.error(
        JSON.stringify({ level: 'error', event: 'webhook_unhandled_type', reason: mapped.reason }),
      );
      return json({ ok: true, applied: false, reason: 'unhandled_type' });
    }

    if (mapped.value === null) {
      log('webhook_test_ping', { event_id: parsed.id });
      return json({ ok: true, applied: false, reason: 'test_ping' });
    }

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (url === undefined || serviceKey === undefined) return json({ error: 'server_error' }, 500);

    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // RevenueCat's app_user_id is our auth user id, set by the client at login.
    // A row that does not exist means the account was deleted between purchase
    // and delivery - which is not an error worth retrying.
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id')
      .eq('id', parsed.app_user_id)
      .maybeSingle();

    if (profileError !== null) return json({ error: 'server_error' }, 500);
    if (profile === null) {
      log('webhook_unknown_user', { event_id: parsed.id });
      return json({ ok: true, applied: false, reason: 'unknown_user' });
    }

    const { data: existing } = await db
      .from('subscriptions')
      .select('last_event_ms')
      .eq('user_id', profile.id)
      .maybeSingle();

    if (!shouldApply(mapped.value.eventMs, existing?.last_event_ms ?? null)) {
      log('webhook_stale_event', { event_id: parsed.id, event_ms: mapped.value.eventMs });
      return json({ ok: true, applied: false, reason: 'stale_event' });
    }

    const { error: writeError } = await db.from('subscriptions').upsert(
      {
        user_id: profile.id,
        tier: mapped.value.tier,
        status: mapped.value.status,
        store: mapped.value.store,
        product_id: mapped.value.productId,
        rc_app_user_id: parsed.app_user_id,
        current_period_end: mapped.value.currentPeriodEnd,
        is_trial: mapped.value.isTrial,
        last_event_ms: mapped.value.eventMs,
        last_event_id: parsed.id,
      },
      { onConflict: 'user_id' },
    );

    if (writeError !== null) {
      // 500 so RevenueCat retries: a database blip must not silently lose a
      // purchase the user has already paid for.
      console.error(
        JSON.stringify({ level: 'error', event: 'webhook_write_failed', message: writeError.message }),
      );
      return json({ error: 'server_error' }, 500);
    }

    log('webhook_applied', {
      event_id: parsed.id,
      event_type: parsed.type,
      tier: mapped.value.tier,
      status: mapped.value.status,
    });

    return json({ ok: true, applied: true });
  } catch (error) {
    console.error(
      JSON.stringify({ level: 'error', event: 'webhook_failed', message: String(error) }),
    );
    return json({ error: 'server_error' }, 500);
  }
});
