-- ============================================================================
-- 0002  Identity: profiles and goals
-- ============================================================================

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text check (char_length(display_name) <= 60),
  date_of_birth date not null,
  sex           public.sex_at_birth not null,
  height_cm     numeric(5,1) not null check (height_cm between 120 and 250),
  timezone      text not null default 'UTC',
  locale        text not null default 'en' check (locale in ('en', 'bg')),
  unit_system   text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.height_cm is
  'Always centimetres. Imperial is a display conversion; mixed units in storage is how you get a 70-pound user who is 2 m tall.';
comment on column public.profiles.timezone is
  'IANA name. Drives the local_date a diary entry belongs to - a meal at 00:30 in Sofia belongs to that day, not the previous UTC one.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger profiles_validate_age
  before insert or update of date_of_birth on public.profiles
  for each row execute function public.validate_profile_age();

-- ---------------------------------------------------------------------------
-- Goals: append-only and versioned, never mutated in place.
-- A progress chart three months from now must still know what the target was
-- on the day being charted.
-- ---------------------------------------------------------------------------

create table public.goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  goal             public.goal_type not null,
  activity         public.activity_level not null,

  start_weight_kg  numeric(5,2) not null check (start_weight_kg  between 30 and 300),
  target_weight_kg numeric(5,2)          check (target_weight_kg between 30 and 300),
  weekly_rate_kg   numeric(4,3)          check (weekly_rate_kg between -1.5 and 1.5),

  calorie_target   integer not null check (calorie_target between 1000 and 6000),
  protein_g        integer not null check (protein_g >= 0),
  carbs_g          integer not null check (carbs_g   >= 0),
  fat_g            integer not null check (fat_g     >= 0),
  fiber_g          integer          check (fiber_g   >= 0),
  water_ml         integer          check (water_ml  >= 0),

  -- Which engine version produced these numbers. A formula change must be
  -- auditable rather than invisible.
  computed_by      text not null,
  effective_from   date not null default current_date,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create unique index goals_one_active_per_user on public.goals (user_id) where is_active;
create index goals_user_effective_idx on public.goals (user_id, effective_from desc);

comment on table public.goals is
  'Append-only. Changing a target inserts a new row and deactivates the previous one.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Two details below are load-bearing, not style:
--
--   1. (select auth.uid()) rather than a bare auth.uid(). Postgres treats the
--      subquery as an InitPlan and evaluates it once per statement instead of
--      once per row.
--
--   2. Every UPDATE policy has BOTH using and with check. With `using` alone a
--      user can update their own row and reassign user_id to someone else,
--      handing the row to another account. This is the most commonly missed
--      RLS mistake and it is a real vulnerability.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy profiles_delete on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

alter table public.goals enable row level security;

create policy goals_select on public.goals for select to authenticated
  using ((select auth.uid()) = user_id);

create policy goals_insert on public.goals for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy goals_update on public.goals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy goals_delete on public.goals for delete to authenticated
  using ((select auth.uid()) = user_id);
