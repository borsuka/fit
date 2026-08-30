// Fully-qualified npm: specifier rather than a bare one resolved through an
// import map. The map declared in config.toml demonstrably does not reach the
// worker on this runtime (verified: the boot error names the bare specifier),
// and configuration that does nothing is worse than none. Deno 2 resolves this
// form natively.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Request context: who is calling, what they are entitled to, and the two
 * clients an edge function needs.
 *
 * Two clients, deliberately:
 *
 *   userClient    - carries the caller's JWT, so RLS applies. Anything read on
 *                   the user's behalf goes through this one.
 *   serviceClient - bypasses RLS. Used only for writes the user must not be
 *                   able to forge: the quota ledger, scan records, cost.
 *
 * Collapsing them into one service_role client would be simpler and would
 * quietly remove every row-level guarantee in the schema.
 */

export interface RequestContext {
  readonly userId: string;
  readonly userClient: SupabaseClient;
  readonly serviceClient: SupabaseClient;
  readonly isPremium: boolean;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const requireEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (value === undefined || value.length === 0) {
    // Fails loudly at the first request rather than producing a confusing
    // downstream error with the real cause three layers away.
    throw new HttpError(500, 'server_error', `missing environment variable ${name}`);
  }
  return value;
};

export const buildContext = async (request: Request): Promise<RequestContext> => {
  const authHeader = request.headers.get('Authorization');
  if (authHeader === null) {
    throw new HttpError(401, 'unauthorized', 'missing Authorization header');
  }

  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verifies the token against the auth server rather than decoding it here.
  // A locally-decoded JWT proves nothing about revocation.
  const { data, error } = await userClient.auth.getUser();
  if (error !== null || data.user === null) {
    throw new HttpError(401, 'unauthorized', 'invalid or expired token');
  }

  const serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Entitlement is read from the database, never from the request body. A
  // boolean a client can set is not an entitlement.
  const { data: subscription } = await serviceClient
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', data.user.id)
    .maybeSingle();

  const isPremium =
    subscription?.tier === 'premium' &&
    (subscription.status === 'active' || subscription.status === 'trialing');

  return { userId: data.user.id, userClient, serviceClient, isPremium };
};

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const errorResponse = (error: unknown): Response => {
  if (error instanceof HttpError) {
    // The message is for our logs; the client gets the stable code, which the
    // app maps to a translated sentence.
    console.error(
      JSON.stringify({ level: 'error', code: error.code, status: error.status, message: error.message }),
    );
    return jsonResponse({ error: error.code }, error.status);
  }

  console.error(
    JSON.stringify({
      level: 'error',
      code: 'server_error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return jsonResponse({ error: 'server_error' }, 500);
};
