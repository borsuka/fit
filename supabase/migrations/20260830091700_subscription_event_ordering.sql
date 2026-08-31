-- ============================================================================
-- 0018  Subscription event ordering
-- ============================================================================
-- Webhooks arrive out of order and get redelivered. Without a recorded event
-- timestamp there is no way to tell a stale EXPIRATION from a current one, and
-- a retry landing after a RENEWAL silently downgrades a paying customer - who
-- notices only that the feature they pay for stopped working.
--
-- updated_at cannot serve: it records when WE wrote the row, not when the event
-- happened at the store.
-- ============================================================================

alter table public.subscriptions
  add column last_event_ms bigint,
  add column last_event_id text;

comment on column public.subscriptions.last_event_ms is
  'Store-side timestamp of the newest event applied. An event older than this is ignored.';
comment on column public.subscriptions.last_event_id is
  'Newest applied event id, for tracing a specific delivery in RevenueCat.';
