-- ============================================================================
-- 0001  Extensions, enum types and shared helper functions
-- ============================================================================
-- Every function here sets an empty search_path and fully qualifies its
-- references. A SECURITY DEFINER function with a mutable search_path is a
-- privilege-escalation vector, and Supabase's own linter flags it.
-- ============================================================================

create extension if not exists pg_trgm  with schema extensions;
create extension if not exists btree_gin with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Metabolic formula input, not an identity field. Mifflin-St Jeor has exactly
-- two parameterisations; there is no honest third value to offer. Users who
-- decline cannot receive a BMR estimate, and the UI says so.
create type public.sex_at_birth as enum ('male', 'female');

create type public.activity_level as enum (
  'sedentary',  -- 1.200  desk job, little deliberate movement
  'light',      -- 1.375  light exercise 1-3 days/week
  'moderate',   -- 1.550  moderate exercise 3-5 days/week
  'very',       -- 1.725  hard exercise 6-7 days/week
  'extra'       -- 1.900  physical job or twice-daily training
);

create type public.goal_type    as enum ('lose', 'maintain', 'gain', 'muscle_gain');
create type public.meal_type    as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type public.food_source  as enum ('usda', 'off', 'user', 'curated');
create type public.entry_source as enum ('search', 'barcode', 'ai_scan', 'manual', 'recipe', 'favorite');

create type public.scan_status as enum (
  'pending',    -- row created, image uploaded
  'analyzing',  -- vision call in flight
  'matched',    -- items returned and matched to foods, awaiting the user
  'confirmed',  -- user accepted; a meal exists
  'failed',
  'discarded'   -- user abandoned the review screen
);

create type public.subscription_tier   as enum ('free', 'premium');
create type public.subscription_status as enum ('active', 'trialing', 'grace', 'expired', 'cancelled');
create type public.food_preference     as enum ('liked', 'disliked', 'excluded');
create type public.consent_kind        as enum ('terms', 'privacy', 'analytics', 'ai_photo_processing');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Maintains updated_at. Never let application code own this - it will be forgotten on some path.';

-- Age validation lives in a trigger rather than a CHECK constraint on purpose:
-- CHECK expressions must be immutable, and current_date is not. A CHECK using
-- current_date can also fail on restore when the dump is loaded on a later date.
create or replace function public.validate_profile_age()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  min_legal_age constant integer := 13;
begin
  if new.date_of_birth > current_date then
    raise exception 'date_of_birth cannot be in the future'
      using errcode = '23514';
  end if;

  if new.date_of_birth > current_date - (min_legal_age || ' years')::interval then
    raise exception 'user must be at least % years old', min_legal_age
      using errcode = '23514';
  end if;

  -- This is the LEGAL floor only. The 18+ product policy is enforced in
  -- src/domain/nutrition/safety/agePolicy.ts so it can change without a
  -- migration against a live user table. See docs/ARCHITECTURE.md D-3.
  return new;
end;
$$;
