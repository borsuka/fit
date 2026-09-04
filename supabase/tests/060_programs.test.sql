-- ============================================================================
-- Training programmes: adoption, substitution and isolation
-- ============================================================================
-- Three things have to hold, and only the first is obvious:
--
--   1. adopt_program_day produces a template owned by the CALLER, whatever
--      arguments they pass. It is SECURITY INVOKER and inserts with auth.uid(),
--      so this is really a test that nobody later changes it to definer.
--
--   2. A user cannot edit another user's adopted template. The dangerous case
--      is the UPDATE: with no matching policy row Postgres affects zero rows
--      and reports success, so a swap on someone else's plan would LOOK like
--      it worked. The service checks the row count for exactly this reason;
--      here we prove the database is what makes that check necessary.
--
--   3. suggest_alternatives returns related work or nothing. An unrelated
--      exercise offered as a substitute is worse than an empty list.
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
   'authenticated', 'prog-a@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  (:'user_b'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'prog-b@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, date_of_birth, sex, height_cm)
values (:'user_a'::uuid, '1990-01-01', 'male', 180),
       (:'user_b'::uuid, '1990-01-01', 'female', 165);

-- ---------------------------------------------------------------------------
-- The seeded catalogue
-- ---------------------------------------------------------------------------

select ok(
  (select count(*) from public.programs) >= 10,
  'the catalogue carries at least ten programmes');

select is_empty(
  $q$select p.slug from public.programs p
      where not exists (select 1 from public.program_days d where d.program_id = p.id)$q$,
  'every programme has at least one day');

select is_empty(
  $q$select d.id::text from public.program_days d
      where not exists (select 1 from public.program_exercises pe
                         where pe.program_day_id = d.id)$q$,
  'every programme day has at least one exercise');

-- ---------------------------------------------------------------------------
-- Adoption
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

select lives_ok(
  $q$select public.adopt_program_day(
        (select id from public.programs where slug = 'stronglifts-5x5'), 0::smallint)$q$,
  'a user can adopt a programme day');

select is(
  (select count(*)::int from public.workouts w where w.user_id = :'user_a'::uuid),
  1,
  'adoption created exactly one template for the caller');

select is(
  (select count(*)::int
     from public.workout_exercises we
     join public.workouts w on w.id = we.workout_id
    where w.user_id = :'user_a'::uuid),
  3,
  'the template carries all three lifts from StrongLifts workout A');

select is(
  (select w.source_program_id from public.workouts w where w.user_id = :'user_a'::uuid),
  (select id from public.programs where slug = 'stronglifts-5x5'),
  'the template records which programme it came from');

select throws_ok(
  $q$select public.adopt_program_day(
        (select id from public.programs where slug = 'stronglifts-5x5'), 99::smallint)$q$,
  'P0002',
  'program day not found',
  'a day index that does not exist is a named error, not an empty template');

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);

select is_empty(
  $q$select id::text from public.workouts$q$,
  'B cannot see A''s adopted template');

-- The silent case. B aims an UPDATE at A's row by id; RLS filters it out, so
-- Postgres reports success having changed nothing. A client that trusts the
-- absence of an error would tell B their swap worked.
with target as (
  select we.id
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
   where w.user_id = :'user_a'::uuid
   limit 1
),
attempt as (
  update public.workout_exercises
     set exercise_id = (select id from public.exercises where slug = 'leg-press')
   where id = (select id from target)
  returning 1
)
select is(
  (select count(*)::int from attempt),
  0,
  'B''s swap on A''s template changes zero rows - which is why the service checks the count');

-- Checked as A, because B cannot see the row either way: asking B whether the
-- squat survived would pass for the wrong reason.
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int
     from public.workout_exercises we
     join public.workouts w on w.id = we.workout_id
     join public.exercises e on e.id = we.exercise_id
    where w.user_id = :'user_a'::uuid and e.slug = 'back-squat'),
  1,
  'A''s squat is still a squat afterwards');

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);

-- B adopting the same programme gets their own copy, not a share of A's.
select lives_ok(
  $q$select public.adopt_program_day(
        (select id from public.programs where slug = 'stronglifts-5x5'), 0::smallint)$q$,
  'B can adopt the same programme day');

select is(
  (select count(*)::int from public.workouts),
  1,
  'B sees one template - their own copy, not A''s');

-- ---------------------------------------------------------------------------
-- Starting a session from a template
-- ---------------------------------------------------------------------------

select lives_ok(
  $q$select public.start_session_from_workout(
        (select id from public.workouts limit 1))$q$,
  'B can start a session from their own template');

