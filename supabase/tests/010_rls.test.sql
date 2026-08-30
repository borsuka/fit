-- ============================================================================
-- RLS isolation tests
-- ============================================================================
-- Untested RLS is an assumption, and assumptions about authorisation turn into
-- breach notifications. Run with: npm run db:test
--
-- Every user-owned table is checked in BOTH directions:
--   1. user A reads only their own rows
--   2. user A cannot update or delete user B's rows
--   3. user A cannot insert a row owned by B
--   4. user A cannot reassign their own row's user_id to B   <-- the subtle one
--   5. anon reads nothing
--   6. no client role can write subscriptions
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function tests_make_user(p_id uuid, p_email text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  );

  insert into public.profiles (id, display_name, date_of_birth, sex, height_cm, timezone)
  values (p_id, p_email, '1990-01-01', 'male', 180, 'Europe/Sofia');
end;
$$;

create or replace function tests_login_as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests_logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (created as the migration/superuser role, RLS bypassed)
-- ---------------------------------------------------------------------------

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

select tests_make_user(:'user_a'::uuid, 'a@example.test');
select tests_make_user(:'user_b'::uuid, 'b@example.test');

insert into public.foods (id, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g, is_public)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'usda', 'Public Rice', 130, 2.7, 28, 0.3, true);

insert into public.foods (id, source, name, kcal_100g, is_public, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'user', 'A private food', 100, false, :'user_a'::uuid);

insert into public.foods (id, source, name, kcal_100g, is_public, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'user', 'B private food', 100, false, :'user_b'::uuid);

insert into public.meals (id, user_id, local_date, meal_type)
values ('bbbbbbbb-0000-0000-0000-000000000001', :'user_a'::uuid, '2026-08-30', 'lunch'),
       ('bbbbbbbb-0000-0000-0000-000000000002', :'user_b'::uuid, '2026-08-30', 'lunch');

insert into public.meal_items (meal_id, user_id, source, food_id, quantity_g, kcal)
values ('bbbbbbbb-0000-0000-0000-000000000001', :'user_a'::uuid, 'search',
        'aaaaaaaa-0000-0000-0000-000000000001', 150, 195),
       ('bbbbbbbb-0000-0000-0000-000000000002', :'user_b'::uuid, 'search',
        'aaaaaaaa-0000-0000-0000-000000000001', 150, 195);

insert into public.weight_logs (user_id, logged_on, weight_kg)
values (:'user_a'::uuid, '2026-08-30', 80), (:'user_b'::uuid, '2026-08-30', 90);

insert into public.ai_scans (id, user_id, image_path)
values ('cccccccc-0000-0000-0000-000000000001', :'user_a'::uuid, '11111111-1111-1111-1111-111111111111/s1.jpg'),
       ('cccccccc-0000-0000-0000-000000000002', :'user_b'::uuid, '22222222-2222-2222-2222-222222222222/s2.jpg');

insert into public.subscriptions (user_id, tier) values (:'user_a'::uuid, 'free');

-- ===========================================================================
-- Acting as user A
-- ===========================================================================

select tests_login_as(:'user_a'::uuid);

select is((select count(*) from public.profiles)::int, 1,
  'A sees exactly one profile row (their own)');

select is((select count(*) from public.profiles where id = :'user_b'::uuid)::int, 0,
  'A cannot read B''s profile');

select is((select count(*) from public.meals)::int, 1,
  'A sees only their own meal');

select is((select count(*) from public.meal_items)::int, 1,
  'A sees only their own meal_items');

select is((select count(*) from public.weight_logs)::int, 1,
  'A sees only their own weight_logs');

select is((select count(*) from public.ai_scans)::int, 1,
  'A sees only their own ai_scans');

select is((select count(*) from public.foods)::int, 2,
  'A sees public foods plus their own private food, not B''s');

select is((select count(*) from public.foods where created_by = :'user_b'::uuid)::int, 0,
  'A cannot read B''s private food');

-- --- writes against B's data -----------------------------------------------

-- A data-modifying statement cannot sit in a sub-SELECT; Postgres only allows
-- it in a CTE. Written the other way this is a syntax error, not a failing
-- assertion, which is a far quieter way for a security test to stop running.
with attempted as (
  update public.meals set note = 'hacked'
  where id = 'bbbbbbbb-0000-0000-0000-000000000002'
  returning 1
)
select is((select count(*) from attempted)::int, 0,
  'A''s update of B''s meal affects zero rows');

with attempted as (
  delete from public.meals
  where id = 'bbbbbbbb-0000-0000-0000-000000000002'
  returning 1
)
select is((select count(*) from attempted)::int, 0,
  'A''s delete of B''s meal affects zero rows');

select throws_ok(
  format('insert into public.meals (user_id, local_date, meal_type) values (%L, %L, %L)',
         :'user_b', '2026-08-30', 'dinner'),
  '42501',
  null,
  'A cannot insert a meal owned by B');

-- The subtle one: without WITH CHECK on the UPDATE policy, this succeeds and
-- silently hands A's row to B.
select throws_ok(
  format('update public.meals set user_id = %L where id = %L',
         :'user_b', 'bbbbbbbb-0000-0000-0000-000000000001'),
  '42501',
  null,
  'A cannot reassign their own meal to B (WITH CHECK holds)');

