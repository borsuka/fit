-- ============================================================================
-- Plain-SQL mirror of the pgTAP suite, for the shim environment
-- ============================================================================
-- NOT the authority. `supabase test db` running 010_rls.test.sql and
-- 020_schema_invariants.test.sql against the real stack is.
--
-- This exists because pgtap is not present in a stock postgres image, and
-- verifying RLS behaviour today beats waiting for a dependency download. It
-- asserts the same properties using plain SQL so the migrations are exercised
-- rather than merely parsed.
-- ============================================================================

create schema if not exists _t;

create table if not exists _t.results (
  ord    serial primary key,
  label  text,
  status text,
  detail text
);
truncate _t.results restart identity;

grant usage on schema _t to anon, authenticated;
grant insert, select on _t.results to anon, authenticated;
grant usage, select on sequence _t.results_ord_seq to anon, authenticated;

-- Assert helpers. SECURITY INVOKER on purpose: a definer function would run the
-- dynamic SQL as the superuser and bypass the very RLS we are testing.

create or replace function _t.expect_count(p_sql text, p_expected bigint, p_label text)
returns void language plpgsql security invoker as $$
declare actual bigint;
begin
  execute p_sql into actual;
  if actual = p_expected then
    insert into _t.results (label, status, detail) values (p_label, 'PASS', null);
  else
    insert into _t.results (label, status, detail)
      values (p_label, 'FAIL', format('expected %s, got %s', p_expected, actual));
  end if;
exception when others then
  insert into _t.results (label, status, detail) values (p_label, 'FAIL', 'unexpected error: ' || sqlerrm);
end;
$$;

create or replace function _t.expect_denied(p_sql text, p_label text)
returns void language plpgsql security invoker as $$
begin
  execute p_sql;
  insert into _t.results (label, status, detail)
    values (p_label, 'FAIL', 'statement succeeded but should have been denied');
exception
  when insufficient_privilege then
    insert into _t.results (label, status, detail) values (p_label, 'PASS', 'denied (42501)');
  when check_violation then
    insert into _t.results (label, status, detail) values (p_label, 'PASS', 'denied (23514)');
  when unique_violation then
    insert into _t.results (label, status, detail) values (p_label, 'PASS', 'denied (23505)');
  when others then
    insert into _t.results (label, status, detail)
      values (p_label, 'FAIL', format('wrong error %s: %s', sqlstate, sqlerrm));
end;
$$;

create or replace function _t.expect_ok(p_sql text, p_label text)
returns void language plpgsql security invoker as $$
begin
  execute p_sql;
  insert into _t.results (label, status, detail) values (p_label, 'PASS', null);
exception when others then
  insert into _t.results (label, status, detail)
    values (p_label, 'FAIL', format('%s: %s', sqlstate, sqlerrm));
end;
$$;

create or replace function _t.expect_rowcount(p_sql text, p_expected int, p_label text)
returns void language plpgsql security invoker as $$
declare affected int;
begin
  execute p_sql;
  get diagnostics affected = row_count;
  if affected = p_expected then
    insert into _t.results (label, status, detail) values (p_label, 'PASS', null);
  else
    insert into _t.results (label, status, detail)
      values (p_label, 'FAIL', format('expected %s rows affected, got %s', p_expected, affected));
  end if;
exception when others then
  insert into _t.results (label, status, detail) values (p_label, 'FAIL', sqlstate || ': ' || sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures, created as superuser (RLS bypassed)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

insert into public.profiles (id, display_name, date_of_birth, sex, height_cm, timezone) values
  ('11111111-1111-1111-1111-111111111111', 'A', '1990-01-01', 'male',   180, 'Europe/Sofia'),
  ('22222222-2222-2222-2222-222222222222', 'B', '1992-02-02', 'female', 165, 'Europe/Sofia');

insert into public.foods (id, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g, is_public) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'usda', 'Public Rice', 130, 2.7, 28, 0.3, true);
insert into public.foods (id, source, name, kcal_100g, is_public, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'user', 'A private', 100, false, '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'user', 'B private', 100, false, '22222222-2222-2222-2222-222222222222');

insert into public.meals (id, user_id, local_date, meal_type) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-08-30', 'lunch'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '2026-08-30', 'lunch');

insert into public.meal_items (meal_id, user_id, source, food_id, quantity_g, kcal) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'search',
   'aaaaaaaa-0000-0000-0000-000000000001', 150, 195),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'search',
   'aaaaaaaa-0000-0000-0000-000000000001', 150, 195);

