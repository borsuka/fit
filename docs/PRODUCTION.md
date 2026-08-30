# Production Readiness

**Last updated:** 2026-08-31
**Status: not shippable.** Three blockers remain, two are closed and one is
partly done. They are real
constraints, not paperwork.

This is an honest ledger, not a victory lap. Everything marked done was
verified by running it; everything else is listed as what it is.

---

## 1. What is built and verified

| Area | State |
|---|---|
| Database schema, 17 migrations | applied from zero against Supabase Postgres 17 |
| RLS on every table | 125 pgTAP assertions, both directions, real stack |
| Auth, onboarding, targets | working end to end |
| Nutrition engine | 1920-case invariant matrix, 100% statements |
| Food search, diary | working; 57 seeded foods |
| AI scan pipeline | function boots and gates auth; **vendor call unexercised** |
| Meal plan solver | 26 tests; 12 seeded recipes |
| Workouts | 40 exercises, session logging, progression advice |
| Weight and progress | regression-based trend, labelled axis |
| GDPR export/delete | worker built and verified end to end; **scheduling is a deploy step** |
| Photo retention | worker built and verified; same scheduling step |

Gates, all green as of this commit:

```
tsc --noEmit                exit 0
expo lint                   exit 0, 0 errors
depcruise src               exit 0, 104 modules
jest                        294 tests (25 of them component tests)
supabase test db            125 pgTAP tests
```

Security audit against the live local database:

```
tables in public without RLS ................ 0
UPDATE/ALL policies missing WITH CHECK ...... 0
functions with a mutable search_path ........ 0
hard-coded key material in src/ or shared/ .. 0
process.env outside src/config/env.ts ....... 0
.env tracked by git ......................... no (only .env.example)
```

---

## 2. Blockers

Ordered by what stops a launch soonest.

### B1 — No AI vendor, so the scanner has never run end to end

The pipeline is complete and the edge function boots, but no call has ever
reached a model. Everything after the vendor boundary is tested with fixtures;
the vendor boundary itself is not.

Needed: a decision (D-1), a key, and the bake-off described in ARCHITECTURE
§15 — ~50 photos with known weights, measuring identification accuracy, portion
error, schema compliance, latency and **cost per scan**. The free tier's viability
is unknown until that last number exists.

### ~~B2 — The GDPR jobs do not exist~~ (closed, except scheduling)

`supabase/functions/data-lifecycle` now does the work, and it was exercised
against the real stack rather than reasoned about:

```
{"exports":{"processed":1},"deletions":{"processed":1},"photos":{"processed":1}}
```

After the deletion run: profile, weight history, scans, the auth user and the
request row itself were all gone, user B untouched, and `deletion_audit` held
one row containing only timestamps.

Files are removed BEFORE the account, because storage objects are not covered by
the database cascade - deleting the account first would leave the photos on disk
with nothing pointing at them.

**Still needed:** the schedule. See section 6.

### ~~B3 — Photo lifecycle is declared but not enforced~~ (closed, except scheduling)

The same worker deletes image bytes past `expires_at` and stamps
`ai_scans.photo_deleted_at`. The scan record outlives the photo: the items and
the user's corrections are what has lasting value.

`expired_photo_paths` returns paths rather than deleting rows, because removing
a row from `storage.objects` does not remove the underlying file. Deleting there
would leave the bytes on disk and the record gone - the worst of both.

### B4 — Subscriptions are a schema, not a system

`subscriptions` exists with the correct write posture (service_role only), and
the edge function reads entitlement from it. Nothing writes it.

Needed: RevenueCat products, the webhook function, signature verification, and
store configuration.

### B5 — Food corpus is a starter set

57 curated foods, not the USDA import decision D-2 calls for. Search works;
coverage does not. "My food isn't here" is the top abandonment cause for a
tracker.

Needed: the USDA Foundation/SR Legacy importer, and the Open Food Facts
write-through path on barcode miss. **The ODbL question must be settled first** —
caching for our own users is straightforward, redistributing a derived database
is not.

### B6 — Component tests started, E2E still missing

