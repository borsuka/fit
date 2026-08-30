import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Scheduled data lifecycle worker.
 *
 *   POST /functions/v1/data-lifecycle
 *   X-Lifecycle-Secret: <LIFECYCLE_SECRET>
 *
 * Three jobs, all about the lifecycle of user data:
 *
 *   exports    - GDPR Article 15. Build the archive, put it where only that
 *                user can read it.
 *   deletions  - GDPR Article 17. Remove the files, then the account.
 *   photos     - retention. Delete image bytes past their expiry.
 *
 * Runs as service_role, which bypasses RLS. That is necessary here and nowhere
 * else in the app: every job acts across users by design.
 */

const EXPORT_TTL_DAYS = 7;
const BATCH_LIMIT = 25;

/**
 * Constant-time comparison.
 *
 * `a === b` on a secret returns early at the first differing byte, so response
 * timing leaks a matching prefix and the secret can be recovered one character
 * at a time. Rare in practice against a network, cheap to avoid, and the cost
 * of getting it wrong is that anyone can trigger deletions.
 */
const secretsMatch = (a: string, b: string): boolean => {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  // Length is compared without branching too, by folding it into the result.
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
};

interface JobResult {
  readonly processed: number;
  readonly failed: number;
}

const log = (event: string, fields: Record<string, unknown> = {}): void => {
  // Never a user id in a lifecycle log. The whole point of an erasure job is to
  // stop holding identifiers, and a log line outlives the row it describes.
  console.log(JSON.stringify({ level: 'info', event, ...fields }));
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const runExports = async (db: SupabaseClient): Promise<JobResult> => {
  const { data: requests, error } = await db
    .from('export_requests')
    .select('id, user_id, requested_at')
    .eq('status', 'pending')
    .order('requested_at')
    .limit(BATCH_LIMIT);

  if (error !== null) throw new Error(`export_requests: ${error.message}`);

  let processed = 0;
  let failed = 0;

  for (const request of requests ?? []) {
    try {
      await db.from('export_requests').update({ status: 'processing' }).eq('id', request.id);

      const { data: payload, error: exportError } = await db.rpc('export_user_data', {
        p_user_id: request.user_id,
      });
      if (exportError !== null) throw new Error(exportError.message);

      const path = `${request.user_id}/${request.id}.json`;
      const { error: uploadError } = await db.storage
        .from('exports')
        .upload(path, JSON.stringify(payload, null, 2), {
          contentType: 'application/json',
          upsert: true,
        });
      if (uploadError !== null) throw new Error(uploadError.message);

      const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 86_400_000).toISOString();
      await db
        .from('export_requests')
        .update({ status: 'completed', file_path: path, expires_at: expiresAt })
        .eq('id', request.id);

      processed += 1;
    } catch (e) {
      failed += 1;
      // Marked failed rather than left processing: a request stuck in an
      // intermediate state is invisible to both the user and the next run.
      await db.from('export_requests').update({ status: 'failed' }).eq('id', request.id);
      console.error(
        JSON.stringify({ level: 'error', event: 'export_failed', message: String(e) }),
      );
    }
  }

  return { processed, failed };
};

// ---------------------------------------------------------------------------
// Deletions
// ---------------------------------------------------------------------------

const removeUserFolder = async (
  db: SupabaseClient,
  bucket: string,
  userId: string,
): Promise<void> => {
  const { data: files, error } = await db.storage.from(bucket).list(userId, { limit: 1000 });
  if (error !== null) throw new Error(`${bucket} list: ${error.message}`);
  if (files === null || files.length === 0) return;

  const paths = files.map((file) => `${userId}/${file.name}`);
  const { error: removeError } = await db.storage.from(bucket).remove(paths);
  if (removeError !== null) throw new Error(`${bucket} remove: ${removeError.message}`);
};

