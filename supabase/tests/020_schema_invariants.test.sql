-- ============================================================================
-- Schema invariants
-- ============================================================================
-- Guards the structural rules the application relies on. If one of these ever
-- fails, some feature is quietly computing the wrong number.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- 1. RLS must be enabled on EVERY table in public. A table added later without
--    RLS fails here rather than in production.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
     from pg_tables t
     join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
    where t.schemaname = 'public' and not c.relrowsecurity),
  0,
  'every table in public has row level security enabled');

-- ---------------------------------------------------------------------------
-- 2. Every UPDATE policy must have a WITH CHECK clause. Without one, a user can
--    reassign ownership of their own row to somebody else.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and cmd in ('UPDATE', 'ALL')
      and with_check is null),
  0,
  'every UPDATE/ALL policy in public has a WITH CHECK clause');

-- ---------------------------------------------------------------------------
-- 2b. Every view in public must be security_invoker.
--
--     A view without it runs as its OWNER, and RLS on the underlying tables is
--     bypassed entirely - one unmarked view is a hole straight through every
--     policy in the schema. Generic on purpose: this fails on the commit that
--     adds an unmarked view, not six months later.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'v'
      and not coalesce(
        array_to_string(c.reloptions, ',') like '%security_invoker=true%', false)),
  0,
  'every view in public is security_invoker');

