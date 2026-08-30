-- ============================================================================
-- 0009  System: subscriptions, consent, notifications, GDPR requests
-- ============================================================================

create table public.subscriptions (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  tier               public.subscription_tier not null default 'free',
  status             public.subscription_status not null default 'active',
  store              text check (store in ('app_store','play_store','promo')),
  product_id         text,
  rc_app_user_id     text,
  current_period_end timestamptz,
  is_trial           boolean not null default false,
  updated_at         timestamptz not null default now()
);

comment on table public.subscriptions is
  'Written ONLY by the RevenueCat webhook edge function as service_role. Users get SELECT on their own row and no write path whatsoever - otherwise a client grants itself premium with one update call. Edge functions read this table rather than trusting a request body.';

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create table public.consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind       public.consent_kind not null,
  version    text not null,
  granted    boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index consents_user_idx on public.consents (user_id, kind, granted_at desc);

comment on table public.consents is
  'Append-only consent ledger. Separable consent for required processing, analytics and AI photo processing - a single bundled checkbox is not consent under GDPR.';

-- ---------------------------------------------------------------------------

create table public.push_tokens (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  token      text not null,
  platform   text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind          text not null,
  scheduled_for timestamptz not null,
  sent_at       timestamptz,
  payload       jsonb not null default '{}'::jsonb
);
create index notifications_pending_idx on public.notifications (scheduled_for) where sent_at is null;

-- ---------------------------------------------------------------------------
-- GDPR. Both paths must exist before launch: the App Store requires deletion,
-- and GDPR requires deletion and export.
-- ---------------------------------------------------------------------------

create table public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status       text not null default 'pending' check (status in ('pending','processing','completed','failed'))
);

create table public.export_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  requested_at timestamptz not null default now(),
  file_path    text,
  expires_at   timestamptz,
  status       text not null default 'pending' check (status in ('pending','processing','completed','failed'))
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.subscriptions     enable row level security;
alter table public.consents          enable row level security;
alter table public.push_tokens       enable row level security;
alter table public.notifications     enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.export_requests   enable row level security;

-- SELECT only. No insert, update or delete policy exists for any client role.
create policy subscriptions_select on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- Append-only from the client: consent may be recorded but never rewritten.
create policy consents_select on public.consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy consents_insert on public.consents for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy push_tokens_all on public.push_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy notifications_select on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);
create policy notifications_update on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy deletion_requests_select on public.deletion_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy deletion_requests_insert on public.deletion_requests for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy export_requests_select on public.export_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy export_requests_insert on public.export_requests for insert to authenticated
  with check ((select auth.uid()) = user_id);
