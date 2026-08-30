-- ============================================================================
-- 0016  Recipe meal slots, and the planner's candidate view
-- ============================================================================
-- Porridge is not dinner. Without a slot marking, the planner will happily
-- serve breakfast at 8 pm because the arithmetic fits - and a plan nobody would
-- eat is not a plan.
-- ============================================================================

alter table public.recipes
  add column meal_slots public.meal_type[] not null default '{}'::public.meal_type[];

comment on column public.recipes.meal_slots is
  'Which slots this recipe belongs in. Empty means the planner will not select it, which is the safe default for a user-created recipe with no marking.';

-- ---------------------------------------------------------------------------
-- Everything the solver needs, in one row per recipe.
--
-- Nutrition comes from recipe_nutrition, which derives it from ingredients -
-- never a hand-entered total. Allergens are aggregated up from the ingredients'
-- foods, because a recipe is allergenic if anything in it is, and asking an
-- author to remember that is how a milk allergy gets missed.
--
-- security_invoker so RLS on recipes and foods still applies. A view without it
-- is a hole straight through row level security.
-- ---------------------------------------------------------------------------

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
  ) as food_ids
from public.recipes r
join public.recipe_nutrition rn on rn.recipe_id = r.id
where array_length(r.meal_slots, 1) > 0
  -- A recipe with no ingredients has no derived nutrition, and planning around
  -- a zero-calorie meal produces a day that adds up on paper and starves in
  -- practice.
  and rn.kcal_per_serving > 0;

comment on view public.meal_plan_candidates is
  'One row per plannable recipe, with derived per-serving nutrition and aggregated allergens. security_invoker: RLS decides visibility.';
