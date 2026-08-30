-- ============================================================================
-- 0004  Food diary
-- ============================================================================

create table public.meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  local_date date not null,
  meal_type  public.meal_type not null,
  eaten_at   timestamptz,
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

comment on column public.meals.local_date is
  'The USER''s calendar date, computed client-side from profiles.timezone. Deriving it from a UTC timestamp puts a 00:30 Sofia meal on the wrong day.';
comment on column public.meals.eaten_at is
  'Absolute instant, for analytics. local_date is what the diary groups by.';

create index meals_user_date_idx on public.meals (user_id, local_date desc);

-- ---------------------------------------------------------------------------

create table public.meal_items (
  id      uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,

  -- Denormalised on purpose. Without it every RLS policy on this table becomes
  -- a per-row subquery back to meals - on the highest-row-count table in the
  -- schema. One redundant uuid buys a direct, index-backed policy.
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),

  source public.entry_source not null,

  food_id         uuid references public.foods(id) on delete set null,
  recipe_id       uuid,  -- FK added in 0005 (table does not exist yet)
  ai_scan_item_id uuid,  -- FK added in 0006
  custom_name     text check (char_length(custom_name) <= 120),

  quantity_g  numeric(8,2) not null check (quantity_g > 0 and quantity_g <= 5000),
  serving_id  uuid references public.food_servings(id) on delete set null,
  serving_qty numeric(6,2) check (serving_qty > 0),

  -- ---------------------------------------------------------------------
  -- IMMUTABLE SNAPSHOT, computed at write time from foods/recipes x grams.
  -- Source nutrition data mutates (Open Food Facts updates constantly).
  -- Without this, last month's lunch silently changes its calories.
  -- ---------------------------------------------------------------------
  kcal      numeric(8,2) not null check (kcal      >= 0),
  protein_g numeric(7,2) not null default 0 check (protein_g >= 0),
  carbs_g   numeric(7,2) not null default 0 check (carbs_g   >= 0),
  fat_g     numeric(7,2) not null default 0 check (fat_g     >= 0),
  fiber_g   numeric(7,2) check (fiber_g >= 0),

  created_at timestamptz not null default now(),

  -- Exactly one reference, or a free-text quick-add with neither.
  constraint one_reference check (
    num_nonnulls(food_id, recipe_id) = 1
    or (food_id is null and recipe_id is null and custom_name is not null)
  )
);

create index meal_items_meal_idx on public.meal_items (meal_id);
create index meal_items_user_idx on public.meal_items (user_id, created_at desc);
create index meal_items_food_idx on public.meal_items (food_id) where food_id is not null;

-- ---------------------------------------------------------------------------
-- Day-level data the user enters DIRECTLY. Deliberately holds no calorie or
-- macro totals: those are aggregated from meal_items (~20 rows behind a
-- composite index, i.e. microseconds). A stored aggregate would be a second
-- source of truth that drifts the first time an edit path forgets it, and it
-- would then be wrong in a way nobody notices until a user reports numbers
-- that do not add up.
-- ---------------------------------------------------------------------------

create table public.daily_logs (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  local_date date not null,
  water_ml   integer not null default 0 check (water_ml between 0 and 20000),
  note       text check (char_length(note) <= 1000),
  mood       smallint check (mood between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create trigger daily_logs_set_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create table public.weight_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  logged_on    date not null,
  weight_kg    numeric(5,2) not null check (weight_kg between 20 and 400),
  body_fat_pct numeric(4,1) check (body_fat_pct between 1 and 70),
  source       text not null default 'manual',
  created_at   timestamptz not null default now()
);
create unique index weight_logs_one_per_day on public.weight_logs (user_id, logged_on);
create index weight_logs_user_idx on public.weight_logs (user_id, logged_on desc);

create table public.body_measurements (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  logged_on date not null,
  site      text not null check (site in ('waist','chest','hip','thigh','arm','neck','calf','shoulder')),
  value_cm  numeric(5,1) not null check (value_cm between 10 and 300)
);
create unique index body_measurements_uniq on public.body_measurements (user_id, logged_on, site);

create table public.favorite_foods (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  food_id    uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

-- "Recent foods" is a query over meal_items, not a table. One less thing to
-- keep in sync.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.meals             enable row level security;
alter table public.meal_items        enable row level security;
alter table public.daily_logs        enable row level security;
alter table public.weight_logs       enable row level security;
alter table public.body_measurements enable row level security;
alter table public.favorite_foods    enable row level security;

create policy meals_select on public.meals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy meals_insert on public.meals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy meals_update on public.meals for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meals_delete on public.meals for delete to authenticated
  using ((select auth.uid()) = user_id);

-- meal_items additionally verifies the parent meal belongs to the same user,
-- so a client cannot attach an item to somebody else's meal by guessing an id.
create policy meal_items_select on public.meal_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy meal_items_insert on public.meal_items for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.meals m
                where m.id = meal_items.meal_id and m.user_id = (select auth.uid()))
  );
create policy meal_items_update on public.meal_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meal_items_delete on public.meal_items for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy daily_logs_select on public.daily_logs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy daily_logs_insert on public.daily_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy daily_logs_update on public.daily_logs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy daily_logs_delete on public.daily_logs for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy weight_logs_select on public.weight_logs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy weight_logs_insert on public.weight_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy weight_logs_update on public.weight_logs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy weight_logs_delete on public.weight_logs for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy body_measurements_select on public.body_measurements for select to authenticated
  using ((select auth.uid()) = user_id);
create policy body_measurements_insert on public.body_measurements for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy body_measurements_update on public.body_measurements for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy body_measurements_delete on public.body_measurements for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy favorite_foods_select on public.favorite_foods for select to authenticated
  using ((select auth.uid()) = user_id);
create policy favorite_foods_insert on public.favorite_foods for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy favorite_foods_delete on public.favorite_foods for delete to authenticated
  using ((select auth.uid()) = user_id);
