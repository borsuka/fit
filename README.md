# fit

Fitness and nutrition tracking with AI meal photo analysis. Expo + Supabase.

> **Status: Phase 2.** Database schema, RLS and project scaffolding are in place.
> Features start in Phase 3. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## The one rule

Nutrition values come from the database and deterministic arithmetic. An LLM may identify
food and estimate portions; it may never produce a nutrition value. The AI response schema
has no field capable of holding a calorie figure, which makes hallucinated nutrition
structurally impossible rather than merely discouraged.

---

## Requirements

| | |
|---|---|
| Node | 20+ (developed on 24.14) |
| Docker | required for local Supabase |
| Expo Go | **not supported** — native modules need a development build |

## Setup

```bash
npm install
cp .env.example .env
npm run db:start        # starts local Supabase, prints the anon key
```

Paste the printed anon key and API URL into `.env`, then:

```bash
npm run db:reset        # applies migrations from scratch
npm run db:test         # pgTAP: RLS and schema invariants
npm start
```

## Scripts

| Script | Purpose |
|---|---|
| `npm start` | Expo dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the layering rules |
| `npm run depcruise` | dependency-cruiser: layering + cycle detection |
| `npm test` | Jest |
| `npm run db:reset` | rebuild the local database from migrations |
| `npm run db:test` | pgTAP suite — **RLS isolation lives here** |
| `npm run db:types` | regenerate `database.types.ts` from the live schema |

## Layout

```
src/app/        expo-router routes — thin
src/features/   screens, feature components, react-query hooks
src/services/   I/O boundary: Supabase, edge functions, mapping
src/domain/     PURE business logic. No I/O, no React. Where correctness lives.
supabase/       migrations, edge functions, pgTAP tests
docs/           architecture and database design
```

Dependencies point downward only, enforced by ESLint zones and dependency-cruiser in CI.
A layering rule that CI does not check is a comment, not an architecture.

## Before you commit

```bash
npm run typecheck && npm run lint && npm test && npm run db:test
```

Adding a table means adding its RLS policies **and** its pgTAP test in the same change.
`020_schema_invariants.test.sql` fails the build if any table in `public` lacks RLS, or if
any `UPDATE` policy is missing a `WITH CHECK` clause — without one, a user can reassign
`user_id` and hand their row to another account.

## Security notes

- `EXPO_PUBLIC_*` is compiled into the bundle and readable by anyone who downloads the
  app. The Supabase anon key belongs there; vendor API keys never do.
- Vendor keys live in Supabase Edge Function secrets (`npx supabase secrets set`).
- `food-photos` is a private bucket, path-prefixed by user id, served by signed URL only.
