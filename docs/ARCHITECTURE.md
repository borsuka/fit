# Architecture

**Status:** Implemented through Phase 7. Deviations from the original proposal
are recorded in section 16.
**Last updated:** 2026-08-30

---

## 1. Context

Mobile application for nutrition tracking, AI meal photo analysis, meal planning and
workout logging. Target market: EU (Bulgaria first), iOS + Android.

The defining constraint of this product is **trust in numbers**. A calorie tracker that
reports plausible-but-invented values is worse than no tracker. Every architectural
decision below is subordinate to one rule:

> **Nutrition values come from a database and deterministic arithmetic.
> An LLM may identify and estimate portions; it may never produce a nutrition value.**

---

## 2. Repository state at time of writing

`C:\Users\boqn\Desktop\fit` is **empty**. No git repository, no `package.json`, no Expo
config, no prior code. This is a clean greenfield build with no legacy constraints and
no existing functionality to preserve.

Local toolchain verified:

| Tool | Version | Note |
|---|---|---|
| Node | 24.14.0 | OK for Expo SDK 57 |
| npm | 11.9.0 | OK |
| git | 2.53.0.windows.1 | repo not initialised yet |
| Docker | 29.2.1 | required by `supabase start` |
| Supabase CLI | **not installed** | blocker for Phase 2 |

Latest published versions checked against the npm registry on 2026-08-30 (not assumed):
`expo@57.0.18`, `react-native@0.87.1`, `expo-router@57.0.17`, `react@19.2.8`,
`@supabase/supabase-js@2.112.4`, `@tanstack/react-query@5.102.8`, `zod@4.5.4`,
`zustand@5.0.15`, `react-native-purchases@10.8.1`, `@sentry/react-native@8.24.0`.

Exact pins will be taken from `create-expo-app` plus `npx expo install` at scaffold time
and validated with `npx expo-doctor`, because Expo controls the compatible matrix for
`react`, `react-native` and every `expo-*` module. We do **not** hand-pick those
versions.

**What the template actually pinned** (scaffolded 2026-08-30) — note how it differs from
npm `latest`, which is exactly why we do not hand-pick:

| Package | npm `latest` | Expo template |
|---|---|---|
| react-native | 0.87.1 | **0.86.3** |
| react | 19.2.8 | **19.2.3** |
| typescript | 7.0.2 | **~6.0.3** |

We follow the template. Moving to React Native 0.87 or TypeScript 7 happens when
`expo-doctor` endorses it, not because the registry offers it. Toolchain churn is not a
feature.

---

## 3. Layering

The single most important structural rule. Dependencies point **downward only**.

```
src/app/                 expo-router routes. Thin: layout, params, <Screen/>.
  |
  v
src/features/            Screens, feature components, react-query hooks.
  |                      Knows React. Knows services. No SQL, no formulas.
  v
src/services/            The I/O boundary. Supabase client, edge-function calls,
  |                      DTO <-> domain mapping, cache keys. No React.
  v
src/domain/              PURE functions. Nutrition maths, safety rails, workout
                         progression, meal-plan solver. Zero I/O, zero React,
                         zero imports from services/ or features/.
```

`src/domain` is importable by everything and imports nothing from the app. It is plain
TypeScript, unit-testable in milliseconds, and is where correctness actually lives.

**Enforced mechanically**, not by convention: ESLint `no-restricted-imports` zones plus a
`dependency-cruiser` rule in CI. A layering rule that CI does not enforce is a comment,
not an architecture.

### Why not Redux / MobX / a large store

Nearly all state in this app is *server* state: diary entries, foods, workouts. That is
TanStack Query's job — it already solves caching, invalidation, retry, offline
persistence and request dedup. The genuinely client-side state is small and short-lived
(a scan draft awaiting confirmation, an in-progress workout session), which Zustand
handles in about thirty lines. Redux here would add ceremony and no capability.