insert into public.weight_logs (user_id, logged_on, weight_kg) values
  ('11111111-1111-1111-1111-111111111111', '2026-08-30', 80),
  ('22222222-2222-2222-2222-222222222222', '2026-08-30', 90);

insert into public.ai_scans (id, user_id, image_path) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '111/s1.jpg'),
  ('cccccccc-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '222/s2.jpg');

insert into public.subscriptions (user_id, tier) values
  ('11111111-1111-1111-1111-111111111111', 'free');

-- ===========================================================================
-- Structural invariants (checked as superuser)
-- ===========================================================================

select _t.expect_count($$
  select count(*) from pg_tables t
   join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
  where t.schemaname = 'public' and not c.relrowsecurity
$$, 0, 'every table in public has RLS enabled');

select _t.expect_count($$
  select count(*) from pg_policies
   where schemaname = 'public' and cmd in ('UPDATE','ALL') and with_check is null
$$, 0, 'every UPDATE/ALL policy has WITH CHECK');

select _t.expect_count($$
  select count(*) from storage.buckets where id in ('food-photos','recipe-images') and public
$$, 0, 'no user-photo bucket is public');

-- Constraints
select _t.expect_denied($$
  insert into public.profiles (id, date_of_birth, sex, height_cm)
  values ('22222222-2222-2222-2222-222222222222'::uuid, current_date - interval '5 years', 'male', 120)
$$, 'a 5-year-old cannot create a profile');

select _t.expect_denied($$
  insert into public.foods (source, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
  values ('usda', 'impossible', 500, 60, 60, 60)
$$, 'macro mass over 100g per 100g rejected');

select _t.expect_denied($$
  insert into public.foods (source, name, kcal_100g) values ('usda', 'too hot', 1200)
$$, 'impossible energy density rejected');

select _t.expect_denied($$
  insert into public.foods (source, name, kcal_100g, barcode)
  values ('off', 'bad', 100, 'not-a-barcode')
$$, 'non-numeric barcode rejected');

select _t.expect_denied($$
  insert into public.meal_items (meal_id, user_id, source, quantity_g, kcal, food_id, recipe_id)
  values ('bbbbbbbb-0000-0000-0000-000000000001'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid, 'search', 100, 100,
          'aaaaaaaa-0000-0000-0000-000000000001'::uuid, gen_random_uuid())
$$, 'meal_item cannot reference both a food and a recipe');

select _t.expect_denied($$
  insert into public.weight_logs (user_id, logged_on, weight_kg)
  values ('11111111-1111-1111-1111-111111111111'::uuid, '2026-08-30', 81)
$$, 'one weight entry per day');

-- Derived recipe nutrition: 200 g of a 100 kcal/100 g food over 2 servings
insert into public.recipes (id, user_id, name, servings)
values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'R', 2);
insert into public.recipe_ingredients (recipe_id, food_id, quantity_g)
values ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 200);

select _t.expect_count($$
  select count(*) from public.recipe_nutrition
   where recipe_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and kcal_total = 200 and kcal_per_serving = 100
$$, 1, 'recipe_nutrition derives 200 kcal total / 100 per serving');

-- ===========================================================================
-- Acting as user A
-- ===========================================================================

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;

select _t.expect_count('select count(*) from public.profiles',    1, 'A sees only their own profile');
select _t.expect_count('select count(*) from public.meals',       1, 'A sees only their own meal');
select _t.expect_count('select count(*) from public.meal_items',  1, 'A sees only their own meal_items');
select _t.expect_count('select count(*) from public.weight_logs', 1, 'A sees only their own weight_logs');
select _t.expect_count('select count(*) from public.ai_scans',    1, 'A sees only their own ai_scans');
select _t.expect_count('select count(*) from public.foods',       2, 'A sees public foods plus their own private food');

select _t.expect_rowcount($$
  update public.meals set note = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000002'
$$, 0, 'A''s update of B''s meal affects zero rows');

select _t.expect_rowcount($$
  delete from public.meals where id = 'bbbbbbbb-0000-0000-0000-000000000002'
$$, 0, 'A''s delete of B''s meal affects zero rows');

select _t.expect_denied($$
  insert into public.meals (user_id, local_date, meal_type)
  values ('22222222-2222-2222-2222-222222222222'::uuid, '2026-08-30', 'dinner')
$$, 'A cannot insert a meal owned by B');

