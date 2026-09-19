# fit

Fitness and nutrition tracking with AI meal photo analysis. Expo + Supabase.

> **Status: feature-complete through Phase 7, not shippable.** Auth, onboarding,
> diary, food search, AI scanning, meal planning, workouts and progress all work
> end to end locally. Six real blockers remain - no AI vendor decided, GDPR jobs
> unwritten, no subscription system - and they are listed with the reasons in
> [docs/PRODUCTION.md](docs/PRODUCTION.md). Start there before planning a launch.

---

## The one rule

Nutrition values come from the database and deterministic arithmetic. An LLM may identify
food and estimate portions; it may never produce a nutrition value. The AI response schema
has no field capable of holding a calorie figure, which makes hallucinated nutrition
structurally impossible rather than merely discouraged.

---

## Requirements

|         |                                                        |
| ------- | ------------------------------------------------------ |
| Node    | 20+ (developed on 24.14)                               |
| Docker  | required for local Supabase                            |
| Expo Go | works — every native module used is bundled in Expo Go |

## Running it

**Double-click `Start fit.cmd`.** That is the whole thing. It installs
dependencies if they are missing, starts Docker, brings up the database, writes
`.env` from what is actually running, starts the bundler and opens the app in
its own phone-shaped window.

Keep that window open — closing it stops the app. `Stop fit.cmd` shuts the
database down afterwards and frees the memory Docker was holding.

From a terminal, the same thing:

```bash
npm run app           # the app, in a window
npm run app:phone     # a QR code for Expo Go instead
npm run app:reset     # rebuild the database first (deletes every account)
npm run app:stop      # shut the database down
```

Sign up with any email — local Supabase neither sends nor requires a
confirmation, and anything that would have been mailed appears at
http://127.0.0.1:54324.

### Why there is a launcher

Starting this by hand is six steps in a fixed order, and getting one wrong
fails without naming the cause. The worst is `.env`: it holds this machine's
LAN address, the router hands out a different one eventually, and then the app
loads, renders its sign-in screen and silently cannot reach anything.

So the launcher re-derives that address every run — by asking the OS which
address it would route from, not by picking one off the adapter list. That
distinction is not academic: this machine has a WSL virtual switch on
`172.17.144.1` next to Wi-Fi on `192.168.0.8`, both private, both non-internal,
and the adapter-list version of this script chose the wrong one on its first
run.

The address is the LAN one rather than `127.0.0.1` because on a phone running
Expo Go, localhost means the phone.

### Doing it by hand

```bash
npm install
npm run db:start        # starts local Supabase
npm run db:reset        # applies migrations and seeds from scratch
npx supabase status -o json
```

```
EXPO_PUBLIC_SUPABASE_URL=http://<your-lan-ip>:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from the command above>
EXPO_PUBLIC_APP_ENV=development
```

```bash
npm start        # then scan the QR with Expo Go
npm run web      # or just open it in a browser
```

## Scripts

| Script                    | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `npm run app`             | **everything: Docker, database, config, app window**      |
| `npm run app:phone`       | the same, but a QR code for Expo Go                       |
| `npm run app:stop`        | shut the local database down                              |
| `npm start`               | Expo dev server only (assumes the database is already up) |
| `npm run typecheck`       | `tsc --noEmit`                                            |
| `npm run lint`            | ESLint, including the layering rules                      |
| `npm run depcruise`       | dependency-cruiser: layering + cycle detection            |
| `npm test`                | Jest                                                      |
| `npm run db:reset`        | rebuild the local database from migrations                |
| `npm run db:test`         | pgTAP suite — **RLS isolation lives here**                |
| `npm run db:types`        | regenerate `database.types.ts` from the live schema       |
| `npm run db:verify:local` | database smoke check without the full Supabase stack      |

## Layout

```
src/app/        expo-router routes — thin
src/features/   screens, feature components, react-query hooks
src/services/   I/O boundary: Supabase, edge functions, mapping
src/domain/     PURE business logic. No I/O, no React. Where correctness lives.
shared/         imported by BOTH the app and the Deno edge runtime.
                Dependency-free by necessity — see docs/PRODUCTION.md section 6.
supabase/       migrations, edge functions, seeds, pgTAP tests
scripts/        launcher and the local database verification harness
docs/           architecture, database, security, testing, AI, production
```

Dependencies point downward only, enforced by ESLint zones and dependency-cruiser in CI.
A layering rule that CI does not check is a comment, not an architecture.

## Before you commit

```bash
npm run typecheck && npm run lint && npm run depcruise && npm test
npm run db:reset && npm run db:test
```

The pgTAP suite assumes a clean database, so reset first. Current state: 352
Jest tests (25 component), 125 pgTAP assertions, all green.

Adding a table means adding its RLS policies **and** its pgTAP test in the same change.
`020_schema_invariants.test.sql` fails the build if any table in `public` lacks RLS, or if
any `UPDATE` policy is missing a `WITH CHECK` clause — without one, a user can reassign
`user_id` and hand their row to another account.

## Security notes

- `EXPO_PUBLIC_*` is compiled into the bundle and readable by anyone who downloads the
  app. The Supabase anon key belongs there; vendor API keys never do.
- Vendor keys live in Supabase Edge Function secrets (`npx supabase secrets set`).
- `food-photos` is a private bucket, path-prefixed by user id, served by signed URL only.