| Concern | Tool |
|---|---|
| Server state, cache, retry | TanStack Query v5 |
| Ephemeral client state | Zustand |
| Persistence (cache, session) | MMKV, plus SecureStore for the refresh token |
| Form state | react-hook-form with a zod resolver |
| Validation | Zod — one source of truth, types via `z.infer` |

---

## 4. Folder structure

The Expo SDK 57 template places routes at `src/app`, not at the repository root. We follow
the framework's convention rather than fighting it, so every layer lives under `src/`.

```
fit/
├── src/
│   ├── app/                          # expo-router: routing only
│   │   ├── _layout.tsx
│   │   ├── (auth)/                   # sign-in, sign-up, reset
│   │   ├── (onboarding)/             # profile -> goal -> targets
│   │   ├── (tabs)/
│   │   │   ├── index.tsx             # Home
│   │   │   ├── nutrition.tsx
│   │   │   ├── workouts.tsx
│   │   │   ├── progress.tsx
│   │   │   └── profile.tsx
│   │   ├── food/[id].tsx
│   │   ├── scan/                     # camera -> analyzing -> review -> confirm
│   │   └── workout/[sessionId].tsx
│   │
│   ├── features/                     # vertical slices
│   │   ├── auth/ onboarding/ diary/ foods/ scan/
│   │   ├── recipes/ mealplan/ workouts/ progress/ subscription/
│   │   └── <feature>/{components,hooks,screens,model}
│   │
│   ├── domain/                       # PURE. No I/O. Heavily unit-tested.
│   │   ├── nutrition/
│   │   │   ├── formulas/             # bmr.ts tdee.ts macros.ts calorieTarget.ts
│   │   │   ├── calculations/         # portionScaling.ts mealTotals.ts dayTotals.ts
│   │   │   ├── safety/               # limits.ts guards.ts warnings.ts
│   │   │   ├── types.ts
│   │   │   └── __tests__/
│   │   ├── workouts/                 # volume, estimated 1RM, progression
│   │   └── mealplan/                 # deterministic selection / solver
│   │
│   ├── services/                     # I/O boundary
│   │   ├── supabase/                 # client, generated DB types, storage helpers
│   │   ├── foods/ diary/ workouts/ recipes/ mealplan/
│   │   ├── ai/                       # calls OUR edge functions only
│   │   └── subscription/
│   │
│   ├── ui/                           # design system primitives (Button, Card, ...)
│   ├── components/                   # shared composites (MacroRing, EmptyState, ...)
│   ├── lib/                          # queryClient, logger, analytics, i18n, errors
│   ├── config/                       # env.ts (zod-parsed), constants
│   └── schemas/                      # shared zod schemas
│
├── shared/                           # imported by BOTH app and edge functions
│   └── ai-contracts/                 # AI request/response zod schemas
│
├── supabase/
│   ├── migrations/                   # numbered SQL, forward-only
│   ├── functions/
│   │   ├── analyze-meal/             # vision -> structured items
│   │   ├── match-foods/              # items -> ranked food_id candidates
│   │   ├── generate-meal-plan/
│   │   ├── coach/
│   │   ├── revenuecat-webhook/
│   │   └── _shared/{prompts,ai,auth,quota}
│   ├── seed/                         # USDA / OFF importer scripts
│   └── tests/                        # pgTAP: RLS and constraint tests
│
├── e2e/                              # Maestro flows
├── docs/
└── .env.example
```

`shared/ai-contracts` is imported by the React Native app *and* by the Deno edge
functions. One schema definition, two runtimes: Metro resolves it through a tsconfig
path alias, Deno through an import map in `supabase/functions/deno.json` mapping `zod`
to `npm:zod@4`. Duplicating the AI contract across two runtimes is how contracts drift.

---

## 5. Backend topology

```
 React Native (Expo)
        |
        |  supabase-js  (anon key + user JWT, RLS enforced)
        +----------------------------------> Postgres        (all ordinary CRUD)
        |
        |  supabase-js  (user JWT)
        +----------------------------------> Storage         (private bucket)
        |
        |  functions.invoke()  (user JWT)
        +----------------------------------> Edge Functions (Deno)
                                                   |  service_role + vendor keys
                                                   +--> Vision / LLM vendor
                                                   +--> Postgres (privileged writes)
```

