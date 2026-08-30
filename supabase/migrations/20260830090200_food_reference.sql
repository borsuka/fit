-- ============================================================================
-- 0003  Food reference data
-- ============================================================================
-- Global, read-only to clients, written by seed jobs and edge functions
-- running as service_role.
-- ============================================================================

create table public.food_categories (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,
  parent_id uuid references public.food_categories(id) on delete set null
);

create table public.foods (
  id          uuid primary key default gen_random_uuid(),
  source      public.food_source not null,
  source_id   text,                  -- USDA fdc_id / Open Food Facts product code
  barcode     text check (barcode ~ '^[0-9]{6,14}$'),
  name        text not null check (char_length(name) between 1 and 200),
  brand       text check (char_length(brand) <= 120),
  category_id uuid references public.food_categories(id) on delete set null,

  -- Hot-path macros, ALWAYS per 100 g.
  -- These duplicate what could live in food_nutrients. That is deliberate: a
  -- search list renders 20 foods x 4 numbers, and serving that from an EAV
  -- table means a 20-way pivot on the hottest query in the app.
  kcal_100g      numeric(7,2) not null check (kcal_100g between 0 and 900),
  protein_100g   numeric(6,2) not null default 0 check (protein_100g >= 0),
  carbs_100g     numeric(6,2) not null default 0 check (carbs_100g   >= 0),
  fat_100g       numeric(6,2) not null default 0 check (fat_100g     >= 0),
  fiber_100g     numeric(6,2) check (fiber_100g   >= 0),
  sugar_100g     numeric(6,2) check (sugar_100g   >= 0),
  sat_fat_100g   numeric(6,2) check (sat_fat_100g >= 0),
  sodium_mg_100g numeric(8,2) check (sodium_mg_100g >= 0),

  density_g_ml numeric(6,3) check (density_g_ml > 0),  -- volume -> mass conversion
  fetched_at   timestamptz,                            -- write-through cache freshness (D-2)

  is_public    boolean not null default false,
  created_by   uuid references public.profiles(id) on delete set null,
  verified_at  timestamptz,
  archived_at  timestamptz,                            -- soft delete ONLY
  data_quality smallint not null default 3 check (data_quality between 1 and 5),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name,  '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B')
  ) stored,

  -- Macro mass cannot exceed the mass of the food. Catches unit errors and
  -- mangled imports at the door rather than in someone's diary.
  constraint macros_within_100g check (protein_100g + carbs_100g + fat_100g <= 105)
);

comment on table public.foods is
  'Never hard-deleted, only archived. A hard delete would orphan diary history, and the snapshot design exists so history stays true.';

create unique index foods_source_uniq  on public.foods (source, source_id) where source_id is not null;
create unique index foods_barcode_uniq on public.foods (barcode)           where barcode   is not null;
create index foods_search_idx on public.foods using gin (search_vector);
create index foods_trgm_idx   on public.foods using gin (name extensions.gin_trgm_ops);
create index foods_public_idx on public.foods (is_public) where archived_at is null;
create index foods_created_by_idx on public.foods (created_by) where created_by is not null;

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Micronutrients: EAV, because there are ~40 of them, most are null for most
-- foods, and they are only read on a detail screen.
-- ---------------------------------------------------------------------------

create table public.nutrients (
  id       smallint primary key,
  code     text not null unique,   -- 'vitamin_c', 'iron', ...
  unit     text not null check (unit in ('g', 'mg', 'ug', 'kcal', 'IU')),
  group_id smallint
);

create table public.food_nutrients (
  food_id     uuid     not null references public.foods(id) on delete cascade,
  nutrient_id smallint not null references public.nutrients(id),
  amount_100g numeric(12,4) not null check (amount_100g >= 0),
  primary key (food_id, nutrient_id)
);

-- ---------------------------------------------------------------------------

create table public.food_servings (
  id         uuid primary key default gen_random_uuid(),
  food_id    uuid not null references public.foods(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 60),
  grams      numeric(7,2) not null check (grams > 0 and grams <= 5000),
  is_default boolean not null default false
);
create unique index food_servings_one_default on public.food_servings (food_id) where is_default;
create index food_servings_food_idx on public.food_servings (food_id);

