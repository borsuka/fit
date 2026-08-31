-- ============================================================================
-- 0020  Training programmes, movement patterns and exercise alternatives
-- ============================================================================
-- Three things the workouts feature was missing, and they are related:
--
--   1. A catalogue of established programmes, so a beginner does not have to
--      invent one. Read-only reference data, like `foods`.
--   2. A way to say "not that exercise, something else" without abandoning the
--      programme. Alternatives are DERIVED from movement pattern and muscle
--      rather than curated pair by pair: a hand-maintained N-by-N table is
--      always half empty, and the half that is missing is the half the user
--      asks for.
--   3. Somewhere for a programme to live once a user adopts it. That is the
--      existing `workouts` table - a programme is COPIED into the user's own
--      templates rather than referenced. Copying is what makes swapping an
--      exercise their business rather than an edit to shared reference data,
--      and what stops a change to the catalogue silently rewriting the plan
--      someone is halfway through.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Movement pattern
-- ---------------------------------------------------------------------------
-- primary_muscle alone makes a poor substitution rule: it would offer a
-- lateral raise in place of an overhead press because both are "shoulders",
-- and one of those is a main lift while the other is an accessory. Pattern
-- first, muscle second, gives an ordering that matches how a coach would
-- answer the question.

create type public.movement_pattern as enum (
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'core',
  'isolation',
  'conditioning'
);

alter table public.exercises
  add column movement_pattern public.movement_pattern;

comment on column public.exercises.movement_pattern is
  'Drives exercise substitution. Null means "no suggestion available" - see suggest_alternatives, which returns nothing rather than guessing.';

create index exercises_pattern_idx on public.exercises (movement_pattern, primary_muscle)
  where is_public;

-- ---------------------------------------------------------------------------
-- Programme catalogue
-- ---------------------------------------------------------------------------

