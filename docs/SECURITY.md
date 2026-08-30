# Security

**Last updated:** 2026-08-30
Companion to [ARCHITECTURE.md](./ARCHITECTURE.md) and [DATABASE.md](./DATABASE.md).

---

## 1. Threat model

What we are actually defending against, in order of likelihood:

| # | Threat | Consequence |
|---|---|---|
| T1 | A missing or wrong RLS policy | one user reads another's meals, weight, or food photos |
| T2 | A vendor API key in the client bundle | key extracted from the APK, unbounded vendor bill |
| T3 | A client granting itself premium | revenue loss, and every server-side quota becomes decorative |
| T4 | Unbounded AI usage by one account | cost attack, degraded service for everyone |
| T5 | Prompt injection via image content | model returns attacker-shaped output |
| T6 | Photos retained indefinitely | GDPR exposure grows with time for no product benefit |
| T7 | Credentials or PII in logs | breach through the observability stack |

The client is **untrusted**. It runs on a device the user controls, it can be decompiled,
and its network calls can be replayed with arbitrary bodies. Every rule that matters is
enforced in Postgres or in an edge function.

---

## 2. T1 — Data isolation

### Posture

RLS is enabled on every table in `public`. A table with RLS enabled and no policy is
unreadable, which is the correct failure mode: forgetting a policy denies access rather
than granting it.

### The two mistakes we specifically guard against

**Missing `WITH CHECK` on an `UPDATE` policy.** With `USING` alone, a user may update
their own row *and change `user_id` to someone else's*, handing the row to another
account. It reads as a working policy in review. Every `UPDATE` and `ALL` policy in this
schema has both clauses, and `020_schema_invariants.test.sql` fails the build if any
policy anywhere is missing one:

```sql
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and cmd in ('UPDATE','ALL') and with_check is null),
  0, 'every UPDATE/ALL policy in public has a WITH CHECK clause');
```

**Bare `auth.uid()` instead of `(select auth.uid())`.** Not a vulnerability, a
performance cliff: the bare call is evaluated once per row rather than once per statement.
On `meal_items` and `workout_sets` — the two largest user tables — that is the difference
between an index lookup and a scan.

### Child tables

A child row's policy checks ownership one hop up, so a client cannot attach a record to
another user's parent by guessing a uuid:

```sql
create policy meal_items_insert on public.meal_items for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.meals m
                where m.id = meal_items.meal_id and m.user_id = (select auth.uid()))
  );
```

### Views

`recipe_nutrition` is declared `with (security_invoker = true)`. A view without it runs
as its owner, and RLS on the underlying tables is bypassed — a view is otherwise a hole
straight through row level security.

### Verification

`supabase/tests/010_rls.test.sql` seeds two users and asserts, for every user-owned table:

1. A reads only their own rows
2. A's update of B's row affects zero rows
3. A's delete of B's row affects zero rows
4. A cannot insert a row owned by B
5. **A cannot reassign their own row's `user_id` to B**
6. `anon` reads nothing
7. A cannot forge `ai_scan_items`, publish a food, or write `subscriptions`

Run it with `npm run db:test`. It runs in CI on every pull request.

---

## 3. T2 — Secret handling

`EXPO_PUBLIC_*` means *compiled into the bundle and readable by anyone who downloads the
app*. It is not a soft convention.

| Secret | Where it lives |
|---|---|
| Supabase URL, anon key | `EXPO_PUBLIC_*` — safe, RLS decides what a JWT may read |
| `service_role` key | edge function secrets **only**; bypasses RLS entirely |
| AI vendor keys | edge function secrets |
| RevenueCat webhook secret | edge function secrets |

An ESLint rule bans `process.env` everywhere except `src/config/env.ts`, which validates
configuration with zod at startup. A missing variable fails immediately with a message
naming the variable, rather than surfacing as a null reference three screens later.

`.env` is git-ignored; `.env.example` documents every key with no values.

---

## 4. T3 — Entitlements