create table public.allergens (
  id   smallint primary key,
  code text not null unique
);

create table public.food_allergens (
  food_id     uuid     not null references public.foods(id) on delete cascade,
  allergen_id smallint not null references public.allergens(id),
  primary key (food_id, allergen_id)
);

create table public.food_translations (
  food_id uuid not null references public.foods(id) on delete cascade,
  locale  text not null check (locale in ('en', 'bg')),
  name    text not null,
  primary key (food_id, locale)
);

-- What makes AI matching work. The model says "grilled chicken breast"; USDA
-- calls it "Chicken, broilers or fryers, breast, meat only, cooked, roasted".
-- A curated alias table bridges that deterministically - and unlike an
-- embedding index, it is inspectable and fixable when it gets something wrong.
create table public.food_aliases (
  id      uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  alias   text not null check (char_length(alias) between 1 and 120),
  locale  text not null default 'en' check (locale in ('en', 'bg'))
);
create index food_aliases_trgm_idx on public.food_aliases using gin (alias extensions.gin_trgm_ops);
create index food_aliases_food_idx on public.food_aliases (food_id);

-- ---------------------------------------------------------------------------
-- RLS: readable by any authenticated user, writable by nobody with a JWT.
-- Seed jobs and edge functions use service_role, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.foods              enable row level security;
alter table public.food_categories    enable row level security;
alter table public.nutrients          enable row level security;
alter table public.food_nutrients     enable row level security;
alter table public.food_servings      enable row level security;
alter table public.allergens          enable row level security;
alter table public.food_allergens     enable row level security;
alter table public.food_translations  enable row level security;
alter table public.food_aliases       enable row level security;

-- A user sees public foods plus their own private ones. Never anyone else's.
create policy foods_select on public.foods for select to authenticated
  using (
    archived_at is null
    and (is_public or created_by = (select auth.uid()))
  );

create policy foods_insert_own on public.foods for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and source = 'user'
    and is_public = false     -- promotion to public is a service_role decision
  );

create policy foods_update_own on public.foods for update to authenticated
  using (created_by = (select auth.uid()) and source = 'user')
  with check (created_by = (select auth.uid()) and source = 'user' and is_public = false);

-- No delete policy: user foods are archived, not deleted, so diary history holds.

create policy food_categories_read   on public.food_categories   for select to authenticated using (true);
create policy nutrients_read         on public.nutrients         for select to authenticated using (true);
create policy allergens_read         on public.allergens         for select to authenticated using (true);

-- Child rows inherit the parent food's visibility.
create policy food_nutrients_read on public.food_nutrients for select to authenticated
  using (exists (
    select 1 from public.foods f
    where f.id = food_nutrients.food_id
      and f.archived_at is null
      and (f.is_public or f.created_by = (select auth.uid()))
  ));

create policy food_servings_read on public.food_servings for select to authenticated
  using (exists (
    select 1 from public.foods f
    where f.id = food_servings.food_id
      and f.archived_at is null
      and (f.is_public or f.created_by = (select auth.uid()))
  ));

create policy food_allergens_read on public.food_allergens for select to authenticated
  using (exists (
    select 1 from public.foods f
    where f.id = food_allergens.food_id
      and f.archived_at is null
      and (f.is_public or f.created_by = (select auth.uid()))
  ));

create policy food_translations_read on public.food_translations for select to authenticated
  using (exists (
    select 1 from public.foods f
    where f.id = food_translations.food_id
      and f.archived_at is null
      and (f.is_public or f.created_by = (select auth.uid()))
  ));

create policy food_aliases_read on public.food_aliases for select to authenticated
  using (exists (
    select 1 from public.foods f
    where f.id = food_aliases.food_id
      and f.archived_at is null
      and (f.is_public or f.created_by = (select auth.uid()))
  ));

-- Users may attach servings to their OWN foods (a custom "1 scoop = 32 g").
create policy food_servings_write_own on public.food_servings for all to authenticated
  using (exists (
    select 1 from public.foods f
    where f.id = food_servings.food_id and f.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.foods f
    where f.id = food_servings.food_id and f.created_by = (select auth.uid())
  ));
