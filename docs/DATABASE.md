# Database Design

**Status:** Proposed (Phase 1). No migrations written yet.
**Engine:** PostgreSQL (Supabase), EU / Frankfurt.
**Last updated:** 2026-08-30

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Principles

1. **Every table has RLS enabled and a default-deny posture.** A table without a policy
   is unreadable, which is the correct failure mode.
2. **History is immutable.** Anything the user logged is a record of what they logged,
   not a live view onto mutable reference data. Diary rows carry a nutrition snapshot.
3. **Reference data and user data are separate.** `foods` and `exercises` are global and
   read-only to clients; `meals` and `workout_sets` belong to exactly one user.
4. **Schema follows query patterns.** Macros are columns because every list screen needs
   them; micronutrients are rows because they are sparse, numerous and rarely read.
5. **Store canonical units** — grams, kilograms, centimetres, kilocalories. Imperial is a
   display-layer conversion, never a storage format. Mixed units in a database is how
   you get a 70-pound user with a 2 m height.
6. **Forward-only numbered migrations.** No editing a migration that has been applied
   anywhere but a local machine.

---

## 2. Enumerations

```sql
create type sex_at_birth      as enum ('male', 'female');
create type activity_level    as enum ('sedentary','light','moderate','very','extra');
create type goal_type         as enum ('lose','maintain','gain','muscle_gain');
create type meal_type         as enum ('breakfast','lunch','dinner','snack');
create type food_source       as enum ('usda','off','user','curated');
create type entry_source      as enum ('search','barcode','ai_scan','manual','recipe','favorite');
create type scan_status       as enum ('pending','analyzing','matched','confirmed','failed','discarded');
create type subscription_tier as enum ('free','premium');
```

`sex_at_birth` is a **metabolic formula input**, not an identity field, and is labelled as
such in the UI. Mifflin-St Jeor has only these two parameterisations; there is no honest
third value to offer. Users who decline to answer cannot receive a BMR estimate, and the
app should say that plainly rather than silently guessing.

---

## 3. Identity and goals

```sql
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text,
  date_of_birth  date not null,
  sex            sex_at_birth not null,
  height_cm      numeric(5,1) not null check (height_cm between 120 and 250),
  timezone       text not null default 'UTC',
  locale         text not null default 'en',
  unit_system    text not null default 'metric' check (unit_system in ('metric','imperial')),
  onboarded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Legal floor only. The 18+ PRODUCT policy lives in
  -- domain/nutrition/safety/agePolicy.ts so it can change without a migration.
  constraint min_legal_age check (date_of_birth <= current_date - interval '13 years')
);

create table goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  goal              goal_type not null,
  activity          activity_level not null,
  start_weight_kg   numeric(5,2) not null check (start_weight_kg between 30 and 300),
  target_weight_kg  numeric(5,2)          check (target_weight_kg between 30 and 300),
  weekly_rate_kg    numeric(4,3),                    -- signed; safety-clamped in domain
  calorie_target    integer not null check (calorie_target between 1000 and 6000),
  protein_g         integer not null check (protein_g >= 0),
  carbs_g           integer not null check (carbs_g   >= 0),
  fat_g             integer not null check (fat_g     >= 0),
  fiber_g           integer,
  water_ml          integer,
  computed_by       text not null,                   -- e.g. 'nutrition-engine-v1'
  effective_from    date not null default current_date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create unique index goals_one_active_per_user
  on goals (user_id) where is_active;
```

Goals are **append-only and versioned**, not mutated in place. When a user changes their
target, we insert a new row and deactivate the previous one. Progress charts three months
later then remain interpretable, because we still know what the target was on any given
day. The `computed_by` column records which engine version produced the numbers, so a
formula change is auditable rather than invisible.

The age constraint enforces only the **legal** floor at the database level, because
client-side validation is a suggestion. The **product** rule — 18+ in v1, and no
deficit-based goals below that age — lives in `domain/nutrition/safety/agePolicy.ts`
(decision D-3). Splitting them this way means tightening or relaxing the product policy is
a constant change and a test run, not a constraint migration against a live user table.

