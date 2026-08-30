-- ============================================================================
-- AI pipeline: quota and matching
-- ============================================================================
-- The quota is the only thing between an authenticated account and an
-- unbounded vendor bill, and matching is what decides which food a photo turns
-- into. Both are asserted here rather than trusted.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set scan_a 'cccccccc-0000-4000-8000-000000000001'
\set scan_b 'cccccccc-0000-4000-8000-000000000002'

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

insert into public.ai_scans (id, user_id, image_path)
values (:'scan_a'::uuid, :'user_a'::uuid, '111/a.jpg'),
       (:'scan_b'::uuid, :'user_b'::uuid, '222/b.jpg');

insert into public.ai_scan_items
  (scan_id, user_id, label, normalized_query, estimated_grams, confidence, sort_order)
values
  (:'scan_a'::uuid, :'user_a'::uuid, 'Grilled chicken breast', 'chicken breast', 150, 0.91, 0),
  (:'scan_a'::uuid, :'user_a'::uuid, 'White rice',             'white rice',     180, 0.84, 1),
  (:'scan_a'::uuid, :'user_a'::uuid, 'Mystery sauce',   'zzz unmatchable sauce',  30, 0.41, 2),
  (:'scan_b'::uuid, :'user_b'::uuid, 'Banana',                'banana',          118, 0.95, 0);

-- ===========================================================================
-- Quota
-- ===========================================================================

select is(public.consume_ai_quota(:'user_a'::uuid, 'scan', 3), true, 'first scan allowed');
select is(public.consume_ai_quota(:'user_a'::uuid, 'scan', 3), true, 'second scan allowed');
select is(public.consume_ai_quota(:'user_a'::uuid, 'scan', 3), true, 'third scan allowed');
select is(public.consume_ai_quota(:'user_a'::uuid, 'scan', 3), false, 'fourth scan refused');

select is(
  (select count from public.ai_usage
    where user_id = :'user_a'::uuid and feature = 'scan' and usage_date = current_date),
  3,
  'the ledger stopped at the limit and did not keep counting');

select is(
  public.consume_ai_quota(:'user_b'::uuid, 'scan', 3), true,
  'a different user has their own allowance');

select is(
  public.consume_ai_quota(:'user_a'::uuid, 'meal_plan', 1), true,
  'a different feature has its own allowance');

select is(
  public.consume_ai_quota(:'user_a'::uuid, 'scan', 3, current_date + 1), true,
  'tomorrow starts fresh');

select is(public.consume_ai_quota(:'user_a'::uuid, 'scan', 0), false,
  'a zero limit refuses rather than dividing by nothing');

-- The metered account must not be able to write its own ledger.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

select throws_ok(
  format('select public.consume_ai_quota(%L, %L, 999)', :'user_a', 'scan'),
  '42501',
  null,
  'an authenticated user cannot call consume_ai_quota');

-- Not a throws_ok: ai_usage has only a SELECT policy, and Postgres RLS is
-- asymmetric here - an UPDATE with no matching policy affects zero rows and
-- reports success rather than raising. So assert the row count AND the stored
-- value, because "nothing was updated" and "the number is unchanged" are
-- different claims.
with attempted as (
  update public.ai_usage set count = 0 where user_id = :'user_a'::uuid returning 1
)
select is((select count(*) from attempted)::int, 0,
  'an authenticated user resetting their own usage affects zero rows');

select is(
  (select count from public.ai_usage
    where user_id = :'user_a'::uuid and feature = 'scan' and usage_date = current_date),
  3,
  'and the ledger still reads 3');

-- ===========================================================================
-- Matching
-- ===========================================================================

select is(
  (select count(*)::int from public.match_scan_items(:'scan_a'::uuid)),
  2,
  'two of three items matched; the noise item did not');

select is(
  (select f.name from public.ai_scan_items i
     join public.foods f on f.id = i.matched_food_id
    where i.scan_id = :'scan_a'::uuid and i.sort_order = 0),
  'Chicken breast, skinless, cooked',
  '"chicken breast" resolves to the USDA-style name');

select is(
  (select f.name from public.ai_scan_items i
     join public.foods f on f.id = i.matched_food_id
    where i.scan_id = :'scan_a'::uuid and i.sort_order = 1),
  'White rice, cooked',
  '"white rice" resolves correctly');

select is(
  (select matched_food_id from public.ai_scan_items
    where scan_id = :'scan_a'::uuid and sort_order = 2),
  null,
  'an unmatchable item is left null - the user is asked, not guessed at');

select ok(
  (select bool_and(match_score between 0 and 1) from public.ai_scan_items
    where scan_id = :'scan_a'::uuid and match_score is not null),
  'every recorded score is inside the column contract');

-- A cannot match B's scan: the function is SECURITY INVOKER, so RLS on
-- ai_scan_items decides what it can see. Without that it would be an oracle
-- for any scan id.
select is(
  (select count(*)::int from public.match_scan_items(:'scan_b'::uuid)),
  0,
  'A matching B''s scan touches nothing');

select is(
  (select matched_food_id from public.ai_scan_items where scan_id = :'scan_b'::uuid),
  null,
  'and B''s item is left untouched');

-- ===========================================================================
-- Scan items are written by the pipeline, never posted by a client
-- ===========================================================================

select throws_ok(
  format($q$insert into public.ai_scan_items
           (scan_id, user_id, label, normalized_query, estimated_grams, confidence)
           values (%L, %L, 'forged', 'forged', 100, 1)$q$, :'scan_a', :'user_a'),
  '42501',
  null,
  'a client cannot forge a scan item, even on their own scan');

reset role;

select * from finish();
rollback;