create table public.programs (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null check (char_length(name) between 1 and 120),
  -- Who wrote it. These are other people's programmes and are named as such.
  author        text,
  focus         text not null check (focus in ('strength', 'hypertrophy', 'general')),
  experience    smallint not null check (experience between 1 and 3),
  days_per_week smallint not null check (days_per_week between 1 and 7),
  description   text not null,
  sort_order    smallint not null default 0,
  is_public     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.programs is
  'Read-only reference data. A user adopting a programme gets a COPY in their own workouts, never a reference to this row.';

create table public.program_days (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  -- Position in the rotation, not a weekday. StrongLifts alternates A/B/A then
  -- B/A/B; pinning it to Monday would be wrong by the second week.
  day_index  smallint not null check (day_index >= 0),
  name       text not null check (char_length(name) between 1 and 80),
  unique (program_id, day_index)
);

create table public.program_exercises (
  id             uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references public.program_days(id) on delete cascade,
  exercise_id    uuid not null references public.exercises(id) on delete restrict,
  sort_order     smallint not null default 0,
  target_sets    smallint not null check (target_sets between 1 and 20),
  target_reps    smallint not null check (target_reps between 1 and 200),
  rest_seconds   smallint check (rest_seconds between 0 and 1800),
  note           text
);
create index program_exercises_day_idx on public.program_exercises (program_day_id, sort_order);

-- ---------------------------------------------------------------------------
-- Where an adopted programme came from
-- ---------------------------------------------------------------------------
-- Nullable, and `on delete set null`: a workout the user has been running for
-- three months must survive the catalogue row being retired.

alter table public.workouts
  add column source_program_id uuid references public.programs(id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.programs           enable row level security;
alter table public.program_days       enable row level security;
alter table public.program_exercises  enable row level security;

create policy programs_read on public.programs for select to authenticated
  using (is_public);

create policy program_days_read on public.program_days for select to authenticated
  using (exists (select 1 from public.programs p
                 where p.id = program_days.program_id and p.is_public));

create policy program_exercises_read on public.program_exercises for select to authenticated
  using (exists (select 1 from public.program_days d
                 join public.programs p on p.id = d.program_id
                 where d.id = program_exercises.program_day_id and p.is_public));

-- ---------------------------------------------------------------------------
-- suggest_alternatives(exercise, limit)
-- ---------------------------------------------------------------------------
-- Ranked replacements for one exercise.
--
-- Ordering is the whole value of this function:
--   1. same movement pattern AND same primary muscle - a true swap
--   2. same movement pattern            - trains the same job differently
--   3. same primary muscle              - hits the same muscle another way
--
-- An exercise with no movement pattern returns only same-muscle matches. It
-- does NOT fall back to "anything public": a user asking to replace a squat
-- deserves an empty list over a bicep curl.

create or replace function public.suggest_alternatives(
  p_exercise_id uuid,
  p_limit       integer default 8
)
returns table (
  id             uuid,
  slug           text,
  name           text,
  primary_muscle text,
  equipment      text,
  difficulty     smallint,
  match_rank     smallint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with source as (
    select movement_pattern, primary_muscle
      from public.exercises
     where id = p_exercise_id
  )
  select
    e.id,
    e.slug,
    e.name,
    e.primary_muscle,
    e.equipment,
    e.difficulty,
    (case
       when e.movement_pattern is not distinct from s.movement_pattern
            and e.movement_pattern is not null
            and e.primary_muscle = s.primary_muscle then 1
       when e.movement_pattern is not distinct from s.movement_pattern
            and e.movement_pattern is not null then 2
       else 3
     end)::smallint as match_rank
  from public.exercises e
  cross join source s
  where e.id <> p_exercise_id
    and e.is_public
    and (
      (e.movement_pattern is not distinct from s.movement_pattern
       and e.movement_pattern is not null)
      or e.primary_muscle = s.primary_muscle
    )
  -- Easier first within a rank: someone swapping an exercise out is usually
  -- swapping away from something they cannot do, not towards something harder.
  order by match_rank, e.difficulty, e.name
  limit greatest(p_limit, 1);
$$;

comment on function public.suggest_alternatives is
  'Ranked substitutions for one exercise: same pattern and muscle first, then same pattern, then same muscle. Returns nothing rather than an unrelated exercise.';

-- ---------------------------------------------------------------------------
-- adopt_program(program, day) -> workout id
-- ---------------------------------------------------------------------------
-- Copies one day of a programme into a workout template owned by the caller.
--
-- A function rather than client-side inserts because it is one transaction:
-- a template that exists with half its exercises is worse than one that failed
-- to be created, and the client cannot guarantee that across two round trips.

create or replace function public.adopt_program_day(
  p_program_id uuid,
  p_day_index  smallint
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := (select auth.uid());
  v_day      record;
  v_workout  uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select d.id, d.name, p.name as program_name, p.id as program_id
    into v_day
    from public.program_days d
    join public.programs p on p.id = d.program_id
   where d.program_id = p_program_id
     and d.day_index  = p_day_index
     and p.is_public;

  if not found then
    raise exception 'program day not found' using errcode = 'P0002';
  end if;

  insert into public.workouts (user_id, name, is_template, source_program_id)
  values (v_user_id, v_day.program_name || ' - ' || v_day.name, true, v_day.program_id)
  returning id into v_workout;

  insert into public.workout_exercises
    (workout_id, exercise_id, sort_order, target_sets, target_reps, rest_seconds)
  select v_workout, pe.exercise_id, pe.sort_order, pe.target_sets, pe.target_reps, pe.rest_seconds
    from public.program_exercises pe
   where pe.program_day_id = v_day.id
   order by pe.sort_order;

  return v_workout;
end;
$$;

comment on function public.adopt_program_day is
  'Copies one programme day into a workout template owned by the caller, in one transaction. security invoker: RLS on workouts decides who ends up owning it.';

-- ---------------------------------------------------------------------------
-- start_session_from_workout(workout) -> session id
-- ---------------------------------------------------------------------------
-- Same reasoning: a session with some of its exercises is a broken session.

create or replace function public.start_session_from_workout(p_workout_id uuid)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name    text;
  v_session uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- RLS already restricts this to the caller's own templates; the explicit
  -- check turns "zero rows" into a named error rather than a null name.
  select w.name into v_name
    from public.workouts w
   where w.id = p_workout_id;

  if not found then
    raise exception 'workout not found' using errcode = 'P0002';
  end if;

  insert into public.workout_sessions (user_id, workout_id, name)
  values (v_user_id, p_workout_id, v_name)
  returning id into v_session;

  insert into public.session_exercises (session_id, user_id, exercise_id, sort_order)
  select v_session, v_user_id, we.exercise_id, we.sort_order
    from public.workout_exercises we
   where we.workout_id = p_workout_id
   order by we.sort_order;

  return v_session;
end;
$$;

comment on function public.start_session_from_workout is
  'Creates a session from a template with its exercises already in place, in one transaction.';