---

## 4. Food reference data

```sql
create table food_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  parent_id uuid references food_categories(id) on delete set null
);

create table foods (
  id             uuid primary key default gen_random_uuid(),
  source         food_source not null,
  source_id      text,                       -- USDA fdc_id / OFF product code
  barcode        text,
  name           text not null,
  brand          text,
  category_id    uuid references food_categories(id) on delete set null,

  -- hot-path macros, always per 100 g
  kcal_100g      numeric(7,2) not null check (kcal_100g between 0 and 900),
  protein_100g   numeric(6,2) not null default 0 check (protein_100g >= 0),
  carbs_100g     numeric(6,2) not null default 0 check (carbs_100g   >= 0),
  fat_100g       numeric(6,2) not null default 0 check (fat_100g     >= 0),
  fiber_100g     numeric(6,2),
  sugar_100g     numeric(6,2),
  sat_fat_100g   numeric(6,2),
  sodium_mg_100g numeric(8,2),

  density_g_ml   numeric(6,3),               -- enables volume -> mass conversion
  fetched_at     timestamptz,                -- write-through cache freshness (D-2)
  is_public      boolean not null default false,
  created_by     uuid references profiles(id) on delete set null,
  verified_at    timestamptz,
  archived_at    timestamptz,                -- soft delete only
  data_quality   smallint not null default 3 check (data_quality between 1 and 5),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  search_vector  tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name,  '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B')
  ) stored
);

create unique index foods_source_uniq  on foods (source, source_id) where source_id is not null;
create unique index foods_barcode_uniq on foods (barcode)           where barcode   is not null;
create index foods_search_idx  on foods using gin (search_vector);
create index foods_trgm_idx    on foods using gin (name gin_trgm_ops);
create index foods_public_idx  on foods (is_public) where archived_at is null;
```

**Foods are never hard-deleted** — only archived. A hard delete would orphan or rewrite
diary history, and the whole point of the snapshot design is that history stays true.

The macro columns duplicate what could live in `food_nutrients`. That is deliberate: a
search results list renders twenty foods with four numbers each, and doing that through
an EAV join is a needless twenty-way pivot on the hottest query in the app. Micronutrients
go in the EAV table because there are forty of them, most are null for most foods, and
they are only read on a detail screen.

```sql
create table nutrients (            -- canonical definitions
  id       smallint primary key,
  code     text not null unique,    -- 'vitamin_c', 'iron', ...
  unit     text not null,           -- 'mg', 'ug', 'g'
  group_id smallint
);

create table food_nutrients (
  food_id     uuid     not null references foods(id) on delete cascade,
  nutrient_id smallint not null references nutrients(id),
  amount_100g numeric(12,4) not null check (amount_100g >= 0),
  primary key (food_id, nutrient_id)
);

create table food_servings (
  id          uuid primary key default gen_random_uuid(),
  food_id     uuid not null references foods(id) on delete cascade,
  label       text not null,              -- 'slice', 'medium', 'cup'
  grams       numeric(7,2) not null check (grams > 0),
  is_default  boolean not null default false
);
create unique index food_servings_one_default on food_servings (food_id) where is_default;

create table allergens        ( id smallint primary key, code text not null unique );
create table food_allergens   ( food_id uuid references foods(id) on delete cascade,
                                allergen_id smallint references allergens(id),
                                primary key (food_id, allergen_id) );

create table food_translations ( food_id uuid references foods(id) on delete cascade,
                                 locale text not null, name text not null,
                                 primary key (food_id, locale) );

create table food_aliases      ( id uuid primary key default gen_random_uuid(),
                                 food_id uuid not null references foods(id) on delete cascade,
                                 alias text not null, locale text not null default 'en' );
create index food_aliases_trgm on food_aliases using gin (alias gin_trgm_ops);
```

