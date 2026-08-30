-- ============================================================================
-- 0006  AI scans
-- ============================================================================
-- Note what is absent: there is no column anywhere in this file in which the
-- model could return a calorie value. Nutrition is computed from foods x grams
-- and snapshotted onto meal_items. Hallucinated nutrition is made structurally
-- impossible rather than merely discouraged.
-- ============================================================================

create table public.ai_scans (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),

  image_path text not null,   -- key in the PRIVATE food-photos bucket
  image_hash text,            -- dedup / response cache key

  status         public.scan_status not null default 'pending',
  prompt_version text,        -- e.g. 'food-analysis-v1'
  model          text,        -- concrete vendor model id that answered
  provider       text,        -- 'anthropic' | 'openai' | 'google' (bake-off, D-1)
  is_food        boolean,

  latency_ms    integer check (latency_ms >= 0),
  input_tokens  integer check (input_tokens  >= 0),
  output_tokens integer check (output_tokens >= 0),
  cost_usd      numeric(8,5) check (cost_usd >= 0),
  error_code    text,

  meal_id uuid references public.meals(id) on delete set null,

  created_at timestamptz not null default now(),
  -- Photo lifecycle. The derived scan record is what has lasting value, not
  -- the JPEG; a storage cleanup job deletes objects past this date.
  expires_at timestamptz not null default now() + interval '90 days'
);

create index ai_scans_user_idx    on public.ai_scans (user_id, created_at desc);
create index ai_scans_expiry_idx  on public.ai_scans (expires_at) where status <> 'discarded';
create index ai_scans_hash_idx    on public.ai_scans (image_hash) where image_hash is not null;

-- ---------------------------------------------------------------------------

create table public.ai_scan_items (
  id      uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.ai_scans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),

  -- What the model said
  label            text not null check (char_length(label) between 1 and 80),
  normalized_query text not null check (char_length(normalized_query) between 1 and 80),
  estimated_grams  numeric(7,2) not null check (estimated_grams between 1 and 2000),
  confidence       numeric(4,3) not null check (confidence between 0 and 1),
  portion_basis    text check (portion_basis in ('reference_object','plate_ratio','typical_serving','unknown')),
  preparation      text check (preparation in ('raw','grilled','fried','boiled','baked','unknown')),

  -- What our matcher found
  matched_food_id uuid references public.foods(id) on delete set null,
  match_score     numeric(4,3) check (match_score between 0 and 1),

  -- What the HUMAN actually decided
  user_accepted boolean,
  user_food_id  uuid references public.foods(id) on delete set null,
  user_grams    numeric(7,2) check (user_grams between 1 and 5000),

  sort_order smallint not null default 0
);

comment on table public.ai_scan_items is
  'Keeps the model estimate AND the user correction side by side. That pairing is the most valuable dataset this product generates: real-world accuracy per prompt version, systematic portion bias, and eventually a correction model. Overwriting the estimate would discard it.';

create index ai_scan_items_scan_idx on public.ai_scan_items (scan_id, sort_order);
create index ai_scan_items_user_idx on public.ai_scan_items (user_id);

-- Close the diary FK left open in 0004.
alter table public.meal_items
  add constraint meal_items_ai_scan_item_id_fkey
  foreign key (ai_scan_item_id) references public.ai_scan_items(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Quota ledger. Incremented inside the edge function in the same transaction
-- as the scan. Client-side counting is not a quota.
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  feature    text not null check (feature in ('scan','meal_plan','coach')),
  count      integer not null default 0 check (count >= 0),
  cost_usd   numeric(8,5) not null default 0 check (cost_usd >= 0),
  primary key (user_id, usage_date, feature)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.ai_scans      enable row level security;
alter table public.ai_scan_items enable row level security;
alter table public.ai_usage      enable row level security;

create policy ai_scans_select on public.ai_scans for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ai_scans_insert on public.ai_scans for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- Users may only move a scan to a terminal user-driven state. Everything the
-- pipeline writes (model, cost, tokens, status transitions) is service_role.
create policy ai_scans_update on public.ai_scans for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_scans_delete on public.ai_scans for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy ai_scan_items_select on public.ai_scan_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ai_scan_items_update on public.ai_scan_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_scan_items_delete on public.ai_scan_items for delete to authenticated
  using ((select auth.uid()) = user_id);
-- No insert policy: scan items are produced by the edge function, never posted
-- by a client. A client that could invent scan items could invent the audit
-- trail we intend to measure accuracy with.

-- Read-only to the owner so the app can show "2 of 3 scans used today".
-- Writes are service_role only - a self-writable quota is not a quota.
create policy ai_usage_select on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);