**Ordinary CRUD goes straight to Postgres through RLS.** Wrapping every read in an edge
function would buy nothing and cost a network hop plus a pile of hand-written
authorisation code — RLS is the stronger guarantee precisely because the database
enforces it regardless of which code path arrives.

**Edge functions exist only where the client must not be trusted:**

1. It would hold a vendor API key. An AI key shipped in an Expo bundle is a public key.
2. It enforces a quota or entitlement (premium gating, AI scan limits).
3. It performs a privileged write the user must not be able to forge (subscription state
   from a RevenueCat webhook).

---

## 6. AI subsystem

### 6.1 Pipeline

```
Camera
  -> client-side resize (max 1024px long edge, JPEG q~0.7, target <300KB)
  -> upload to private bucket  food-photos/{user_id}/{scan_id}.jpg
  -> POST /functions/v1/analyze-meal { scan_id }
        [auth] -> [quota] -> [signed read URL] -> [vision model]
        -> raw text
        -> tolerant JSON extraction
        -> ZOD VALIDATION  (fail -> one repair retry -> fail -> structured error)
        -> clamp + sanitise
        -> persist ai_scans / ai_scan_items
  -> POST /functions/v1/match-foods   (FTS + trigram + alias table, ranked candidates)
  -> CLIENT: user reviews every item — edit name, edit portion, remove, add
  -> deterministic nutrition computed from food_nutrients x grams
  -> user confirms -> meal_items written with a nutrition SNAPSHOT
```

### 6.2 The AI output contract

The model is asked for identification and portion estimation. **The response schema
contains no field in which a calorie value could be returned**, which makes hallucinated
nutrition structurally impossible rather than merely discouraged.

```ts
// shared/ai-contracts/foodAnalysis.ts
export const FoodAnalysisItem = z.object({
  label:            z.string().min(1).max(80),
  normalized_query: z.string().min(1).max(80),   // used for DB matching
  estimated_grams:  z.number().min(1).max(2000),
  portion_basis:    z.enum(['reference_object', 'plate_ratio', 'typical_serving', 'unknown']),
  confidence:       z.number().min(0).max(1),
  preparation:      z.enum(['raw', 'grilled', 'fried', 'boiled', 'baked', 'unknown']),
});

export const FoodAnalysisResponse = z.object({
  prompt_version: z.literal('food-analysis-v1'),
  is_food:        z.boolean(),
  items:          z.array(FoodAnalysisItem).max(12),
  scene_notes:    z.string().max(300).optional(),
});
```

### 6.3 Confidence and portions, stated honestly

Identification and quantification are different problems with very different accuracy.
Recognising rice in a photo is largely solved; inferring that it is 180 g of rice from a
single uncalibrated monocular image is not. The UI must never imply otherwise.

- Confidence is shown per item, banded: **High >= 0.80 / Medium 0.55-0.79 / Low < 0.55**.
- Low-confidence items are *not* pre-selected; they are presented as questions.
- Portion is **always** editable and offered as household measures (small / medium /
  large, half / one / one-and-a-half cups, 100 / 150 / 200 / 250 g, custom) rather than
  a false-precision number.
- The confirmation screen is mandatory. Nothing reaches the diary without a human tap.
- Low-confidence copy: *"We're not completely sure what this is — tap to correct."*
- Progress UI shows real stages (uploading / analyzing / matching), never a fabricated
  percentage.

### 6.4 Prompts

Versioned modules under `supabase/functions/_shared/prompts/`, for example
`food-analysis/v1.ts` exporting `{ id, version, system, buildUser(), outputSchema }`.
The active version id is written onto every `ai_scans` row, so when v2 changes behaviour
we can compare accuracy across versions on real historical data. Prompts never live
inside React components.

### 6.5 Failure handling

