-- ============================================================================
-- Supabase compatibility shim for plain-Postgres verification
-- ============================================================================
-- NOT part of the application, NOT applied to any real database.
--
-- Lives under scripts/, NOT under supabase/tests/: `supabase test db` runs
-- every .sql file in that directory, and pointing pg_prove at a shim that
-- tries to create auth.users against the real stack fails with a permission
-- error. An underscore prefix is not an exclusion rule.
--
-- Purpose: apply the migrations against a stock `postgres` Docker image to
-- catch syntax errors, bad references and broken constraints without waiting
-- on the full Supabase stack. It recreates only the surface the migrations
-- touch: the auth and storage schemas, the three Supabase roles, and
-- auth.uid().
--
-- This is a smoke check, not parity. `supabase db reset` plus `supabase test
-- db` remains the authority - GoTrue, Storage and the real grant matrix are
-- not reproduced here.
-- ============================================================================

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;

-- Minimal auth.users: only the columns the migrations and tests reference.
create table if not exists auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Matches Supabase's implementation: read the subject from the request JWT
-- claims GUC, tolerating both the legacy flat key and the JSON blob.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text not null,
  owner      uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end
$$;

grant all on all tables in schema auth, storage to service_role;
grant select, insert, update, delete on storage.objects to authenticated, anon;
grant select on storage.buckets to authenticated, anon;

-- Supabase grants these by default; the migrations assume them.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
