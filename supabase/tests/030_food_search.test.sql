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

-- ---------------------------------------------------------------------------
-- Prefix matching, and both languages
-- ---------------------------------------------------------------------------
-- The bug these exist for: search matched whole words only, so a user saw an
-- empty list until they happened to finish a word. 'chic' returned nothing
-- while 'chicken' returned ten, and 'ме' returned honey because two Cyrillic
-- letters against the alias 'мед' happened to clear the trigram threshold
-- while nothing else did.

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

select isnt_empty(
  $q$select id from public.search_foods('chic', 25)$q$,
  'a four-letter prefix finds chicken - people look at the list while typing');

select isnt_empty(
  $q$select id from public.search_foods('пил', 25)$q$,
  'a three-letter Cyrillic prefix finds the chicken rows through their aliases');

select isnt_empty(
  $q$select id from public.search_foods('мля', 25)$q$,
  'a partial Bulgarian word finds the milk rows');

select is(
  (select name from public.search_foods('мляко', 25) limit 1),
  'Milk, 3.6% fat',
  'an alias that IS the query outranks one that merely contains it');

select is(
  (select matched_alias from public.search_foods('мляко', 25) limit 1),
  'мляко',
  'the matching alias comes back, so the list can explain an English name');

select is(
  (select matched_alias from public.search_foods('chicken breast', 25) limit 1),
  'chicken breast',
  'an English alias matches too - both languages go through the same path');

select ok(
  (select count(*) from public.search_foods('yogurt', 25)) > 0,
  'the American spelling finds the yoghurt, which shares no lexeme with it');

-- Every food is reachable in Bulgarian. Written as a query over the catalogue
-- rather than a list of examples, so a food seeded later without a Bulgarian
-- name fails this rather than being found missing by a user.
select is_empty(
  $q$select f.name
       from public.foods f
       left join (select distinct food_id from public.food_aliases where locale = 'bg') bg
              on bg.food_id = f.id
      where f.is_public
        and f.archived_at is null
        and f.source = 'curated'
        and bg.food_id is null$q$,
  'every curated food carries at least one Bulgarian alias');

-- tsquery syntax typed into the box is data, not syntax. The prefix query is
-- built from quoted lexemes for exactly this reason; unquoted, this throws.
select lives_ok(
  $q$select id from public.search_foods('chicken & !(breast', 25)$q$,
  'tsquery operators in the search box do not reach to_tsquery as syntax');

select lives_ok(
  $q$select id from public.search_foods('   ', 25)$q$,
  'a blank query is not an error');

select is_empty(
  $q$select id from public.search_foods('   ', 25)$q$,
  'a blank query returns nothing rather than the whole catalogue');

-- ---------------------------------------------------------------------------
-- Localised names
-- ---------------------------------------------------------------------------
-- Aliases made a food findable in Bulgarian; translations make it readable.
-- The locale decides only what a row is CALLED - matching still runs against
-- every language, because a user whose phone is in Bulgarian may well type
-- "chicken", and refusing them for a settings value would be a worse search
-- for no benefit.

select is(
  (select name from public.search_foods('chicken breast', 1, 'bg')),
  'Пилешко филе, без кожа, готвено',
  'the name comes back in the requested locale');

select is(
  (select name from public.search_foods('chicken breast', 1, 'en')),
  'Chicken breast, skinless, cooked',
  'and in English when that is what was asked for');

select isnt_empty(
  $q$select id from public.search_foods('chicken', 25, 'bg')$q$,
  'an English query still works for a user reading Bulgarian');

select isnt_empty(
  $q$select id from public.search_foods('без кожа', 25, 'bg')$q$,
  'a translation is searchable too - "без кожа" appears in no alias');

select is(
  (select name from public.search_foods('chicken breast', 1, 'klingon')),
  'Chicken breast, skinless, cooked',
  'an unknown locale falls back to the catalogue name rather than erroring');

-- Written as a query over the catalogue rather than a list of examples, so a
-- food seeded later without a Bulgarian name fails here instead of turning up
-- in someone's diary in English.
select is_empty(
  $q$select f.name
       from public.foods f
      where f.is_public
        and f.archived_at is null
        and f.source = 'curated'
        and not exists (select 1 from public.food_translations t
                         where t.food_id = f.id and t.locale = 'bg')$q$,
  'every curated food has a Bulgarian display name');

-- Two minces that differ only by fat content must not read identically. This
-- is why translations are written by hand rather than derived from the
-- aliases, which drop qualifiers on purpose so they match what people type.
select is(
  (select count(distinct t.name)::int
     from public.food_translations t
     join public.foods f on f.id = t.food_id
    where t.locale = 'bg' and f.source = 'curated'),
  (select count(*)::int from public.foods where source = 'curated' and is_public),
  'no two curated foods share a Bulgarian name');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select is_empty(
  $q$select id from public.search_foods('chicken', 10)$q$,
  'anon searches nothing');

reset role;

select * from finish();
rollback;