| Failure | Behaviour |
|---|---|
| Invalid JSON | one repair attempt including the parse error, then fail |
| Schema violation | same |
| `is_food: false` | "That doesn't look like a meal — try again?" |
| Vendor timeout / 5xx | one retry with backoff, then offer manual entry |
| No DB match for an item | keep the item, offer search plus "create custom food" |
| Quota exceeded | upgrade screen; no vendor call is made |

---

## 7. Nutrition engine (`src/domain/nutrition`)

Pure, deterministic, fully unit-tested. Every formula documented with its assumptions.

- **BMR** — Mifflin-St Jeor.
  male: `10w + 6.25h - 5a + 5`; female: `10w + 6.25h - 5a - 161`.
  Chosen over Harris-Benedict (dated) and Katch-McArdle (requires a body-fat percentage
  most users do not have). Katch-McArdle can be added later behind an optional input.
- **TDEE** = BMR x activity multiplier (1.2 / 1.375 / 1.55 / 1.725 / 1.9).
- **Calorie target** = TDEE + goal adjustment, then clamped by the safety rails below.
- **Protein** in g/kg of a reference weight (adjusted at high BMI), clamped 1.4-2.2 g/kg.
- **Fat** at least 0.6 g/kg, defaulting to roughly 27 % of energy.
- **Carbohydrate** = remaining energy.
- **Invariant**, asserted in tests: `protein*4 + carbs*4 + fat*9` equals the calorie
  target within rounding tolerance, for every input in a generated matrix.

### Safety rails (`domain/nutrition/safety`)

Product requirements, not decoration. People make decisions about their bodies here.

- Deficit capped at 25 % of TDEE; surplus capped at roughly 15 %.
- Absolute floor of 1200 kcal (female) / 1500 kcal (male) for unsupervised use.
- Rate of loss capped at about 1 % of body weight per week; gain about 0.5 %.
- Target weight below BMI 18.5 is blocked, with an explanation.
- Input ranges: age 18-100, height 120-250 cm, weight 30-300 kg.
- Pregnancy, lactation and clinical conditions are explicitly out of scope and
  disclaimed.
- **v1 is 18+.** Adolescent energy requirements are not "TDEE minus a deficit", and
  applying adult deficit logic to a fifteen-year-old is a real harm, not an edge case.
  Date of birth is collected and validated during onboarding.
- Every target is labelled an *estimate*. Nothing in this app is medical advice.

---

## 8. Meal plan engine

Deterministic selection; the LLM only at the edges.

```
targets + preferences + restrictions + allergens + disliked/preferred foods
  -> candidate recipe/meal pool         (filtered in SQL)
  -> greedy fill per meal slot          (against per-slot kcal/macro budgets)
  -> local-search swap pass             (reduce error against targets)
  -> PLAN — every number computed from recipe_ingredients x food_nutrients
```

The LLM may write a description, explain a choice, or *suggest* substitution candidates,
which are then filtered against allergens and re-costed from the database before being
shown. "Replace this meal" re-runs the solver for a single slot with the previous choice
excluded.

Allergen exclusion is a hard SQL filter, never a prompt instruction. An allergen miss is
a safety incident, and a prompt is not a safety control.

---

## 9. Security model

- Supabase Auth (email/password plus Apple and Google), refresh token in
  `expo-secure-store`.
- **RLS enabled on every table.** No exceptions. Default deny.
- User tables carry `user_id uuid not null default auth.uid()`; policies compare
  `(select auth.uid()) = user_id`. The `select` wrapper matters: it lets Postgres
  evaluate the function once per query instead of once per row.
- Reference tables (`foods`, `exercises`, `nutrients`) allow `SELECT` to `authenticated`
  and restrict writes to `service_role`.
- User-created foods use `created_by` plus `is_public`, visible when
  `is_public OR created_by = (select auth.uid())`.
