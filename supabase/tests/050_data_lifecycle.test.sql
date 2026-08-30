-- ============================================================================
-- Data lifecycle: export payload, photo retention, erasure cascade
-- ============================================================================
-- These back the two rights that are not optional. An export that silently
-- omits a table, or a deletion that leaves rows behind, is a compliance failure
-- that looks exactly like success from the outside.
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

insert into public.profiles (id, display_name, date_of_birth, sex, height_cm)
values (:'user_a'::uuid, 'A', '1990-01-01', 'male', 180),
       (:'user_b'::uuid, 'B', '1990-01-01', 'female', 165);

insert into public.goals (user_id, goal, activity, start_weight_kg, calorie_target,
                          protein_g, carbs_g, fat_g, computed_by)
values (:'user_a'::uuid, 'lose', 'moderate', 80, 2200, 160, 205, 66, 'nutrition-engine-v1');

insert into public.meals (id, user_id, local_date, meal_type)
values ('bbbbbbbb-0000-4000-8000-000000000001', :'user_a'::uuid, '2026-09-01', 'lunch');

insert into public.meal_items (meal_id, user_id, source, quantity_g, kcal, custom_name)
values ('bbbbbbbb-0000-4000-8000-000000000001', :'user_a'::uuid, 'manual', 150, 320, 'Banitsa');

insert into public.weight_logs (user_id, logged_on, weight_kg)
values (:'user_a'::uuid, '2026-09-01', 80.4);

insert into public.workout_sessions (id, user_id, name)
values ('99999999-0000-4000-8000-000000000001', :'user_a'::uuid, 'Upper body');

insert into public.session_exercises (id, session_id, user_id, exercise_id, sort_order)
select '99999999-0000-4000-8000-000000000002', '99999999-0000-4000-8000-000000000001',
       :'user_a'::uuid, e.id, 0
from public.exercises e where e.slug = 'barbell-bench-press';

insert into public.workout_sets (session_exercise_id, user_id, set_number, reps, weight_kg)
values ('99999999-0000-4000-8000-000000000002', :'user_a'::uuid, 1, 8, 60);

insert into public.ai_scans (id, user_id, image_path, expires_at)
values ('cccccccc-0000-4000-8000-000000000001', :'user_a'::uuid, '111/old.jpg', now() - interval '1 day'),
       ('cccccccc-0000-4000-8000-000000000002', :'user_a'::uuid, '111/new.jpg', now() + interval '80 days');

insert into public.ai_scan_items (scan_id, user_id, label, normalized_query,
                                  estimated_grams, confidence, user_grams, sort_order)
values ('cccccccc-0000-4000-8000-000000000001', :'user_a'::uuid,
        'White rice', 'white rice', 180, 0.84, 150, 0);

-- ===========================================================================
-- Export completeness
-- ===========================================================================

select ok(
  public.export_user_data(:'user_a'::uuid) ? 'profile',
  'the export includes the profile');

select is(
  jsonb_array_length(public.export_user_data(:'user_a'::uuid) -> 'goals'), 1,
  'the export includes goals');

select is(
  jsonb_array_length(public.export_user_data(:'user_a'::uuid) -> 'weight_logs'), 1,
  'the export includes weight history');

select is(
  public.export_user_data(:'user_a'::uuid) #>> '{meals,0,items,0,custom_name}',
  'Banitsa',
  'meal items are nested under their meal, not dropped');

select is(
  public.export_user_data(:'user_a'::uuid) #>> '{workout_sessions,0,exercises,0,sets,0,reps}',
  '8',
  'workout sets survive two levels of nesting');

-- The model's estimate AND the correction. Withholding the correction would
-- make the export incomplete - it is the user's data too.
--
-- Searched rather than indexed: this user has two scans and only one has items,
-- so asserting on ai_scans[0] would pass or fail on row ordering rather than on
-- what the export contains.
select is(
  (select count(*)::int
     from jsonb_array_elements(public.export_user_data(:'user_a'::uuid) -> 'ai_scans') scan,
          jsonb_array_elements(scan -> 'items') item
    where item ->> 'estimated_grams' = '180.00'
      and item ->> 'user_grams' = '150.00'),
  1,
  'the export carries the model estimate beside the user correction');