`food_aliases` is what makes AI matching work. The model says "grilled chicken breast";
USDA calls it "Chicken, broilers or fryers, breast, meat only, cooked, roasted". A curated
alias table bridges that gap deterministically, and it is inspectable and fixable when it
gets something wrong — which an embedding index is not.

---

## 5. Diary

```sql
create table meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  local_date date not null,
  meal_type  meal_type not null,
  eaten_at   timestamptz,
  note       text,
  created_at timestamptz not null default now()
);
create index meals_user_date_idx on meals (user_id, local_date desc);

create table meal_items (
  id            uuid primary key default gen_random_uuid(),
  meal_id       uuid not null references meals(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,  -- denormalised for RLS
  source        entry_source not null,

  food_id       uuid references foods(id)   on delete set null,
  recipe_id     uuid references recipes(id) on delete set null,
  ai_scan_item_id uuid references ai_scan_items(id) on delete set null,

  custom_name   text,
  quantity_g    numeric(8,2) not null check (quantity_g > 0 and quantity_g <= 5000),
  serving_id    uuid references food_servings(id) on delete set null,
  serving_qty   numeric(6,2),

  -- IMMUTABLE SNAPSHOT, computed at write time
  kcal          numeric(8,2) not null check (kcal >= 0),
  protein_g     numeric(7,2) not null default 0,
  carbs_g       numeric(7,2) not null default 0,
  fat_g         numeric(7,2) not null default 0,
  fiber_g       numeric(7,2),

  created_at    timestamptz not null default now(),

  constraint one_reference check (
    num_nonnulls(food_id, recipe_id) = 1
    or (food_id is null and recipe_id is null and custom_name is not null)
  )
);
create index meal_items_meal_idx on meal_items (meal_id);
create index meal_items_user_idx on meal_items (user_id, created_at desc);
```

`user_id` is denormalised onto `meal_items` on purpose. Without it every RLS policy on
this table becomes a subquery back to `meals`, evaluated per row, on the table with the
highest row count in the schema. One redundant uuid buys a direct index-backed policy.

`local_date` is the **user's** date, not a UTC-derived one. A meal eaten at 00:30 in Sofia
belongs to that day's diary, and deriving the day from a UTC timestamp on the server would
put it on the previous one. The client computes `local_date` from the profile timezone;
`eaten_at` keeps the absolute instant for analytics.

```sql
create table daily_logs (          -- ONLY day-level data the user enters directly
  user_id    uuid not null references profiles(id) on delete cascade,
  local_date date not null,
  water_ml   integer default 0 check (water_ml >= 0),
  note       text,
  mood       smallint check (mood between 1 and 5),
  primary key (user_id, local_date)
);

create table weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  logged_on  date not null,
  weight_kg  numeric(5,2) not null check (weight_kg between 20 and 400),
  body_fat_pct numeric(4,1) check (body_fat_pct between 1 and 70),
  source     text not null default 'manual',
  created_at timestamptz not null default now()
);
create unique index weight_logs_one_per_day on weight_logs (user_id, logged_on);

create table body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  logged_on date not null,
  site text not null,               -- 'waist', 'chest', 'hip', ...
  value_cm numeric(5,1) not null check (value_cm between 10 and 300)
);
create unique index body_measurements_uniq on body_measurements (user_id, logged_on, site);

create table favorite_foods (
  user_id uuid references profiles(id) on delete cascade,
  food_id uuid references foods(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);
```

**`daily_logs` deliberately does not store calorie or macro totals.** Totals are derived by
aggregating `meal_items` for the day — roughly twenty rows behind a composite index, which
is microseconds. A stored aggregate would be a second source of truth that drifts the first
time an edit path forgets to update it, and it would then be wrong in a way nobody notices
until a user reports numbers that do not add up. "Recent foods" is likewise a query over
`meal_items`, not a table.

---

## 6. Recipes