select throws_ok(
  format('update public.weight_logs set user_id = %L where user_id = %L',
         :'user_b', :'user_a'),
  '42501',
  null,
  'A cannot reassign their own weight_log to B');

-- --- privilege escalation --------------------------------------------------

-- Postgres RLS is asymmetric here: with no policy for a command, INSERT raises
-- 42501 (its WITH CHECK cannot pass) while UPDATE and DELETE match zero rows
-- and report success. So this is a row-count assertion, not a throws_ok - and
-- we confirm the stored value too, because "zero rows affected" and "the value
-- did not change" are different claims.
with attempted as (
  update public.subscriptions set tier = 'premium'
  where user_id = :'user_a'::uuid
  returning 1
)
select is((select count(*) from attempted)::int, 0,
  'A''s attempt to grant themselves premium affects zero rows');

select is(
  (select tier::text from public.subscriptions where user_id = :'user_a'::uuid),
  'free',
  'A''s subscription tier is unchanged after the attempt');

select throws_ok(
  format('insert into public.subscriptions (user_id, tier) values (%L, %L)', :'user_a', 'premium'),
  '42501',
  null,
  'A cannot insert a subscription row at all');

select throws_ok(
  format($q$insert into public.ai_scan_items
           (scan_id, user_id, label, normalized_query, estimated_grams, confidence)
           values (%L, %L, 'fake', 'fake', 100, 1)$q$,
         'cccccccc-0000-0000-0000-000000000001', :'user_a'),
  '42501',
  null,
  'A cannot forge ai_scan_items (edge function writes them)');

select throws_ok(
  format($q$insert into public.foods (source, name, kcal_100g, is_public, created_by)
            values ('user', 'self promoted', 100, true, %L)$q$, :'user_a'),
  '42501',
  null,
  'A cannot publish a food to every other user');

-- --- cross-user child insert ----------------------------------------------

select throws_ok(
  format($q$insert into public.meal_items (meal_id, user_id, source, quantity_g, kcal, custom_name)
            values (%L, %L, 'manual', 100, 100, 'x')$q$,
         'bbbbbbbb-0000-0000-0000-000000000002', :'user_a'),
  '42501',
  null,
  'A cannot attach a meal_item to B''s meal');

-- --- set_active_goal RPC ----------------------------------------------------
-- SECURITY INVOKER, so RLS must still decide whose goal gets written. It reads
-- the user id from auth.uid() rather than an argument, so there is no
-- parameter through which one user could target another's row.

select lives_ok(
  $q$select public.set_active_goal('lose','moderate',80,2200,160,205,66,'nutrition-engine-v1')$q$,
  'A can set their own goal through the RPC');

select is((select count(*) from public.goals where is_active)::int, 1,
  'A has exactly one active goal');

-- Must replace, not collide with the partial unique index.
select lives_ok(
  $q$select public.set_active_goal('maintain','light',80,2759,128,300,82,'nutrition-engine-v1')$q$,
  'A can replace their goal');

select is((select count(*) from public.goals where is_active)::int, 1,
  'replacing a goal leaves exactly one active');

select is(
  (select goal::text from public.goals where is_active),
  'maintain',
  'the surviving active goal is the new one');

select is((select count(*) from public.goals)::int, 2,
  'the previous goal is kept, deactivated - history stays interpretable');

-- --- storage isolation ------------------------------------------------------
-- Photos are personal data; the policy keys off the first path segment.

select throws_ok(
  format($q$insert into storage.objects (bucket_id, name) values ('food-photos', %L)$q$,
         :'user_b' || '/stolen.jpg'),
  '42501',
  null,
  'A cannot write into B''s photo folder');

select lives_ok(
  format($q$insert into storage.objects (bucket_id, name) values ('food-photos', %L)$q$,
         :'user_a' || '/mine.jpg'),
  'A can write into their own photo folder');

-- ===========================================================================
-- Acting as user B
-- ===========================================================================

select tests_login_as(:'user_b'::uuid);

select is((select count(*) from public.meals)::int, 1,
  'B sees only their own meal');

select is((select count(*) from public.meals where user_id = :'user_a'::uuid)::int, 0,
  'B cannot read A''s meal');

select is((select count(*) from public.subscriptions)::int, 0,
  'B sees no subscription row (they have none)');

select is((select count(*) from public.goals)::int, 0,
  'B cannot see A''s goals at all');

select lives_ok(
  $q$select public.set_active_goal('gain','very',90,3000,160,350,90,'nutrition-engine-v1')$q$,
  'B can set their own goal');

select is((select count(*) from public.goals where is_active)::int, 1,
  'B''s active goal does not collide with A''s');

-- ===========================================================================
-- Anonymous
-- ===========================================================================

select tests_logout();

select is((select count(*) from public.profiles)::int,    0, 'anon reads no profiles');
select is((select count(*) from public.meals)::int,        0, 'anon reads no meals');
select is((select count(*) from public.meal_items)::int,   0, 'anon reads no meal_items');
select is((select count(*) from public.weight_logs)::int,  0, 'anon reads no weight_logs');
select is((select count(*) from public.ai_scans)::int,     0, 'anon reads no ai_scans');
select is((select count(*) from public.foods)::int,        0, 'anon reads no foods');
select is((select count(*) from public.goals)::int,        0, 'anon reads no goals');

select * from finish();
rollback;