select is(
  (select count(*)::int
     from jsonb_array_elements(public.export_user_data(:'user_a'::uuid) -> 'ai_scans')),
  2,
  'both scans are exported, including the one with no items');

select is(
  jsonb_array_length(public.export_user_data(:'user_b'::uuid) -> 'goals'), 0,
  'one user''s export contains nothing of another''s');

-- A user with nothing logged must still get a valid document rather than nulls
-- the importer on the other end cannot read.
select ok(
  public.export_user_data(:'user_b'::uuid) -> 'meals' = '[]'::jsonb,
  'empty collections are empty arrays, not null');

-- ===========================================================================
-- Only the worker may run these
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

select throws_ok(
  format('select public.export_user_data(%L)', :'user_b'),
  '42501',
  null,
  'an authenticated user cannot export another account');

select throws_ok(
  format('select public.export_user_data(%L)', :'user_a'),
  '42501',
  null,
  'nor their own - the export path is the worker, not the client');

select throws_ok(
  'select public.expired_photo_paths(10)',
  '42501',
  null,
  'an authenticated user cannot enumerate expiring photo paths');

select is_empty(
  'select id from public.deletion_audit',
  'the erasure audit is unreadable to a client');

reset role;

-- ===========================================================================
-- Photo retention
-- ===========================================================================

select is(
  (select count(*)::int from public.expired_photo_paths(500)),
  1,
  'only the scan past its expiry is listed');

select is(
  (select image_path from public.expired_photo_paths(500)),
  '111/old.jpg',
  'and it is the right one');

update public.ai_scans set photo_deleted_at = now()
 where id = 'cccccccc-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.expired_photo_paths(500)),
  0,
  'an already-cleaned scan is not offered again');

-- The record outlives the photo: the items and the corrections are what has
-- lasting value, the JPEG is not.
select is(
  (select count(*)::int from public.ai_scan_items
    where scan_id = 'cccccccc-0000-4000-8000-000000000001'),
  1,
  'removing the photo does not remove the scan record');

-- ===========================================================================
-- Erasure cascade
-- ===========================================================================

select is(
  (select count(*)::int from public.meal_items where user_id = :'user_a'::uuid),
  1,
  'A has data before deletion');

delete from auth.users where id = :'user_a'::uuid;

select is((select count(*)::int from public.profiles where id = :'user_a'::uuid), 0,
  'deleting the auth user removes the profile');

-- Every one of these is a separate cascade path. A table added later without
-- ON DELETE CASCADE would leave orphaned personal data behind an erasure that
-- reported success.
select is((select count(*)::int from public.goals where user_id = :'user_a'::uuid), 0,
  'goals are gone');
select is((select count(*)::int from public.meals where user_id = :'user_a'::uuid), 0,
  'meals are gone');
select is((select count(*)::int from public.meal_items where user_id = :'user_a'::uuid), 0,
  'meal items are gone');
select is((select count(*)::int from public.weight_logs where user_id = :'user_a'::uuid), 0,
  'weight history is gone');
select is((select count(*)::int from public.workout_sessions where user_id = :'user_a'::uuid), 0,
  'workout sessions are gone');
select is((select count(*)::int from public.workout_sets where user_id = :'user_a'::uuid), 0,
  'workout sets are gone');
select is((select count(*)::int from public.ai_scans where user_id = :'user_a'::uuid), 0,
  'ai scans are gone');
select is((select count(*)::int from public.ai_scan_items where user_id = :'user_a'::uuid), 0,
  'ai scan items are gone');

select is((select count(*)::int from public.profiles where id = :'user_b'::uuid), 1,
  'and user B is untouched');

select * from finish();
rollback;
