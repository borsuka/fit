-- ============================================================================
-- 0019  Ingredient categories on the planner's candidate view
-- ============================================================================
-- A diet setting of "vegetarian" has to mean something the solver can act on.
-- Categories are the only structured fact we hold about what a food IS, so the
-- exclusion is expressed over them: a recipe containing anything from
-- meat-poultry is not vegetarian, and no amount of naming it "veggie bowl"
-- changes that.
--
-- This is why the diet picker offers omnivore, vegetarian, vegan and
-- pescatarian and nothing else. Keto and mediterranean are shapes of a macro
-- split, not lists of forbidden categories; offering them here would put a
-- setting in front of the user that quietly did nothing.
-- ============================================================================

create or replace view public.meal_plan_candidates
with (security_invoker = true) as
select
  r.id                         as recipe_id,
  r.name,
  r.user_id,
  r.is_public,
  r.meal_slots,
  r.prep_minutes,
  rn.kcal_per_serving          as kcal,
  rn.protein_g_per_serving     as protein_g,
  rn.carbs_g_per_serving       as carbs_g,
  rn.fat_g_per_serving         as fat_g,
  coalesce(
    (select array_agg(distinct fa.allergen_id)
       from public.recipe_ingredients ri
       join public.food_allergens fa on fa.food_id = ri.food_id
      where ri.recipe_id = r.id),
    '{}'::smallint[]
  ) as allergen_ids,
  coalesce(
    (select array_agg(distinct ri.food_id)
       from public.recipe_ingredients ri
      where ri.recipe_id = r.id),
    '{}'::uuid[]
  ) as food_ids,
  -- Slugs rather than ids: the solver is a pure function that has to be
  -- readable in a test, and `['meat-poultry']` says what a uuid cannot.
  coalesce(
    (select array_agg(distinct fc.slug)
       from public.recipe_ingredients ri
       join public.foods f           on f.id  = ri.food_id
       join public.food_categories fc on fc.id = f.category_id
      where ri.recipe_id = r.id),
    '{}'::text[]
  ) as category_slugs
from public.recipes r
join public.recipe_nutrition rn on rn.recipe_id = r.id
where array_length(r.meal_slots, 1) > 0
  -- A recipe with no ingredients has no derived nutrition, and planning around
  -- a zero-calorie meal produces a day that adds up on paper and starves in
  -- practice.
  and rn.kcal_per_serving > 0;

comment on view public.meal_plan_candidates is
  'One row per plannable recipe, with derived per-serving nutrition, aggregated allergens and ingredient categories. security_invoker: RLS decides visibility.';
