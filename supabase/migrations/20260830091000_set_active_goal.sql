-- ============================================================================
-- 0011  Atomic goal replacement
-- ============================================================================
-- goals is append-only with a partial unique index allowing one active row per
-- user. Replacing a goal is therefore two statements - deactivate the old,
-- insert the new - and supabase-js cannot wrap two calls in a transaction.
--
-- Done from the client, the deactivate could succeed and the insert fail,
-- leaving a user with NO active goal and an app that cannot show a target. Run
-- in the other order it hits the unique index and fails outright. Either way
-- the client cannot make this atomic, so the database does it.
--
-- SECURITY INVOKER: the function runs with the CALLER's privileges, so RLS
-- still applies and a user cannot write a goal for somebody else. A
-- SECURITY DEFINER function here would be a hole straight through RLS - and
-- the explicit empty search_path stops the classic definer hijack besides.
-- ============================================================================

create or replace function public.set_active_goal(
  p_goal             public.goal_type,
  p_activity         public.activity_level,
  p_start_weight_kg  numeric,
  p_calorie_target   integer,
  p_protein_g        integer,
  p_carbs_g          integer,
  p_fat_g            integer,
  p_computed_by      text,
  p_target_weight_kg numeric default null,
  p_weekly_rate_kg   numeric default null,
  p_fiber_g          integer default null,
  p_water_ml         integer default null
)
returns public.goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_goal    public.goals;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.goals
     set is_active = false
   where user_id = v_user_id
     and is_active;

  insert into public.goals (
    user_id, goal, activity,
    start_weight_kg, target_weight_kg, weekly_rate_kg,
    calorie_target, protein_g, carbs_g, fat_g, fiber_g, water_ml,
    computed_by, effective_from, is_active
  ) values (
    v_user_id, p_goal, p_activity,
    p_start_weight_kg, p_target_weight_kg, p_weekly_rate_kg,
    p_calorie_target, p_protein_g, p_carbs_g, p_fat_g, p_fiber_g, p_water_ml,
    p_computed_by, current_date, true
  )
  returning * into v_goal;

  return v_goal;
end;
$$;

comment on function public.set_active_goal is
  'Deactivates the current goal and inserts a new one in a single transaction. SECURITY INVOKER, so RLS decides whose goal may be written.';

revoke all on function public.set_active_goal from public;
grant execute on function public.set_active_goal to authenticated;
