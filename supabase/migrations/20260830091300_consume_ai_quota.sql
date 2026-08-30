-- ============================================================================
-- 0014  Atomic AI quota consumption
-- ============================================================================
-- Checking the count and then incrementing it is two statements, and between
-- them two concurrent scans both see "2 of 3 used" and both proceed. On a free
-- tier that is a small leak; on a paid vendor call it is our money.
--
-- One statement instead: the INSERT ... ON CONFLICT DO UPDATE increments only
-- when the stored count is still under the limit, and RETURNING tells us
-- whether it did. A row that comes back means the slot is ours.
--
-- SECURITY DEFINER because the ledger must not be writable by the account it
-- meters - a self-writable quota is not a quota. EXECUTE is granted only to
-- service_role, so the edge function is the sole caller.
-- ============================================================================

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_feature text,
  p_limit   integer,
  p_usage_date date default current_date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
begin
  if p_limit <= 0 then
    return false;
  end if;

  insert into public.ai_usage (user_id, usage_date, feature, count)
  values (p_user_id, p_usage_date, p_feature, 1)
  on conflict (user_id, usage_date, feature) do update
    set count = public.ai_usage.count + 1
    where public.ai_usage.count < p_limit
  returning true into v_allowed;

  -- No row returned means the WHERE on the DO UPDATE excluded it: the user is
  -- already at the limit. NOT FOUND rather than an exception, because being
  -- out of scans is a normal state the UI shows a paywall for.
  return coalesce(v_allowed, false);
end;
$$;

comment on function public.consume_ai_quota is
  'Atomically reserves one unit of AI quota. Returns false when the user is at their limit. service_role only - the metered account must not be able to write its own ledger.';

revoke all on function public.consume_ai_quota from public;
revoke all on function public.consume_ai_quota from authenticated;
revoke all on function public.consume_ai_quota from anon;
grant execute on function public.consume_ai_quota to service_role;

-- ---------------------------------------------------------------------------
-- Records the money actually spent, after the vendor answers. Separate from
-- consumption because the reservation happens BEFORE the call - we must not be
-- able to skip paying attention to a call that failed halfway.
-- ---------------------------------------------------------------------------

create or replace function public.record_ai_cost(
  p_user_id uuid,
  p_feature text,
  p_cost_usd numeric,
  p_usage_date date default current_date
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
     set cost_usd = cost_usd + greatest(coalesce(p_cost_usd, 0), 0)
   where user_id = p_user_id
     and usage_date = p_usage_date
     and feature = p_feature;
$$;

revoke all on function public.record_ai_cost from public;
revoke all on function public.record_ai_cost from authenticated;
revoke all on function public.record_ai_cost from anon;
grant execute on function public.record_ai_cost to service_role;
