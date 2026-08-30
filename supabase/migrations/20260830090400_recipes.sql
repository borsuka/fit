-- ============================================================================
-- 0005  Recipes
-- ============================================================================

create table public.recipes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade,  -- null = curated
  name         text not null check (char_length(name) between 1 and 160),
  servings     numeric(5,2) not null check (servings > 0 and servings <= 100),
  instructions text,
  prep_minutes smallint check (prep_minutes between 0 and 1440),
  cook_minutes smallint check (cook_minutes between 0 and 1440),
  image_path   text,
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A curated recipe (user_id null) must be public; a user recipe cannot make
  -- itself public - promotion is a service_role decision, same as foods.
  constraint curated_is_public check (user_id is not null or is_public)
);

create index recipes_user_idx   on public.recipes (user_id) where user_id is not null;
create index recipes_public_idx on public.recipes (is_public) where is_public;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  -- restrict, not cascade: foods are soft-deleted anyway, and a hard delete
  -- that silently emptied a recipe would be worse than an error.
  food_id    uuid not null references public.foods(id) on delete restrict,
  quantity_g numeric(8,2) not null check (quantity_g > 0 and quantity_g <= 20000),
  note       text check (char_length(note) <= 200),
  sort_order smallint not null default 0
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

-- Now that recipes exists, close the diary FK left open in 0004.
alter table public.meal_items
  add constraint meal_items_recipe_id_fkey
  foreign key (recipe_id) references public.recipes(id) on delete set null;

create index meal_items_recipe_idx on public.meal_items (recipe_id) where recipe_id is not null;

-- ---------------------------------------------------------------------------
-- Recipe nutrition is COMPUTED, never stored as a hand-entered total.
-- A recipe whose displayed calories disagree with its own ingredient list
-- destroys trust in every other number in the app.
-- ---------------------------------------------------------------------------

create or replace view public.recipe_nutrition
with (security_invoker = true) as
select
  r.id as recipe_id,
  r.servings,
  coalesce(sum(f.kcal_100g    * ri.quantity_g / 100.0), 0) as kcal_total,
  coalesce(sum(f.protein_100g * ri.quantity_g / 100.0), 0) as protein_g_total,
  coalesce(sum(f.carbs_100g   * ri.quantity_g / 100.0), 0) as carbs_g_total,
  coalesce(sum(f.fat_100g     * ri.quantity_g / 100.0), 0) as fat_g_total,
  coalesce(sum(f.fiber_100g   * ri.quantity_g / 100.0), 0) as fiber_g_total,
  coalesce(sum(f.kcal_100g    * ri.quantity_g / 100.0), 0) / r.servings as kcal_per_serving,
  coalesce(sum(f.protein_100g * ri.quantity_g / 100.0), 0) / r.servings as protein_g_per_serving,
  coalesce(sum(f.carbs_100g   * ri.quantity_g / 100.0), 0) / r.servings as carbs_g_per_serving,
  coalesce(sum(f.fat_100g     * ri.quantity_g / 100.0), 0) / r.servings as fat_g_per_serving
from public.recipes r
left join public.recipe_ingredients ri on ri.recipe_id = r.id
left join public.foods f              on f.id = ri.food_id
group by r.id, r.servings;

comment on view public.recipe_nutrition is
  'security_invoker: the view runs with the CALLER''s permissions, so RLS on recipes/foods still applies. Without it a view is a hole straight through RLS.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;

create policy recipes_select on public.recipes for select to authenticated
  using (is_public or user_id = (select auth.uid()));
create policy recipes_insert on public.recipes for insert to authenticated
  with check (user_id = (select auth.uid()) and is_public = false);
create policy recipes_update on public.recipes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and is_public = false);
create policy recipes_delete on public.recipes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy recipe_ingredients_select on public.recipe_ingredients for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and (r.is_public or r.user_id = (select auth.uid()))
  ));

create policy recipe_ingredients_write on public.recipe_ingredients for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id and r.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id and r.user_id = (select auth.uid())
  ));