select is(
  (select count(*)::int from public.session_exercises),
  3,
  'the session was created with the template''s exercises already in it');

-- ---------------------------------------------------------------------------
-- Substitution
-- ---------------------------------------------------------------------------

select is_empty(
  $q$select a.name
       from public.suggest_alternatives(
              (select id from public.exercises where slug = 'back-squat'), 20) a
      where a.primary_muscle not in ('quads', 'glutes', 'hamstrings', 'core', 'back')$q$,
  'a squat substitution never suggests an upper-body exercise');

select is_empty(
  $q$select a.id::text
       from public.suggest_alternatives(
              (select id from public.exercises where slug = 'back-squat'), 20) a
      where a.id = (select id from public.exercises where slug = 'back-squat')$q$,
  'an exercise is never offered as a substitute for itself');

-- Asserted as a PROPERTY, not a name. This test used to pin 'Push-up' and
-- broke the moment the library grew an equally valid incline push-up - which
-- is a test failing on a correct answer, the least useful kind.
select ok(
  (select a.match_rank = 1 and a.primary_muscle = 'chest' and a.difficulty <= 2
     from public.suggest_alternatives(
            (select id from public.exercises where slug = 'barbell-bench-press'), 20) a
    limit 1),
  'the top bench press substitution trains the same muscle with the same movement, no harder');

select ok(
  (select bool_and(a.match_rank between 1 and 3)
     from public.suggest_alternatives(
            (select id from public.exercises where slug = 'deadlift'), 20) a),
  'every suggestion carries a rank the interface can explain');

select is(
  (select count(*)::int
     from public.suggest_alternatives(
            (select id from public.exercises where slug = 'barbell-bench-press'), 3)),
  3,
  'the limit is honoured');

-- ---------------------------------------------------------------------------
-- Names in the user's language
-- ---------------------------------------------------------------------------
-- exercise_translations had existed since 0008 with 25 rows that nothing ever
-- read, and searchExercises was an ILIKE over the English name - so "клек"
-- found nothing while the Bulgarian row for it sat in the table.

select is(
  (select name from public.search_exercises('back squat', 1, 'bg')),
  'Клек с щанга',
  'an exercise comes back in the requested locale');

select isnt_empty(
  $q$select id from public.search_exercises('клек', 20, 'bg')$q$,
  'a Bulgarian query finds exercises - the case that used to return nothing');

select isnt_empty(
  $q$select id from public.search_exercises('squat', 20, 'bg')$q$,
  'an English query still works for a user reading Bulgarian');

select isnt_empty(
  $q$select id from public.search_exercises('леж', 20, 'bg')$q$,
  'a Bulgarian prefix matches while the user is still typing');

select is(
  (select count(*)::int from public.search_exercises(null, 100, 'bg')),
  (select count(*)::int from public.exercises where is_public),
  'an empty query browses the whole public library rather than returning nothing');

-- Localisation is the claim here, so the assertion compares the two locales
-- against EACH OTHER rather than pinning a name. Pinning one made this fail
-- when the library gained a goblet squat - a test failing on a correct answer.
select isnt(
  (select name from public.suggest_alternatives(
     (select id from public.exercises where slug = 'back-squat'), 1, 'bg')),
  (select name from public.suggest_alternatives(
     (select id from public.exercises where slug = 'back-squat'), 1, 'en')),
  'the top substitution comes back under a different name in each locale');

select is(
  (select id from public.suggest_alternatives(
     (select id from public.exercises where slug = 'back-squat'), 1, 'bg')),
  (select id from public.suggest_alternatives(
     (select id from public.exercises where slug = 'back-squat'), 1, 'en')),
  'and it is the same exercise either way - the locale renames, it does not re-rank');

select is_empty(
  $q$select e.slug from public.exercises e
      where e.is_public
        and not exists (select 1 from public.exercise_translations t
                         where t.exercise_id = e.id and t.locale = 'bg')$q$,
  'every public exercise has a Bulgarian name');

select is_empty(
  $q$select r.name from public.recipes r
      where r.is_public
        and not exists (select 1 from public.recipe_translations t
                         where t.recipe_id = r.id and t.locale = 'bg')$q$,
  'every public recipe has a Bulgarian name');

select is_empty(
  $q$select r.name from public.recipes r
      join public.recipe_translations t on t.recipe_id = r.id and t.locale = 'bg'
     where r.is_public and coalesce(btrim(t.instructions), '') = ''$q$,
  'and Bulgarian instructions - a translated name over an English method looks finished and is not');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select is_empty(
  $q$select id::text from public.programs$q$,
  'anon reads no programmes');

reset role;

select * from finish();
rollback;