25 component tests now cover the two screens where being wrong costs the most:
ScanReview (the confirmation step that encodes the product's safety rules) and
AuthForm (validation and the busy/disabled states).

Two things worth knowing before adding more:

- **`render` is async in RNTL 14.** Called synchronously it returns a pending
  promise with no query methods, effects never flush, and any assertion against
  an empty result passes. Three tests here did exactly that before it was
  caught. A test that passes because nothing ran is worse than one that fails.
- **`toHaveAccessibilityState` was removed** in favour of per-state matchers
  (`toBeBusy`, `toBeDisabled`, `toBeSelected`).

`jest.env.ts` runs in `setupFiles` to supply placeholder Supabase configuration
before any module loads. `src/config/env.ts` validates at import time and throws
when it is missing - right for the app, fatal for a test that imports anything
in the service layer.

Still needed: the remaining screens, and four Maestro journeys. Maestro needs a
device or emulator, so the flows can be written here but not run.

---

## 3. Before the first real user

- [ ] EU (Frankfurt) Supabase project, Pro tier, PITR on
- [ ] DPA signed with the AI vendor, no-training setting confirmed in writing
- [ ] Privacy policy and terms published, and linked from onboarding
- [ ] Separable consent captured (required / analytics / AI photo processing)
- [ ] Sentry wired, PII scrubbing verified against a real captured event
- [ ] Analytics on an EU endpoint
- [ ] Rate limits on auth endpoints
- [ ] `npx supabase db lint` and the security advisor clean on the cloud project
- [ ] Grep the built artefact for `service_role` — it must not appear
- [ ] Signed-URL expiry confirmed short in production
- [ ] Restore drill: prove a backup actually restores, once, before launch

## 4. Store submission

- [ ] 18+ age rating, matching the domain policy (D-3)
- [ ] Camera usage string reviewed — it is user-facing copy, not a formality
- [ ] Subscription disclosure per store rules
- [ ] Account deletion reachable in-app — built; verify the schedule is live
- [ ] **No health claims anywhere in the listing.** Every number this app
      produces is an estimate from a population formula, and the copy says so
- [ ] Screenshots showing real states, not mocked perfect data

---

## 5. Known limitations, stated plainly

These are not bugs. They are the honest bounds of what the app does.

- **Portion estimation from a photo is rough.** Identification is largely
  solved; inferring grams from one uncalibrated image is not. The app never
  auto-commits a scan, bands confidence, pre-selects nothing below 0.55, and
  refuses to add an unmatched item at all.
- **Nutrition targets are estimates.** Mifflin-St Jeor plus an activity
  multiplier is accurate to roughly ±10% for the population it was derived from,
  and the activity multiplier is the crudest part. Measured weight change is
  what actually calibrates a user, and the UI says so.
- **Estimated 1RM stops at 12 reps** because the formula stops meaning anything
  past there. It returns null rather than a number.
- **A weekly weight rate needs ~14 days.** Below that the app declines to state
  one.
- **The diary nutrition snapshot is computed client-side.** A user could write
  numbers that do not match the food. RLS confines every write to their own
  diary, so the only person they can mislead is themselves. This would not be
  acceptable for anything shared or billed, which is why AI quota and
  entitlement are server-side only.
- **Meal plans draw on 12 recipes.** The solver is sound; the corpus is not yet.

---

## 6. Operational notes

### Scheduling the lifecycle worker

The worker is built and verified; nothing calls it yet. It is deliberately not a
migration, because a `cron.schedule` that reads a Vault secret fails on a fresh
`db reset` and would break every local setup.

Store the secret, then schedule, once per environment:

```sql
select vault.create_secret('<a long random string>', 'lifecycle_secret');

select cron.schedule(
  'data-lifecycle', '17 3 * * *',
  $$
  select net.http_post(
    url     := '<project-url>/functions/v1/data-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Lifecycle-Secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'lifecycle_secret')
    )
  );
  $$
);
```

Set the same value as the `LIFECYCLE_SECRET` function secret. An unset secret
makes the function deny every request rather than run unauthenticated - a
misconfigured deploy must not leave an open endpoint that deletes accounts.

### Writing auth fixtures

A user inserted straight into `auth.users` is fine for RLS tests but is **not
loadable by GoTrue**: `auth.admin.deleteUser` fails with "Database error loading
user" when the token columns are NULL rather than `''`. Found the hard way while
verifying the deletion path. Set `confirmation_token`, `recovery_token`,
`email_change`, `email_change_token_new`, `email_change_token_current`,
`phone_change`, `phone_change_token` and `reauthentication_token` to `''`.

Local development:

```bash
npm run db:start && npm run db:reset && npm run db:test
npm start
```

The pgTAP suite assumes a clean database. Anything left behind by a manual
`psql` session outside a transaction collides with the fixture UUIDs and aborts
the file before its first assertion — reset first.

Two things that will bite anyone touching the edge functions:

1. A module shared between the app and the Deno runtime **cannot have
   dependencies**. The import map does not reach a file outside
   `supabase/functions/`, and Metro rejects the explicit `.ts` extension Deno
   needs for a sibling import. `shared/ai-contracts` is dependency-free for
   this reason.
2. Edge functions use fully-qualified `npm:` specifiers. The `import_map`
   setting in `config.toml` was tried and demonstrably never reached the worker.