```sql
create table recipes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete cascade,  -- null = curated
  name         text not null,
  servings     numeric(5,2) not null check (servings > 0),
  instructions text,
  prep_minutes smallint,
  cook_minutes smallint,
  image_path   text,
  is_public    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes(id) on delete cascade,
  food_id    uuid not null references foods(id)   on delete restrict,
  quantity_g numeric(8,2) not null check (quantity_g > 0),
  note       text,
  sort_order smallint not null default 0
);
```

Recipe nutrition is **never stored as a hand-entered total**. It is computed from the
ingredients — in a `recipe_nutrition` view for reads, snapshotted into `meal_items` when
logged. Manual totals go stale the moment an ingredient is edited, and a recipe whose
displayed calories disagree with its own ingredient list destroys trust in every other
number in the app.

`on delete restrict` on `recipe_ingredients.food_id` is intentional: foods are soft-deleted
anyway, and a hard delete that silently emptied a recipe would be worse than an error.

---

## 7. AI scans

```sql
create table ai_scans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  image_path     text not null,                 -- private bucket key
  image_hash     text,                          -- dedup / cache key
  status         scan_status not null default 'pending',
  prompt_version text,
  model          text,
  is_food        boolean,
  latency_ms     integer,
  input_tokens   integer,
  output_tokens  integer,
  cost_usd       numeric(8,5),
  error_code     text,
  meal_id        uuid references meals(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '90 days'
);
create index ai_scans_user_idx on ai_scans (user_id, created_at desc);

create table ai_scan_items (
  id               uuid primary key default gen_random_uuid(),
  scan_id          uuid not null references ai_scans(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  label            text not null,
  normalized_query text not null,
  estimated_grams  numeric(7,2) not null check (estimated_grams between 1 and 2000),
  confidence       numeric(4,3) not null check (confidence between 0 and 1),
  portion_basis    text,
  preparation      text,
  matched_food_id  uuid references foods(id) on delete set null,
  match_score      numeric(4,3),
  user_accepted    boolean,
  user_grams       numeric(7,2),                -- what the human actually chose
  sort_order       smallint not null default 0
);

create table ai_usage (
  user_id     uuid not null references profiles(id) on delete cascade,
  usage_date  date not null,
  feature     text not null,                   -- 'scan' | 'meal_plan' | 'coach'
  count       integer not null default 0,
  cost_usd    numeric(8,5) not null default 0,
  primary key (user_id, usage_date, feature)
);
```

`ai_scan_items` keeps the model's estimate **and** the user's correction side by side.
That pairing is the single most valuable dataset this product will generate: it measures
real-world accuracy per prompt version, shows where portion estimation is systematically
biased, and eventually supports a correction model. Overwriting the estimate with the
user's value would discard it.

`ai_usage` is the quota ledger, incremented inside the edge function in the same
transaction as the scan record. Client-side counting is not a quota.

---

## 8. Meal plans and shopping

```sql
meal_plans        (id, user_id, name, start_date, end_date, meals_per_day,
                   target_snapshot jsonb, generator_version, created_at)
meal_plan_days    (id, plan_id, day_index, local_date)
meal_plan_meals   (id, plan_day_id, meal_type, recipe_id, servings, kcal, protein_g,
                   carbs_g, fat_g, locked boolean)
shopping_lists    (id, user_id, plan_id, created_at)
shopping_list_items (id, list_id, food_id, quantity_g, unit_hint, is_checked, aisle)

user_food_preferences (user_id, food_id, preference)   -- 'liked' | 'disliked' | 'excluded'
user_diet_settings    (user_id, diet text, excluded_allergens smallint[], cuisines text[],
                       max_prep_minutes, budget_tier)
```

`target_snapshot` freezes the targets the plan was generated against, so a plan stays
self-consistent even after the user changes their goal mid-week.

