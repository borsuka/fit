-- ============================================================================
-- 0017  Data lifecycle: export payload and the exports bucket
-- ============================================================================
-- GDPR Article 15 (access) and Article 17 (erasure) are not features to be
-- scheduled later. The request tables already existed and nothing read them,
-- which is worse than having neither: the app told a user their data was gone
-- while every row was still there.
-- ============================================================================

-- Private. An export contains a person's entire food, weight and workout
-- history; a public bucket here would be a data breach with a URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 52428800, array['application/json'])
on conflict (id) do nothing;

create policy exports_select on storage.objects for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No insert or update policy for any client role. Exports are written by the
-- lifecycle worker as service_role - a user can read their own export and
-- cannot fabricate one.

-- ---------------------------------------------------------------------------
-- Everything we hold about one user, as a single JSON document.
--
-- SECURITY INVOKER with EXECUTE granted to service_role only. The worker holds
-- service_role, which bypasses RLS, so the function needs no elevated rights of
-- its own - and an authenticated caller cannot invoke it at all, so it can
-- never become an oracle for another account's history.
-- ---------------------------------------------------------------------------

create or replace function public.export_user_data(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'format_version', 1,
    'user_id', p_user_id,

    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = p_user_id
    ),
    'goals', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at, g.id)
      from public.goals g where g.user_id = p_user_id
    ), '[]'::jsonb),
    'meals', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object('items', coalesce((
          select jsonb_agg(to_jsonb(mi) order by mi.created_at, mi.id)
          from public.meal_items mi where mi.meal_id = m.id
        ), '[]'::jsonb))
        order by m.local_date, m.id
      )
      from public.meals m where m.user_id = p_user_id
    ), '[]'::jsonb),
    'daily_logs', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.local_date)
      from public.daily_logs d where d.user_id = p_user_id
    ), '[]'::jsonb),
    'weight_logs', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.logged_on)
      from public.weight_logs w where w.user_id = p_user_id
    ), '[]'::jsonb),
    'body_measurements', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.logged_on)
      from public.body_measurements b where b.user_id = p_user_id
    ), '[]'::jsonb),
    'recipes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
      from public.recipes r where r.user_id = p_user_id
    ), '[]'::jsonb),
    'meal_plans', coalesce((
      select jsonb_agg(to_jsonb(mp) order by mp.start_date, mp.id)
      from public.meal_plans mp where mp.user_id = p_user_id
    ), '[]'::jsonb),
    'workout_sessions', coalesce((
      select jsonb_agg(
        to_jsonb(s) || jsonb_build_object('exercises', coalesce((
          select jsonb_agg(
            to_jsonb(se) || jsonb_build_object('sets', coalesce((
              select jsonb_agg(to_jsonb(ws) order by ws.set_number)
              from public.workout_sets ws where ws.session_exercise_id = se.id
            ), '[]'::jsonb))
            order by se.sort_order
          )
          from public.session_exercises se where se.session_id = s.id
        ), '[]'::jsonb))
        order by s.started_at, s.id
      )
      from public.workout_sessions s where s.user_id = p_user_id
    ), '[]'::jsonb),
    -- The model's estimate AND the user's correction. Both are the user's data;
    -- withholding the correction would make the export incomplete.
    'ai_scans', coalesce((
      select jsonb_agg(
        to_jsonb(sc) || jsonb_build_object('items', coalesce((
          select jsonb_agg(to_jsonb(si) order by si.sort_order)
          from public.ai_scan_items si where si.scan_id = sc.id
        ), '[]'::jsonb))
        order by sc.created_at, sc.id
      )
      from public.ai_scans sc where sc.user_id = p_user_id
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.granted_at, c.id)
      from public.consents c where c.user_id = p_user_id
    ), '[]'::jsonb),
    'subscription', (
      select to_jsonb(sub) from public.subscriptions sub where sub.user_id = p_user_id
    ),
    'favorite_foods', coalesce((
      select jsonb_agg(f.food_id)
      from public.favorite_foods f where f.user_id = p_user_id
    ), '[]'::jsonb)
  );
$$;

comment on function public.export_user_data is
  'Everything held about one user, as one JSON document. service_role only.';

revoke all on function public.export_user_data from public;
revoke all on function public.export_user_data from authenticated;
revoke all on function public.export_user_data from anon;
grant execute on function public.export_user_data to service_role;

-- ---------------------------------------------------------------------------
-- Photo retention
-- ---------------------------------------------------------------------------

alter table public.ai_scans add column photo_deleted_at timestamptz;

comment on column public.ai_scans.photo_deleted_at is
  'When the image bytes were removed. The scan record outlives the photo: the
   items and the user corrections are what has lasting value, the JPEG is not.';

-- ---------------------------------------------------------------------------
-- Storage paths whose retention has lapsed.
--
-- Returns paths rather than deleting rows: removing a row from storage.objects
-- does NOT remove the underlying file in Supabase Storage. Deleting here would
-- leave the bytes on disk and the record gone, which is the worst of both - the
-- photo survives and nothing points at it any more. The worker calls the
-- Storage API with these paths.
-- ---------------------------------------------------------------------------

create or replace function public.expired_photo_paths(p_limit integer default 500)
returns table (scan_id uuid, image_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.image_path
  from public.ai_scans s
  where s.expires_at < now()
    and s.photo_deleted_at is null
  order by s.expires_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function public.expired_photo_paths from public;
revoke all on function public.expired_photo_paths from authenticated;
revoke all on function public.expired_photo_paths from anon;
grant execute on function public.expired_photo_paths to service_role;

-- ---------------------------------------------------------------------------
-- Proof that erasure happened.
--
-- Deliberately holds NO reference to the user. A deletion_requests row cascades
-- away with the account, so it cannot record its own completion; keeping a
-- user id or a hash of one to "prove" the erasure would preserve exactly the
-- identifier the erasure was meant to remove.
--
-- So this proves that N deletions completed and when, and nothing about whom.
-- That is the honest limit: we cannot both demonstrate whose data we erased and
-- have erased it.
-- ---------------------------------------------------------------------------

create table public.deletion_audit (
  id           uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null,
  completed_at timestamptz not null default now()
);

alter table public.deletion_audit enable row level security;
-- No policy for any client role: RLS-enabled with no policy is unreadable,
-- which is correct. Only service_role, which bypasses RLS, ever touches it.

comment on table public.deletion_audit is
  'Timestamps only. Records that an erasure completed, never whose.';
