# Production Readiness

**Last updated:** 2026-08-30
**Status: not shippable.** The blockers below are real, not paperwork.

This is an honest ledger, not a victory lap. Everything marked done was
verified by running it; everything else is listed as what it is.

---

## 1. What is built and verified

| Area | State |
|---|---|
| Database schema, 16 migrations | applied from zero against Supabase Postgres 17 |
| RLS on every table | 97 pgTAP assertions, both directions, real stack |
| Auth, onboarding, targets | working end to end |
| Nutrition engine | 1920-case invariant matrix, 100% statements |
| Food search, diary | working; 57 seeded foods |
| AI scan pipeline | function boots and gates auth; **vendor call unexercised** |
| Meal plan solver | 26 tests; 12 seeded recipes |
| Workouts | 40 exercises, session logging, progression advice |
| Weight and progress | regression-based trend, labelled axis |
| GDPR export/delete | request path only; **the job that acts on them does not exist** |

Gates, all green as of this commit:

```
tsc --noEmit                exit 0
expo lint                   exit 0, 0 errors
depcruise src               exit 0, 104 modules
jest                        269 tests
supabase test db            97 pgTAP tests
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

### B2 — The GDPR jobs do not exist

`export_requests` and `deletion_requests` are written by the client and read by
nobody. A deletion request today deletes nothing.

Needed: a scheduled `service_role` job that cascades the database rows, removes
the user's storage objects, and marks the request completed. **The App Store
rejects an app whose in-app deletion path does nothing**, and this is worse than
absent - it tells the user their data is gone when it is not.

### B3 — Photo lifecycle is declared but not enforced

`ai_scans.expires_at` defaults to 90 days and nothing reads it. Photos
accumulate indefinitely, which is the exact retention problem the column was
added to prevent.

Needed: a scheduled job deleting expired storage objects.

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

### B6 — No E2E tests, no component tests

The domain and the database are well covered. Screens are not tested at all.
TESTING.md describes both layers; neither exists.

Needed: React Native Testing Library coverage of the four states per screen,
and four Maestro journeys.

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
- [ ] Account deletion reachable in-app (blocked by B2)
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