-- ---------------------------------------------------------------------------
-- 3. Age validation is enforced by the database, not just the client.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('33333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'c@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select throws_ok(
  $q$insert into public.profiles (id, date_of_birth, sex, height_cm)
     values ('33333333-3333-3333-3333-333333333333', current_date - interval '5 years', 'male', 120)$q$,
  '23514',
  null,
  'a 5-year-old cannot create a profile');

select throws_ok(
  $q$insert into public.profiles (id, date_of_birth, sex, height_cm)
     values ('33333333-3333-3333-3333-333333333333', current_date + interval '1 day', 'male', 180)$q$,
  '23514',
  null,
  'date_of_birth cannot be in the future');

select lives_ok(
  $q$insert into public.profiles (id, date_of_birth, sex, height_cm)
     values ('33333333-3333-3333-3333-333333333333', '1990-05-05', 'female', 165)$q$,
  'a valid adult profile inserts cleanly');

-- ---------------------------------------------------------------------------
-- 4. Nutrition sanity constraints reject mangled imports at the door.
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$insert into public.foods (source, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
     values ('usda', 'impossible', 500, 60, 60, 60)$q$,
  '23514',
  null,
  'macro mass exceeding 100 g per 100 g is rejected');

select throws_ok(
  $q$insert into public.foods (source, name, kcal_100g) values ('usda', 'too hot', 1200)$q$,
  '23514',
  null,
  'kcal above the physical ceiling (~900/100g) is rejected');

select throws_ok(
  $q$insert into public.foods (source, name, kcal_100g, barcode)
     values ('off', 'bad barcode', 100, 'not-a-barcode')$q$,
  '23514',
  null,
  'a non-numeric barcode is rejected');

-- ---------------------------------------------------------------------------
-- 5. meal_items must reference exactly one thing, or be a named quick-add.
-- ---------------------------------------------------------------------------

insert into public.meals (id, user_id, local_date, meal_type)
values ('dddddddd-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', '2026-08-30', 'snack');

insert into public.recipes (id, user_id, name, servings)
values ('eeeeeeee-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', 'Test recipe', 2);

insert into public.foods (id, source, name, kcal_100g, is_public)
values ('ffffffff-0000-0000-0000-000000000001', 'usda', 'Test food', 100, true);

select throws_ok(
  $q$insert into public.meal_items (meal_id, user_id, source, quantity_g, kcal,
                                    food_id, recipe_id)
     values ('dddddddd-0000-0000-0000-000000000001',
             '33333333-3333-3333-3333-333333333333', 'search', 100, 100,
             'ffffffff-0000-0000-0000-000000000001',
             'eeeeeeee-0000-0000-0000-000000000001')$q$,
  '23514',
  null,
  'a meal_item cannot reference both a food and a recipe');

select throws_ok(
  $q$insert into public.meal_items (meal_id, user_id, source, quantity_g, kcal)
     values ('dddddddd-0000-0000-0000-000000000001',
             '33333333-3333-3333-3333-333333333333', 'manual', 100, 100)$q$,
  '23514',
  null,
  'a meal_item with no reference and no custom_name is rejected');

select lives_ok(
  $q$insert into public.meal_items (meal_id, user_id, source, quantity_g, kcal, custom_name)
     values ('dddddddd-0000-0000-0000-000000000001',
             '33333333-3333-3333-3333-333333333333', 'manual', 100, 250, 'Grandma''s banitsa')$q$,
  'a free-text quick-add is allowed');

-- ---------------------------------------------------------------------------
-- 6. Recipe nutrition is derived, and derives correctly.
--    200 g of a 100 kcal/100 g food over 2 servings = 100 kcal per serving.
-- ---------------------------------------------------------------------------

insert into public.recipe_ingredients (recipe_id, food_id, quantity_g)
values ('eeeeeeee-0000-0000-0000-000000000001',
        'ffffffff-0000-0000-0000-000000000001', 200);

select is(
  (select kcal_total from public.recipe_nutrition
    where recipe_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  200::numeric,
  'recipe_nutrition totals 200 kcal from 200 g of a 100 kcal/100 g food');

select is(
  (select kcal_per_serving from public.recipe_nutrition
    where recipe_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  100::numeric,
  'recipe_nutrition divides by servings correctly');

-- ---------------------------------------------------------------------------
-- 7. One active goal per user, and one weight entry per day.
-- ---------------------------------------------------------------------------

insert into public.goals (user_id, goal, activity, start_weight_kg, calorie_target,
                          protein_g, carbs_g, fat_g, computed_by)
values ('33333333-3333-3333-3333-333333333333', 'lose', 'moderate', 80, 2000,
        150, 200, 67, 'nutrition-engine-v1');

select throws_ok(
  $q$insert into public.goals (user_id, goal, activity, start_weight_kg, calorie_target,
                               protein_g, carbs_g, fat_g, computed_by)
     values ('33333333-3333-3333-3333-333333333333', 'gain', 'light', 80, 2500,
             150, 300, 80, 'nutrition-engine-v1')$q$,
  '23505',
  null,
  'a user cannot have two active goals');

insert into public.weight_logs (user_id, logged_on, weight_kg)
values ('33333333-3333-3333-3333-333333333333', '2026-08-30', 80);

select throws_ok(
  $q$insert into public.weight_logs (user_id, logged_on, weight_kg)
     values ('33333333-3333-3333-3333-333333333333', '2026-08-30', 81)$q$,
  '23505',
  null,
  'a user cannot log two weights for the same day');

-- ---------------------------------------------------------------------------
-- 8. One meal section per type per day. Two 'lunch' rows on one date is not a
--    state the diary can render - it would show one and hide the other's
--    items, which reads to the user as lost data.
-- ---------------------------------------------------------------------------

insert into public.meals (user_id, local_date, meal_type)
values ('33333333-3333-3333-3333-333333333333', '2026-09-01', 'lunch');

select throws_ok(
  $q$insert into public.meals (user_id, local_date, meal_type)
     values ('33333333-3333-3333-3333-333333333333', '2026-09-01', 'lunch')$q$,
  '23505',
  null,
  'a second lunch section on the same day is rejected');

select lives_ok(
  $q$insert into public.meals (user_id, local_date, meal_type)
     values ('33333333-3333-3333-3333-333333333333', '2026-09-01', 'dinner')$q$,
  'a different meal type on the same day is allowed');

select lives_ok(
  $q$insert into public.meals (user_id, local_date, meal_type)
     values ('33333333-3333-3333-3333-333333333333', '2026-09-02', 'lunch')$q$,
  'the same meal type on a different day is allowed');

-- ---------------------------------------------------------------------------
-- 9. Storage buckets holding personal data must be private.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from storage.buckets
    where id in ('food-photos', 'recipe-images') and public),
  0,
  'no bucket holding user photos is public');

select * from finish();
rollback;