-- The one a review pass tends to miss.
select _t.expect_denied($$
  update public.meals set user_id = '22222222-2222-2222-2222-222222222222'::uuid
   where id = 'bbbbbbbb-0000-0000-0000-000000000001'
$$, 'A cannot reassign their own meal to B (WITH CHECK holds)');

select _t.expect_denied($$
  update public.weight_logs set user_id = '22222222-2222-2222-2222-222222222222'::uuid
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid
$$, 'A cannot reassign their own weight_log to B');

-- Note the asymmetry in Postgres RLS: with no policy for a command, INSERT
-- raises 42501 (its WITH CHECK cannot pass) while UPDATE and DELETE simply
-- match zero rows and report success. Asserting an exception here would be
-- asserting the wrong thing - and would pass for the wrong reason if someone
-- later added a permissive UPDATE policy that errored for an unrelated cause.
select _t.expect_rowcount($$
  update public.subscriptions set tier = 'premium'
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid
$$, 0, 'A''s attempt to grant themselves premium affects zero rows');

select _t.expect_count($$
  select count(*) from public.subscriptions
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid and tier = 'free'
$$, 1, 'A''s subscription tier is still free after the attempt');

select _t.expect_denied($$
  insert into public.subscriptions (user_id, tier)
  values ('11111111-1111-1111-1111-111111111111'::uuid, 'premium')
$$, 'A cannot insert a subscription row');

select _t.expect_denied($$
  insert into public.ai_scan_items (scan_id, user_id, label, normalized_query, estimated_grams, confidence)
  values ('cccccccc-0000-0000-0000-000000000001'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid, 'fake', 'fake', 100, 1)
$$, 'A cannot forge ai_scan_items');

select _t.expect_denied($$
  insert into public.foods (source, name, kcal_100g, is_public, created_by)
  values ('user', 'self promoted', 100, true, '11111111-1111-1111-1111-111111111111'::uuid)
$$, 'A cannot publish a food to every other user');

select _t.expect_denied($$
  insert into public.meal_items (meal_id, user_id, source, quantity_g, kcal, custom_name)
  values ('bbbbbbbb-0000-0000-0000-000000000002'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid, 'manual', 100, 100, 'x')
$$, 'A cannot attach a meal_item to B''s meal');

select _t.expect_ok($$
  insert into public.meals (user_id, local_date, meal_type)
  values ('11111111-1111-1111-1111-111111111111'::uuid, '2026-08-31', 'breakfast')
$$, 'A can create their own meal');

-- Storage isolation
select _t.expect_denied($$
  insert into storage.objects (bucket_id, name)
  values ('food-photos', '22222222-2222-2222-2222-222222222222/stolen.jpg')
$$, 'A cannot write into B''s photo folder');

select _t.expect_ok($$
  insert into storage.objects (bucket_id, name)
  values ('food-photos', '11111111-1111-1111-1111-111111111111/mine.jpg')
$$, 'A can write into their own photo folder');

-- ===========================================================================
-- Anonymous
-- ===========================================================================

reset role;
select set_config('request.jwt.claims', '', false);
set role anon;

select _t.expect_count('select count(*) from public.profiles',    0, 'anon reads no profiles');
select _t.expect_count('select count(*) from public.meals',       0, 'anon reads no meals');
select _t.expect_count('select count(*) from public.meal_items',  0, 'anon reads no meal_items');
select _t.expect_count('select count(*) from public.weight_logs', 0, 'anon reads no weight_logs');
select _t.expect_count('select count(*) from public.ai_scans',    0, 'anon reads no ai_scans');
select _t.expect_count('select count(*) from public.foods',       0, 'anon reads no foods');

reset role;

-- ===========================================================================
-- Report
-- ===========================================================================

\echo ''
\echo '================ RESULTS ================'
select lpad(ord::text, 3) || '  ' || rpad(status, 5) || '  ' || label ||
       coalesce('  -- ' || detail, '') as result
from _t.results order by ord;

\echo ''
select status, count(*) from _t.results group by status order by status;

-- Non-zero exit when anything failed, so a CI step or a shell `&&` notices.
-- Deliberately not `case ... then 1/0`: Postgres constant-folds the division
-- during planning and raises even when the branch is never taken.
do $$
declare failed int;
begin
  select count(*) into failed from _t.results where status = 'FAIL';
  if failed > 0 then
    raise exception '% check(s) failed', failed;
  end if;
  raise notice 'all checks passed';
end
$$;