- Storage bucket `food-photos` is **private**, path-prefixed by user id, with a
  `storage.objects` policy on `(storage.foldername(name))[1] = auth.uid()::text`.
  Access is by short-lived signed URL only. Lifecycle: originals deleted after 90 days —
  the derived scan record is what has lasting value, not the JPEG.
- Vendor API keys exist only as edge-function secrets. Never in the bundle, never in an
  `EXPO_PUBLIC_*` variable.
- Subscription entitlement is written server-side from a signature-verified RevenueCat
  webhook. The client's `isPremium` is a UI hint; edge functions re-check the database
  before doing anything expensive.
- RLS is verified by **pgTAP tests in CI**, asserting that user A cannot read or write
  user B's meals, weights, scans, workouts or photos, and that the anonymous role reads
  nothing. Untested RLS is an assumption, and assumptions about authorisation turn into
  breach notifications.

---

## 10. Privacy and GDPR

- Supabase project in an **EU region (Frankfurt)**; analytics on an EU endpoint.
- Food photos and body metrics are personal data; body metrics are health-adjacent and
  treated as sensitive by default.
- The vision vendor is a **processor**: a DPA is required before any real user photo is
  sent, together with an explicit no-training-on-our-data setting.
- Explicit, separable consent for (a) required processing, (b) analytics, (c) AI photo
  processing — recorded in a `consents` table with version and timestamp.
- In-app **data export** (JSON/CSV) and **account deletion** that genuinely cascades,
  including storage objects. Both must exist before launch: the App Store requires the
  deletion path and GDPR requires both.
- Data minimisation: no contacts, no location, no advertising identifiers.

---

## 11. Cross-cutting concerns

**Errors.** A typed `AppError { code, userMessage, cause, retryable }` constructed at the
service boundary. The UI renders `userMessage`; Sentry receives `cause`. Users never see
a status code. A global error boundary per route group, plus per-query error states.

**Offline.** Deliberately modest. The TanStack Query cache is persisted to MMKV so
browsing survives a bad connection, plus a **mutation outbox for diary writes only** —
adding food in a restaurant basement is the one flow that must work without signal.
Full bidirectional sync with conflict resolution is not justified by this product and
would be the largest single source of correctness bugs in the app.

**i18n.** `i18next` with `expo-localization` from day one; no user-facing string literals
in components. Reference data is translated in side tables (`food_translations`,
`exercise_translations`) rather than duplicated rows. Retrofitting i18n is expensive; the
layer costs almost nothing up front. v1 ships English and Bulgarian.

**Observability.** Sentry for errors and performance with PII scrubbed; structured
logging in edge functions (`{ level, event, user_id, scan_id, duration_ms,
prompt_version }` — never image bytes, tokens or passwords); a thin `analytics.track()`
facade so the vendor stays swappable.

**Testing.** One runner — **Jest with `jest-expo`** — rather than Vitest for the domain
plus Jest for components. Two runners means two configs, two mocking strategies and two
CI lanes to keep alive; the speed advantage on a pure-TypeScript suite does not repay
that cost.

| Layer | Tool | Bar |
|---|---|---|
| `domain/*` | Jest | ~100 % of formulas and safety rails |
| services | Jest with mocked transport | happy path plus every failure mode |
| components | React Native Testing Library | loading / empty / error / data |
| database and RLS | pgTAP | every user table, both directions |
| end-to-end | Maestro | onboarding, add food, scan, log workout |

**CI.** typecheck -> lint -> unit -> pgTAP against an ephemeral Supabase -> EAS build.

---

## 12. Key decisions and the alternatives rejected

