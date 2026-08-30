# Testing Strategy

**Last updated:** 2026-08-30

---

## 1. What we are protecting

This app tells people how much to eat. The failure that matters is not a crash — it is a
number that is quietly wrong. A blank screen gets reported in an hour; a calorie target
that is 400 kcal off gets *followed*.

So the testing effort is deliberately lopsided. `src/domain` carries a hard coverage gate;
the UI does not.

| Layer | Tool | Bar | Why |
|---|---|---|---|
| `src/domain` | Jest | 95 % statements, 90 % branches | where wrong numbers come from |
| `src/services` | Jest, mocked transport | happy path + every failure mode | where wrong data comes from |
| components | React Native Testing Library | loading / empty / error / data | where confusing UI comes from |
| database + RLS | pgTAP | every user table, both directions | where breaches come from |
| end-to-end | Maestro | four critical journeys | where broken releases come from |

---

## 2. One runner, on purpose

Jest with the `jest-expo` preset, for everything in TypeScript.

The tempting alternative is Vitest for `src/domain` (it is pure TypeScript and would run
in a fraction of the time) plus Jest for components. Rejected: two runners means two
configs, two mocking strategies, two coverage reports to merge and two CI lanes to keep
alive. The domain suite is small enough that the speed difference is a second or two, and
a second is not worth a permanently forked toolchain.

---

## 3. Domain tests

`src/domain` is pure functions with no I/O, so tests are direct: inputs in, numbers out,
no mocks anywhere. If a domain test needs a mock, the code has leaked out of its layer and
the lint rule should have caught it.

### Nutrition, specifically

Table-driven cases with hand-computed expectations, not values copied from the
implementation. A test that asserts what the code currently does is a change-detector,
not a test.

```
BMR         known Mifflin-St Jeor values for both parameterisations
TDEE        each activity multiplier
targets     each goal type against a matrix of profiles
portions    grams <-> servings, including density-based volume conversion
totals      meal totals, day totals, remaining, over-budget
```

### The invariants

Properties that must hold for *every* valid input, checked over a generated matrix rather
than a handful of examples:

1. `protein*4 + carbs*4 + fat*9` equals the calorie target within rounding tolerance.
2. The calorie target never falls below the floor for the user's parameterisation.
3. The deficit never exceeds 25 % of TDEE; the surplus never exceeds 15 %.
4. Protein stays within 1.4–2.2 g/kg of the reference weight.
5. Fat is never below 0.6 g/kg.
6. A target weight below BMI 18.5 is always rejected.
7. Every output is finite — no `NaN`, no `Infinity`. A `NaN` reaching the UI renders as
   an empty macro ring, which reads as "no data" rather than "we have a bug".

### Safety rails get adversarial cases

The rails exist for the users least able to absorb a mistake. They are tested with inputs
chosen to break them, not with a typical 30-year-old:

- a 95-year-old, 40 kg, sedentary, aggressive-loss goal → floor enforced
- a 120 kg user requesting 2 kg/week → rate capped
- a 17-year-old → rejected by policy (D-3)
- target weight of 45 kg at 180 cm → rejected on BMI
- height or weight at each boundary, and one step outside it

---

## 4. Service tests

Transport is mocked; the Supabase client is not hit over the network. Each service is
tested for its happy path **and** for every failure mode the UI is expected to render:

```
network unavailable        -> retryable AppError
401 / expired session      -> triggers refresh, then retries once
row not found              -> typed empty result, not an exception
malformed payload          -> zod rejection, logged, user-facing message
timeout                    -> retryable AppError
```

The AI service gets its own set, because that is where untrusted input enters:

```
valid response             -> parsed items
prose wrapped around JSON  -> extracted and parsed
invalid JSON               -> one repair retry, then structured failure
schema violation           -> rejected, never partially applied
grams out of range         -> clamped
confidence out of range    -> clamped
is_food false              -> distinct, non-error user path
13 items returned          -> capped at 12
vendor 500 / timeout       -> retry once, then manual entry offered
quota exceeded             -> no vendor call is made at all
```

That last one is a cost test as much as a correctness test.

---

## 5. Component tests

Four states per screen: loading, empty, error, data. Empty and error states are the ones
that ship broken, because they are the ones nobody clicks through by hand.

