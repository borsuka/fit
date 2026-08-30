-- ============================================================================
-- 0007  Meal plans, preferences and shopping lists
-- ============================================================================

create table public.user_diet_settings (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  diet               text not null default 'omnivore'
                     check (diet in ('omnivore','vegetarian','vegan','pescatarian','keto','mediterranean')),
  excluded_allergens smallint[] not null default '{}',
  cuisines           text[] not null default '{}',
  meals_per_day      smallint not null default 4 check (meals_per_day between 2 and 8),
  max_prep_minutes   smallint check (max_prep_minutes between 5 and 240),
  budget_tier        smallint check (budget_tier between 1 and 3),
  updated_at         timestamptz not null default now()
);

create trigger user_diet_settings_set_updated_at
  before update on public.user_diet_settings
  for each row execute function public.set_updated_at();

create table public.user_food_preferences (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  food_id    uuid not null references public.foods(id) on delete cascade,
  preference public.food_preference not null,
  primary key (user_id, food_id)
);

-- ---------------------------------------------------------------------------

create table public.meal_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name          text not null check (char_length(name) between 1 and 120),
  start_date    date not null,
  end_date      date not null,
  meals_per_day smallint not null check (meals_per_day between 2 and 8),

  -- Freezes the targets the plan was generated against, so the plan stays
  -- self-consistent even if the user changes their goal mid-week.
  target_snapshot   jsonb not null,
  generator_version text not null,
  created_at        timestamptz not null default now(),

  constraint plan_dates_ordered check (end_date >= start_date)
);
create index meal_plans_user_idx on public.meal_plans (user_id, start_date desc);

create table public.meal_plan_days (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.meal_plans(id) on delete cascade,
  day_index  smallint not null check (day_index >= 0),
  local_date date not null,
  unique (plan_id, day_index)
);

create table public.meal_plan_meals (
  id          uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.meal_plan_days(id) on delete cascade,
  meal_type   public.meal_type not null,
  recipe_id   uuid references public.recipes(id) on delete set null,
  servings    numeric(5,2) not null default 1 check (servings > 0),

  -- Computed by the solver from recipe_ingredients x food_nutrients, then
  -- frozen. The LLM never supplies these.
  kcal      numeric(8,2) not null check (kcal >= 0),
  protein_g numeric(7,2) not null default 0,
  carbs_g   numeric(7,2) not null default 0,
  fat_g     numeric(7,2) not null default 0,

  locked     boolean not null default false,  -- user pinned it; solver must keep it
  sort_order smallint not null default 0
);
create index meal_plan_meals_day_idx on public.meal_plan_meals (plan_day_id, sort_order);

-- ---------------------------------------------------------------------------

create table public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  plan_id    uuid references public.meal_plans(id) on delete set null,
  name       text not null default 'Shopping list',
  created_at timestamptz not null default now()
);

create table public.shopping_list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.shopping_lists(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  food_id    uuid references public.foods(id) on delete set null,
  custom_name text check (char_length(custom_name) <= 120),
  quantity_g numeric(9,2) check (quantity_g > 0),
  unit_hint  text,
  aisle      text,
  is_checked boolean not null default false,
  constraint item_has_a_name check (food_id is not null or custom_name is not null)
);
create index shopping_list_items_list_idx on public.shopping_list_items (list_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.user_diet_settings    enable row level security;
alter table public.user_food_preferences enable row level security;
alter table public.meal_plans            enable row level security;
alter table public.meal_plan_days        enable row level security;
alter table public.meal_plan_meals       enable row level security;
alter table public.shopping_lists        enable row level security;
alter table public.shopping_list_items   enable row level security;

create policy user_diet_settings_all on public.user_diet_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy user_food_preferences_all on public.user_food_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy meal_plans_all on public.meal_plans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Children are reached through their plan; ownership is checked one hop up.
create policy meal_plan_days_all on public.meal_plan_days for all to authenticated
  using (exists (select 1 from public.meal_plans p
                 where p.id = meal_plan_days.plan_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.meal_plans p
                 where p.id = meal_plan_days.plan_id and p.user_id = (select auth.uid())));

create policy meal_plan_meals_all on public.meal_plan_meals for all to authenticated
  using (exists (select 1 from public.meal_plan_days d
                 join public.meal_plans p on p.id = d.plan_id
                 where d.id = meal_plan_meals.plan_day_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.meal_plan_days d
                 join public.meal_plans p on p.id = d.plan_id
                 where d.id = meal_plan_meals.plan_day_id and p.user_id = (select auth.uid())));

create policy shopping_lists_all on public.shopping_lists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy shopping_list_items_all on public.shopping_list_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