| # | Decision | Rejected alternative | Why |
|---|---|---|---|
| 1 | Nutrition from the database; the LLM never returns numbers | LLM returns full macros | hallucinated calories are this product's worst possible failure |
| 2 | Client to Postgres via RLS for CRUD | everything through edge functions | RLS is a stronger, database-enforced guarantee; fewer hops, less hand-written authz |
| 3 | Edge functions for AI, quota and webhooks only | AI key in the client | a key in an app bundle is a public key |
| 4 | Denormalised nutrition snapshot on `meal_items` | join to `foods` at read time | source data mutates; history must not silently rewrite itself |
| 5 | Macros as columns, micronutrients as EAV | full EAV, or forty columns | matches query patterns: lists need four numbers, detail needs forty |
| 6 | Day totals computed on read | a maintained `daily_logs` aggregate | roughly twenty rows a day; a second source of truth would drift |
| 7 | TanStack Query plus Zustand | Redux Toolkit | the state is server state; Redux adds ceremony, not capability |
| 8 | FTS + trigram + alias table for food matching | pgvector embeddings | deterministic and debuggable, no embedding pipeline; pgvector stays available if recall proves insufficient |
| 9 | Single Expo app plus `supabase/` | Turborepo monorepo | one deployable; monorepo tooling is a cost with no current benefit |
| 10 | Jest only | Vitest plus Jest | one runner, one config |
| 11 | Outbox for diary writes only | full offline sync | proportionate to the actual failure mode |
| 12 | 18+ in v1 | open to minors | adult deficit logic is unsafe for adolescents |

---

## 13. Top technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Portion estimation is inherently imprecise** | wrong calories, silent user harm, churn | never auto-commit; mandatory review; household measures; visible confidence; optional reference-object hint (a fork or card in frame) |
| **AI cost per scan versus subscription price** | negative unit economics at scale | quota by tier, aggressive downscaling, cache by image hash, measure cost per scan from day one |
| **Food database coverage for Bulgarian and local products** | "my food isn't here", then abandonment | OFF barcode data plus USDA generics plus user-created foods promoted to public after review |
| **RLS misconfiguration** | cross-user data breach | default deny, pgTAP in CI, a new-table checklist, a security review before launch |
| **GDPR exposure through photos sent to a vendor** | regulatory and trust | EU region, DPA, no-training setting, explicit consent, 90-day photo lifecycle |
| **App Store / Play review** | launch delay | no medical claims, correct subscription disclosure, working account deletion, 18+ rating |
| **Scope** | nothing finished well | strict phase order; each phase meets Definition of Done before the next begins |

---

## 14. External services required

| Service | Purpose | Notes |
|---|---|---|
| Supabase (EU / Frankfurt) | Auth, Postgres, Storage, Edge Functions | Pro tier for backups and PITR before launch |
| Vision + LLM vendor | photo analysis, coach, suggestions | **decision pending** — see section 15 |
| Open Food Facts | barcode to product | free; **ODbL** terms need review before we redistribute any derived database |
| USDA FoodData Central | generic whole foods | public domain; free API key; a good seed corpus |
| RevenueCat | in-app purchases, entitlements, webhook | avoids hand-rolling StoreKit and Play Billing |
| Apple Developer, Google Play | distribution | roughly $99/yr and $25 once |
| Expo EAS | builds, OTA updates | |
| Sentry | error and performance monitoring | |
| PostHog EU (or equivalent) | product analytics | EU data residency |

---

## 15. Decision log

Decided 2026-08-30.

### D-1 — Vision vendor: deferred to a measured bake-off

The edge function is built against a narrow `VisionProvider` interface:

```ts
interface VisionProvider {
  readonly id: string;                       // 'anthropic' | 'openai' | 'google'
  analyze(input: { imageUrl: string; prompt: Prompt }): Promise<{
    text: string; inputTokens: number; outputTokens: number; costUsd: number;
  }>;
}
```

Everything downstream — JSON extraction, zod validation, clamping, persistence, matching —
is vendor-independent and written once. Adapters are thin. The chosen vendor is an
environment variable (`AI_VISION_PROVIDER`), and `ai_scans.model` records which one
produced each result.

The bake-off then runs on roughly fifty real meal photos with known weights, comparing
identification accuracy, portion error, JSON schema compliance rate, latency and cost per
scan. Because `ai_scan_items` stores both the model estimate and the user's correction,
this evaluation keeps running in production rather than ending at launch.

