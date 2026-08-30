-- ============================================================================
-- Food search
-- ============================================================================
-- search_foods is SECURITY INVOKER with no visibility predicate of its own -
-- it relies entirely on the RLS policy for `foods`. That is the right design
-- (one source of truth for who sees what) but it means the isolation has to be
-- proven here, or a future edit to the function could quietly widen it.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  (:'user_a'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'a@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  (:'user_b'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'b@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, date_of_birth, sex, height_cm)
values (:'user_a'::uuid, '1990-01-01', 'male', 180),
       (:'user_b'::uuid, '1990-01-01', 'female', 165);

-- A private food for each user, both named so they would match the same query.
insert into public.foods (id, source, name, kcal_100g, is_public, created_by)
values ('a1111111-0000-4000-8000-000000000001', 'user', 'Zzyzx protein shake A',
        120, false, :'user_a'::uuid),
       ('a1111111-0000-4000-8000-000000000002', 'user', 'Zzyzx protein shake B',
        120, false, :'user_b'::uuid);

-- An archived public food, to prove soft deletes stay out of results.
insert into public.foods (id, source, name, kcal_100g, is_public, archived_at)
values ('a1111111-0000-4000-8000-000000000003', 'curated', 'Zzyzx discontinued bar',
        200, true, now());

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

-- --- relevance ---------------------------------------------------------------

select isnt_empty(
  $q$select id from public.search_foods('chicken', 10)$q$,
  'full-text finds a food by an exact word');

select isnt_empty(
  $q$select id from public.search_foods('chiken brest', 10)$q$,
  'trigram similarity survives a typo');

select isnt_empty(
  $q$select id from public.search_foods('пилешко', 10)$q$,
  'a Bulgarian alias resolves to the English-named food');

select is(
  (select name from public.search_foods('пилешко', 1)),
  'Chicken breast, skinless, cooked',
  'the alias match returns the right row, not merely a row');

select is_empty(
  $q$select id from public.search_foods('qqqqzzzz', 10)$q$,
  'a nonsense query returns nothing rather than everything');

select is_empty(
  $q$select id from public.search_foods('   ', 10)$q$,
  'a blank query returns nothing rather than the whole table');

select is_empty(
  $q$select id from public.search_foods(null, 10)$q$,
  'a null query is handled, not an error');

-- --- limits ------------------------------------------------------------------

-- 'cooked' appears in many seeded names, so there is genuinely more to return
-- than the limit allows. A term that matches one row would pass this assertion
-- for the wrong reason.
select ok(
  (select count(*) from public.search_foods('cooked', 100)) > 3,
  'the corpus has more matches than the limit under test');

select is(
  (select count(*)::int from public.search_foods('cooked', 3)),
  3,
  'the limit is respected');

select ok(
  (select count(*) from public.search_foods('cooked', 9999)) <= 50,
  'an absurd limit is capped rather than passed through to the planner');

select is(
  (select count(*)::int from public.search_foods('cooked', 0)),
  1,
  'a zero limit is raised to one rather than returning nothing');

-- --- isolation ---------------------------------------------------------------

select is(
  (select count(*)::int from public.search_foods('Zzyzx', 10)),
  1,
  'A sees exactly one Zzyzx food: their own private one');

select is(
  (select name from public.search_foods('Zzyzx', 10)),
  'Zzyzx protein shake A',
  'and it is A''s, not B''s');

select is_empty(
  $q$select id from public.search_foods('discontinued', 10)$q$,
  'an archived food is excluded - a soft delete must actually hide it');

-- Same query, other user. If the function ever grows its own visibility
-- predicate that disagrees with the policy, this is what catches it.
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);

select is(
  (select name from public.search_foods('Zzyzx', 10)),
  'Zzyzx protein shake B',
  'B sees their own private food and not A''s');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select is_empty(
  $q$select id from public.search_foods('chicken', 10)$q$,
  'anon searches nothing');

reset role;

select * from finish();
rollback;