`subscriptions` has exactly one client-facing policy: `SELECT` on your own row. There is
no `INSERT`, `UPDATE` or `DELETE` policy for any role holding a JWT. The table is written
only by the RevenueCat webhook function running as `service_role`, after verifying the
request signature.

The client's `isPremium` is a **UI hint** for showing or hiding a paywall. Every operation
that costs money re-reads `subscriptions` server-side before doing the work. A boolean in
a request body is not an entitlement.

---

## 5. T4 — AI abuse and cost

- `ai_usage` is the quota ledger: `SELECT` for the owner, writes `service_role` only.
  A self-writable quota is not a quota.
- The quota is checked and incremented **inside** the edge function, in the same
  transaction as the scan record, before any vendor call is made.
- `ai_scan_items` has no client `INSERT` policy. Scan items are produced by the pipeline.
  A client that could forge them could forge the accuracy audit trail we intend to measure
  prompt versions with.
- Images are resized client-side (max 1024 px, target under 300 KB) and the bucket carries
  a 5 MB hard ceiling with a MIME allow-list.
- `image_hash` enables a response cache, so a retried upload does not pay twice.

---

## 6. T5 — Prompt injection through images

A photographed menu, label or handwritten note can contain text aimed at the model. Our
mitigation is structural rather than instructional:

- The response schema permits **no** nutrition values, so the worst case is a wrong food
  name or gram figure — not fabricated calories.
- Output is zod-validated; anything off-schema is rejected, retried once, then failed.
- `estimated_grams` is clamped to 1–2000 and `confidence` to 0–1 after parsing.
- Item count is capped at 12.
- Every item is shown to the user for confirmation before anything is written.
- The model never sees another user's data, and its output never reaches a SQL string —
  matching goes through parameterised full-text and trigram queries.

Allergen exclusion in meal planning is a **hard SQL filter**, never a prompt instruction.
An allergen miss is a safety incident, and a prompt is not a safety control.

---

## 7. T6 — Photo lifecycle

- `food-photos` is a private bucket. No public URL exists.
- Object path is `{user_id}/{scan_id}.jpg`; the storage policy compares
  `(storage.foldername(name))[1]` to `auth.uid()`.
- Reads use short-lived signed URLs.
- `ai_scans.expires_at` defaults to 90 days. A scheduled job deletes expired objects; the
  derived scan record is what has lasting value, not the JPEG.
- Account deletion cascades through the database and removes storage objects. Both the
  export and deletion paths must work before launch — the App Store requires deletion, and
  GDPR requires both.

---

## 8. T7 — Logging discipline

Log: `level`, `event`, `user_id`, `scan_id`, `duration_ms`, `prompt_version`, `error_code`.

Never log: passwords, JWTs, refresh tokens, the `service_role` key, vendor API keys,
image bytes or signed URLs, full request bodies from auth endpoints, or a user's weight
and body measurements.

Sentry runs with PII scrubbing on. A stack trace is worth having; a stack trace containing
a bearer token is a breach.

---

## 9. Checklist for adding a table

Not optional. `020_schema_invariants.test.sql` enforces items 1 and 3 automatically.

1. `alter table ... enable row level security;`
2. `user_id uuid not null references profiles(id) on delete cascade default auth.uid()`
3. Policies for select / insert / update / delete, using `(select auth.uid())`, with
   `WITH CHECK` on update
4. If it is a child table, verify ownership one hop up in the insert policy
5. Index the column the policy filters on
6. Add assertions to `010_rls.test.sql` in the same commit
7. `npm run db:test`

---

## 10. Pre-launch review

- [ ] `npm run db:test` green against a production-shaped dataset
- [ ] Supabase security advisor clean (no missing RLS, no mutable `search_path`)
- [ ] No `service_role` key reachable from any client bundle — grep the built artefact
- [ ] Signed-URL expiry confirmed short
- [ ] Deletion request removes rows **and** storage objects; verified manually
- [ ] Export produces a complete archive
- [ ] DPA signed with the chosen AI vendor, no-training setting confirmed
- [ ] Rate limits on auth endpoints
- [ ] Dependency audit clean
- [ ] Sentry PII scrubbing verified against a real captured event