Query behaviour is tested through the hook with a real `QueryClient` and a mocked service,
not by mocking `useQuery` — mocking the library under test asserts nothing.

`jest.setup.ts` turns an unexpected `console.error` into a test failure. A React key
warning or a state update after unmount is a real defect; tests that stay green while the
console fills with warnings are not telling the truth.

---

## 6. Database tests (pgTAP)

The highest-value tests in the repository, because their failure mode is a data breach
rather than a wrong number.

```bash
npm run db:test
```

`010_rls.test.sql` seeds two users and asserts isolation in both directions, including the
case that a plain review pass tends to miss: **user A cannot reassign their own row's
`user_id` to user B**. Without `WITH CHECK` on the update policy, that succeeds silently.

`020_schema_invariants.test.sql` enforces structural rules the application relies on:

- every table in `public` has RLS enabled — a new table without it fails here
- no `UPDATE` or `ALL` policy anywhere is missing `WITH CHECK`
- age validation is enforced by the database, not only the client
- nutrition sanity constraints reject mangled imports (macro mass over 100 g/100 g,
  impossible energy density, non-numeric barcodes)
- `meal_items` references exactly one thing, or is a named quick-add
- `recipe_nutrition` derives correctly from ingredients
- one active goal per user; one weight entry per day
- no bucket holding user photos is public

The first two are generic: they cover tables that do not exist yet. That is the point —
they fail on the commit that adds an unprotected table, not six months later.

### A Postgres asymmetry worth knowing

When RLS is enabled and **no policy exists** for a command, the two cases behave
differently:

| Command | With no matching policy |
|---|---|
| `INSERT` | raises `42501` — its `WITH CHECK` cannot pass |
| `UPDATE`, `DELETE` | match **zero rows** and report success, no error |

`subscriptions` deliberately has only a `SELECT` policy, so "user grants themselves
premium" fails silently rather than loudly. A test written as `throws_ok` for that case
fails — and would have been misleading in the other direction too, passing for an
unrelated reason if someone later added a permissive `UPDATE` policy that happened to
error. The assertion is a row count plus a check that the stored value did not change,
because "zero rows affected" and "the value is unchanged" are different claims.

This was found by running the suite, not by reading it. It is the argument for executing
tests against a real engine before believing them.

### Local harness without the full stack

`_local_shim.sql` plus `_local_verify.sql` reproduce the same assertions in plain SQL
against a stock `postgres` image, for when the Supabase stack is unavailable — the shim
recreates only `auth`, `storage`, the three roles and `auth.uid()`.

```bash
npm run db:verify:local
```

Starts a throwaway `postgres:16-alpine`, applies the shim, every migration in order and
the seed, then runs 36 behavioural assertions and removes the container. Non-zero exit if
anything fails.

It is a smoke check, not parity: GoTrue, Storage and the real grant matrix are not
reproduced, so `supabase test db` remains the authority. Both SQL files are prefixed `_`
and are never applied to a real database.

---

## 7. End-to-end (Maestro)

Deliberately few. E2E tests are slow and flaky in proportion to their number, so they
cover only journeys whose breakage means the release should not ship:

1. Sign up → onboarding → targets appear on Home
2. Search a food → add to breakfast → totals update
3. Scan a photo → review → edit a portion → confirm → appears in the diary
4. Start a workout → log sets → finish → appears in history

The scan flow runs against a stubbed AI response. Asserting on live model output would
make the suite non-deterministic and would bill us for every CI run.

---

## 8. CI

```
typecheck -> lint -> depcruise -> unit -> [supabase start -> db reset -> db test]
```

`db reset` applies every migration from zero, which catches a migration that only works
against an already-migrated local database. CI also regenerates `database.types.ts` and
fails if it differs from the committed file — a schema change that breaks the app then
breaks `tsc`, not production.

---

## 9. Current state

Honest status as of Phase 2:

- pgTAP suite: **written**, covering RLS isolation and schema invariants
- Jest: **configured**, no tests yet — `src/domain` is empty until Phase 3, so `npm test`
  runs with `--passWithNoTests` in CI
- Maestro: not yet set up; arrives with Phase 3 when there are journeys to test

The coverage gate on `src/domain/nutrition` is already in `jest.config.js` and will apply
from the first file written there.