`meal_plan_candidates` carries `category_slugs` alongside the aggregated allergens, so a
diet setting can be enforced over what a recipe is MADE OF rather than what it is called.
The picker offers omnivore, vegetarian, vegan and pescatarian only: keto and mediterranean
are shapes of a macro split, not lists of forbidden categories, and the column accepting
them does not mean the solver can honour them.

The three preference strengths are not interchangeable:

| Setting            | Strength | Effect on the solver                       |
| ------------------ | -------- | ------------------------------------------ |
| Excluded allergen  | hard     | Filtered in SQL **and** in the solver      |
| Diet category      | hard     | Filtered in the solver; unknown = excluded |
| Disliked food      | hard     | Filtered in the solver                     |
| Liked food         | soft     | Worth 0.15 in units of plan error          |

A like breaks ties between recipes that already fit. It cannot buy a worse plan — a 20 %
calorie miss costs more than the entire preference term is worth, and there is a test that
says so.

---

## 9. Workouts

Templates and performed sessions are separate. Conflating them means editing next week's
template silently rewrites last week's history.

```sql
exercises          (id, slug unique, name, primary_muscle, secondary_muscles text[],
                    equipment, difficulty, instructions, video_url, is_public, created_by)
exercise_translations (exercise_id, locale, name, instructions)

workouts           (id, user_id, name, note, is_template, created_at)      -- template
workout_exercises  (id, workout_id, exercise_id, sort_order, target_sets,
                    target_reps, target_weight_kg, rest_seconds)

workout_sessions   (id, user_id, workout_id null, name, started_at, ended_at,
                    duration_seconds, note)
session_exercises  (id, session_id, user_id, exercise_id, sort_order)
workout_sets       (id, session_exercise_id, user_id, set_number, reps,
                    weight_kg, rpe, is_warmup, completed_at)
```

`workout_sets` is the highest-volume user table in the schema; it carries `user_id`
directly for the same RLS reason as `meal_items`. Volume, estimated 1RM and progression
are computed in `domain/workouts`, never stored — they are functions of the sets, and a
stored copy is another thing that can disagree with reality.

Primary index: `workout_sets (user_id, completed_at desc)` for history, plus
`(session_exercise_id, set_number)` for the session screen.

### Programmes

```sql
programs           (id, slug unique, name, author, focus, experience, days_per_week,
                    description, sort_order, is_public)
program_days       (id, program_id, day_index, name)      -- position in the rotation
program_exercises  (id, program_day_id, exercise_id, sort_order, target_sets,
                    target_reps, rest_seconds, note)
```

Read-only reference data, like `foods`. Adopting a programme **copies** one day into the
user's own `workouts` (`adopt_program_day`), recording `workouts.source_program_id` for
display. Copying rather than referencing is what makes swapping an exercise an edit to
the user's plan instead of a fork of shared data, and it stops a catalogue change
rewriting a plan someone is three weeks into.

`day_index` is a position in the rotation, not a weekday. StrongLifts runs A/B/A then
B/A/B; pinning it to Monday would be wrong by the second week.

No weights are stored. Every one of these programmes sets load from the lifter's own
performance, and a seeded figure would be a number invented for a person we have never
met.

### Substitution

`exercises.movement_pattern` drives `suggest_alternatives(exercise, limit)`, which ranks
replacements: same pattern **and** muscle (1), same pattern (2), same muscle (3), easier
first within a rank. Derived rather than curated — a hand-maintained N-by-N table is
always half empty and the missing half is the half people ask for. An exercise with no
pattern returns same-muscle matches only; one that matches nothing returns an empty list
rather than an unrelated lift.

Two multi-table operations are functions rather than client-side inserts, because a
template with half its exercises, or a session missing three of them, is worse than one
that failed to be created:

- `adopt_program_day(program, day_index) -> workout id`
- `start_session_from_workout(workout) -> session id`

Both are `security invoker` and insert with `auth.uid()`, so RLS decides who ends up
owning the result.

---

## 10. System tables

