-- ============================================================================
-- 0008  Workouts
-- ============================================================================
-- Templates and performed sessions are separate tables. Conflating them means
-- editing next week's plan silently rewrites last week's history.
-- ============================================================================

create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  primary_muscle    text not null check (primary_muscle in (
                      'chest','back','shoulders','biceps','triceps','forearms',
                      'quads','hamstrings','glutes','calves','core','full_body')),
  secondary_muscles text[] not null default '{}',
  equipment         text not null default 'bodyweight' check (equipment in (
                      'barbell','dumbbell','machine','cable','kettlebell','band','bodyweight','other')),
  difficulty        smallint not null default 2 check (difficulty between 1 and 3),
  instructions      text,
  video_url         text,
  is_public         boolean not null default true,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index exercises_muscle_idx on public.exercises (primary_muscle) where is_public;
create index exercises_trgm_idx   on public.exercises using gin (name extensions.gin_trgm_ops);

create table public.exercise_translations (
  exercise_id  uuid not null references public.exercises(id) on delete cascade,
  locale       text not null check (locale in ('en','bg')),
  name         text not null,
  instructions text,
  primary key (exercise_id, locale)
);

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

create table public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name        text not null check (char_length(name) between 1 and 120),
  note        text,
  is_template boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index workouts_user_idx on public.workouts (user_id, created_at desc);

create trigger workouts_set_updated_at
  before update on public.workouts
  for each row execute function public.set_updated_at();

create table public.workout_exercises (
  id               uuid primary key default gen_random_uuid(),
  workout_id       uuid not null references public.workouts(id) on delete cascade,
  exercise_id      uuid not null references public.exercises(id) on delete restrict,
  sort_order       smallint not null default 0,
  target_sets      smallint check (target_sets between 1 and 20),
  target_reps      smallint check (target_reps between 1 and 200),
  target_weight_kg numeric(6,2) check (target_weight_kg between 0 and 700),
  rest_seconds     smallint check (rest_seconds between 0 and 1800)
);
create index workout_exercises_workout_idx on public.workout_exercises (workout_id, sort_order);

-- ---------------------------------------------------------------------------
-- Performed sessions
-- ---------------------------------------------------------------------------

create table public.workout_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  workout_id       uuid references public.workouts(id) on delete set null,  -- null = ad hoc
  name             text not null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer check (duration_seconds >= 0),
  note             text,
  constraint session_times_ordered check (ended_at is null or ended_at >= started_at)
);
create index workout_sessions_user_idx on public.workout_sessions (user_id, started_at desc);

create table public.session_exercises (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.workout_sessions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  sort_order  smallint not null default 0
);
create index session_exercises_session_idx on public.session_exercises (session_id, sort_order);

create table public.workout_sets (
  id                  uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  -- Highest-volume user table in the schema; carries user_id directly for the
  -- same RLS reason as meal_items.
  user_id             uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  set_number          smallint not null check (set_number between 1 and 50),
  reps                smallint check (reps between 0 and 500),
  weight_kg           numeric(6,2) check (weight_kg between 0 and 700),
  rpe                 numeric(3,1) check (rpe between 1 and 10),
  is_warmup           boolean not null default false,
  completed_at        timestamptz not null default now(),
  unique (session_exercise_id, set_number)
);
create index workout_sets_user_idx on public.workout_sets (user_id, completed_at desc);

comment on table public.workout_sets is
  'Volume, estimated 1RM and progression are computed in src/domain/workouts, never stored. They are functions of these rows; a stored copy is one more thing that can disagree with reality.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.exercises             enable row level security;
alter table public.exercise_translations enable row level security;
alter table public.workouts              enable row level security;
alter table public.workout_exercises     enable row level security;
alter table public.workout_sessions      enable row level security;
alter table public.session_exercises     enable row level security;
alter table public.workout_sets          enable row level security;

create policy exercises_read on public.exercises for select to authenticated
  using (is_public or created_by = (select auth.uid()));
create policy exercise_translations_read on public.exercise_translations for select to authenticated
  using (true);

create policy workouts_all on public.workouts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy workout_exercises_all on public.workout_exercises for all to authenticated
  using (exists (select 1 from public.workouts w
                 where w.id = workout_exercises.workout_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workouts w
                 where w.id = workout_exercises.workout_id and w.user_id = (select auth.uid())));

create policy workout_sessions_all on public.workout_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy session_exercises_all on public.session_exercises for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy workout_sets_all on public.workout_sets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