Cost: one interface plus adapters, perhaps half a day. Benefit: the vendor stops being a
one-way door, which also protects us if pricing or terms change later. This was the right
call.

**Blocks:** Phase 4 completion. **Does not block:** Phases 0-3.

### D-2 — Food data: hybrid seed plus write-through cache

- Seed roughly 8,000 USDA Foundation and SR Legacy foods at build time. Public domain,
  no licensing question, and they cover the generic whole foods that dominate both search
  and AI matching ("chicken breast", "white rice", "olive oil").
- On a barcode miss, fetch from Open Food Facts through an edge function and write through
  to `foods` with `source = 'off'` and a `fetched_at` timestamp. Refresh when stale.
- Users may create private foods, so the app is never a dead end.

`foods` therefore needs `fetched_at timestamptz` and a staleness policy (see
DATABASE.md section 13, item 1).

**Open item:** Open Food Facts is ODbL-licensed. Caching for our own users is
straightforward; redistributing a derived database carries share-alike obligations. This
needs a decision before we build anything that exports or republishes that data — not
after. Attribution must appear in the app regardless.

### D-3 — Age policy: deferred, defaulting to 18+

Enforcement is split, deliberately:

- **Database:** a permissive legal floor only (`date_of_birth <= current_date - 13 years`).
  A hard 18+ `CHECK` would have to be migrated away under load if the policy changes, and
  migrating a constraint on a live user table to relax a rule is avoidable work.
- **Domain:** `domain/nutrition/safety/agePolicy.ts` holds the product rule as
  configuration — `{ minAge: 18, minAgeForDeficitGoals: 18 }` — and the onboarding flow,
  goal creation and target computation all consult it.

The shipped default is 18+. Changing to a 16+ maintenance-only policy later becomes a
constant change plus tests, rather than a migration plus a schema change plus a rewrite of
the safety rails. The abstraction is one small module, which is a fair price for keeping
the decision open.

### Still open

- **Monetisation shape** — free-tier limits and premium price. Needed for the quota
  constants in Phase 8, not for the architecture. Placeholder: 3 AI scans/day free,
  unlimited on premium.
- **ODbL redistribution position** (see D-2).

### Defaults chosen without asking

Supabase EU/Frankfurt; English and Bulgarian at launch; RevenueCat; Jest; Maestro; Expo
managed workflow with development builds, since native modules such as MMKV and
RevenueCat rule out Expo Go.

---

## 16. Where reality differed from the plan

Recorded because a design document that quietly matches whatever got built is
not worth reading.

**Routes live at `src/app`, not the repository root.** The Expo SDK 57 template
puts them there. Following the framework beat fighting it.

**`shared/ai-contracts` has no dependencies, not even zod.** The plan assumed one
schema definition imported by both runtimes with zod resolved through an import
map. The Supabase edge runtime does not apply that map to a file outside
`supabase/functions/`, and Metro rejects the explicit `.ts` extension Deno needs
for a sibling import. Both verified from the actual boot error. The validation is
hand-written and the 27 tests carried over unchanged, because they assert
behaviour rather than the library.

**Edge functions use fully-qualified `npm:` specifiers.** The `import_map`
setting in `config.toml` was tried and never reached the worker. It was removed
rather than left in: configuration that does nothing reads as a working mechanism
nobody should touch.

**Two additional RPCs were needed for atomicity.** `set_active_goal` and
`consume_ai_quota` both exist because a check followed by a write is two
statements, and supabase-js cannot wrap two calls in a transaction. In the goal
case the gap leaves a user with no active goal; in the quota case two concurrent
scans both see the last free slot. The database does both in one statement.

**The weight trend uses a regression, not smoothed endpoints.** A centred moving
average is truncated at both ends, which pulls the endpoints inward and
understated the trend by 11% on a month of daily readings. Found by a test whose
expectation was computed by hand rather than from a run.

**Component and E2E tests were specified and not written.** TESTING.md describes
both layers. Neither exists. That is a gap, not a change of plan - see
PRODUCTION.md B6.
