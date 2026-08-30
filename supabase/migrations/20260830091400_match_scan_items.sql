-- ============================================================================
-- 0015  Match AI scan items to foods
-- ============================================================================
-- The model returns "chicken breast"; the database calls it "Chicken breast,
-- skinless, cooked". This resolves each item of a scan to its best food
-- candidate using the same three signals as search_foods, and records the
-- score alongside the estimate.
--
-- Done in one statement rather than a search call per item: a plate with six
-- foods is six round trips from a phone, and the review screen cannot render
-- until the last one lands.
--
-- SECURITY INVOKER: RLS on ai_scan_items decides whose scan may be matched,
-- and RLS on foods decides which candidates are visible.
-- ============================================================================

create or replace function public.match_scan_items(p_scan_id uuid)
returns table (
  item_id         uuid,
  matched_food_id uuid,
  -- numeric, not real: RETURNING yields the COLUMN's type, and
  -- ai_scan_items.match_score is numeric(4,3). Declaring real here fails at
  -- runtime with "structure of query does not match function result type".
  match_score     numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with scored as (
    select
      i.id as candidate_item_id,
      f.id as candidate_food_id,
      -- Clamped to 1. ts_rank is weighted x4 so a strong full-text hit can
      -- outrank a mediocre trigram one, and that product exceeds 1 - which
      -- ai_scan_items.match_score rejects with a check violation. Clamping
      -- keeps the ordering while staying inside the column's contract.
      least(
        1.0,
        greatest(
          ts_rank(f.search_vector, websearch_to_tsquery('simple', i.normalized_query)) * 4,
          extensions.similarity(f.name, i.normalized_query),
          coalesce((
            select max(extensions.similarity(a.alias, i.normalized_query))
            from public.food_aliases a
            where a.food_id = f.id
          ), 0)
        )
      )::numeric(4,3) as candidate_score,
      case f.source when 'curated' then 0 when 'usda' then 1 when 'off' then 2 else 3 end
        as source_rank,
      f.data_quality
    from public.ai_scan_items i
    join public.foods f
      on f.archived_at is null
     and (
       f.search_vector @@ websearch_to_tsquery('simple', i.normalized_query)
       or f.name operator(extensions.%) i.normalized_query
       or exists (
         select 1 from public.food_aliases a
         where a.food_id = f.id and a.alias operator(extensions.%) i.normalized_query
       )
     )
    where i.scan_id = p_scan_id
  ),
  ranked as (
    select
      s.candidate_item_id,
      s.candidate_food_id,
      s.candidate_score,
      row_number() over (
        partition by s.candidate_item_id
        order by s.candidate_score desc, s.source_rank, s.data_quality desc
      ) as rn
    from scored s
  ),
  chosen as (
    select r.candidate_item_id, r.candidate_food_id, r.candidate_score
    from ranked r
    where r.rn = 1
      -- Below this, the "match" is noise. A wrong food attached to a scan is
      -- worse than no match: no match asks the user, a wrong match invites
      -- them to accept it.
      and r.candidate_score >= 0.25
  )
  update public.ai_scan_items i
     set matched_food_id = c.candidate_food_id,
         match_score     = c.candidate_score
    from chosen c
   where i.id = c.candidate_item_id
  returning i.id, i.matched_food_id, i.match_score;
end;
$$;

comment on function public.match_scan_items is
  'Resolves each item of a scan to its best food candidate. Unmatched items are left null - the review screen offers search rather than guessing.';

revoke all on function public.match_scan_items from public;
grant execute on function public.match_scan_items to authenticated;