```sql
subscriptions   (user_id pk, tier subscription_tier, store text, product_id,
                 rc_app_user_id, status, current_period_end, is_trial, updated_at)
consents        (id, user_id, kind, version, granted boolean, granted_at, revoked_at)
notifications   (id, user_id, kind, scheduled_for, sent_at, payload jsonb)
push_tokens     (user_id, token, platform, updated_at)
deletion_requests (id, user_id, requested_at, completed_at, status)
export_requests   (id, user_id, requested_at, file_path, expires_at)
```

`subscriptions` is written **only** by the RevenueCat webhook edge function running as
`service_role`. Its RLS policy grants users `SELECT` on their own row and no write path
whatsoever — otherwise a client could grant itself premium with one `update` call.
Entitlement checks in edge functions read this table rather than trusting a request body.

---

## 11. RLS pattern

Applied uniformly to every user-owned table:

```sql
alter table meal_items enable row level security;

create policy meal_items_select on meal_items for select
  using ((select auth.uid()) = user_id);

create policy meal_items_insert on meal_items for insert
  with check ((select auth.uid()) = user_id);

create policy meal_items_update on meal_items for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy meal_items_delete on meal_items for delete
  using ((select auth.uid()) = user_id);
```

Two details that matter:

- `(select auth.uid())` rather than a bare `auth.uid()`. Postgres treats the subquery as
  an InitPlan and evaluates it once per statement instead of once per row. On a large
  `meal_items` scan the difference is substantial.
- Every `update` policy needs **both** `using` and `with check`. With `using` alone a user
  can update their own row and reassign `user_id` to someone else, handing a row to
  another account. This is the most commonly missed RLS mistake and it is a real
  vulnerability, not a theoretical one.

Reference tables:

```sql
create policy foods_read on foods for select to authenticated
  using (archived_at is null and (is_public or created_by = (select auth.uid())));
-- no insert/update/delete policy: writes belong to service_role and seed jobs
```

Storage:

```sql
create policy food_photos_rw on storage.objects for all to authenticated
  using (bucket_id = 'food-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
```

### Verification

`supabase/tests/rls_*.sql` (pgTAP), run in CI against an ephemeral database. For every
user-owned table, with two seeded users, assert:

1. user A reads only their own rows;
2. user A cannot `update` or `delete` user B's rows;
3. user A cannot `insert` a row with `user_id = B`;
4. user A cannot reassign their own row's `user_id` to B;
5. the `anon` role reads nothing;
6. no client role can write `subscriptions`;
7. user A cannot read `food-photos/{B}/...`.

Any table added later without a matching test fails CI. That check is the difference
between believing RLS is correct and knowing it.

---

## 12. Conventions

- `updated_at` maintained by a shared `set_updated_at()` trigger, not by application code.
- All timestamps are `timestamptz`. Never `timestamp`.
- Money and nutrition use `numeric`, never `float`. Binary floating point and calorie
  arithmetic do not belong in the same sentence.
- Migrations are numbered and forward-only; a rollback is a new migration.
- Database types are generated with `supabase gen types typescript` and committed, so a
  schema change that breaks the app breaks `tsc` rather than production.

---

## 13. Open schema questions

Following decision D-2 (hybrid seed plus write-through cache) in ARCHITECTURE.md
section 15:

1. **Staleness policy for cached OFF rows.** `fetched_at` exists; the refresh rule does
   not. Proposed: refetch on read when older than 90 days, asynchronously, serving the
   cached row immediately. Needs confirming once we see real barcode-hit rates.
2. **ODbL redistribution position.** Caching Open Food Facts data for our own users is
   straightforward; redistributing a derived database carries share-alike obligations.
   This must be settled before we build any export or data-sharing path, and attribution
   belongs in the app regardless.
3. **Promotion of user-created foods to `is_public`.** If we ever do it, what is the
   moderation path? Public food data that nobody reviews is a slow-motion data-quality
   failure, and bad calorie data is exactly the failure this product cannot absorb.
   Default position: never promote automatically.