const runDeletions = async (db: SupabaseClient): Promise<JobResult> => {
  const { data: requests, error } = await db
    .from('deletion_requests')
    .select('id, user_id, requested_at')
    .eq('status', 'pending')
    .order('requested_at')
    .limit(BATCH_LIMIT);

  if (error !== null) throw new Error(`deletion_requests: ${error.message}`);

  let processed = 0;
  let failed = 0;

  for (const request of requests ?? []) {
    try {
      await db.from('deletion_requests').update({ status: 'processing' }).eq('id', request.id);

      // Files FIRST. Deleting the account cascades every row away, including
      // the paths - and storage objects are not covered by that cascade, so the
      // photos would survive with nothing left pointing at them.
      await removeUserFolder(db, 'food-photos', request.user_id);
      await removeUserFolder(db, 'recipe-images', request.user_id);
      await removeUserFolder(db, 'exports', request.user_id);

      // Then the account. profiles references auth.users on delete cascade, and
      // everything else references profiles, so this one call removes the lot.
      const { error: authError } = await db.auth.admin.deleteUser(request.user_id);
      if (authError !== null) throw new Error(`auth: ${authError.message}`);

      // The request row went with the cascade, so completion is recorded in a
      // table that holds no identifier. See the migration for why.
      await db.from('deletion_audit').insert({ requested_at: request.requested_at });

      processed += 1;
    } catch (e) {
      failed += 1;
      await db.from('deletion_requests').update({ status: 'failed' }).eq('id', request.id);
      console.error(
        JSON.stringify({ level: 'error', event: 'deletion_failed', message: String(e) }),
      );
    }
  }

  return { processed, failed };
};

// ---------------------------------------------------------------------------
// Photo retention
// ---------------------------------------------------------------------------

const runPhotoExpiry = async (db: SupabaseClient): Promise<JobResult> => {
  const { data: expired, error } = await db.rpc('expired_photo_paths', { p_limit: 500 });
  if (error !== null) throw new Error(`expired_photo_paths: ${error.message}`);

  const rows = (expired ?? []) as { scan_id: string; image_path: string }[];
  if (rows.length === 0) return { processed: 0, failed: 0 };

  const { error: removeError } = await db.storage
    .from('food-photos')
    .remove(rows.map((row) => row.image_path));

  // A missing object is not a failure - it means a previous run removed the
  // bytes and did not get to mark the row. Marking it now is the repair.
  if (removeError !== null) {
    console.error(
      JSON.stringify({ level: 'error', event: 'photo_remove_failed', message: removeError.message }),
    );
  }

  const { error: markError } = await db
    .from('ai_scans')
    .update({ photo_deleted_at: new Date().toISOString() })
    .in(
      'id',
      rows.map((row) => row.scan_id),
    );

  if (markError !== null) throw new Error(`mark deleted: ${markError.message}`);

  return { processed: rows.length, failed: 0 };
};

// ---------------------------------------------------------------------------

Deno.serve(async (request: Request): Promise<Response> => {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  try {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const expected = Deno.env.get('LIFECYCLE_SECRET') ?? '';
    const provided = request.headers.get('X-Lifecycle-Secret') ?? '';

    // An unset secret denies rather than allows. A misconfigured deployment
    // must not leave an unauthenticated endpoint that deletes accounts.
    if (expected.length === 0 || !secretsMatch(expected, provided)) {
      return json({ error: 'unauthorized' }, 401);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (url === undefined || serviceKey === undefined) {
      return json({ error: 'server_error' }, 500);
    }

    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [exports, deletions, photos] = await Promise.all([
      runExports(db),
      runDeletions(db),
      runPhotoExpiry(db),
    ]);

    log('lifecycle_run', { exports, deletions, photos });
    return json({ exports, deletions, photos });
  } catch (error) {
    console.error(
      JSON.stringify({ level: 'error', event: 'lifecycle_failed', message: String(error) }),
    );
    return json({ error: 'server_error' }, 500);
  }
});
