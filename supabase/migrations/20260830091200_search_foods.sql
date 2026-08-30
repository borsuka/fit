-- ============================================================================
-- 0013  Food search
-- ============================================================================
-- Three signals, combined and ranked:
--
--   1. full-text over name + brand   - exact-ish word matches, index-backed
--   2. trigram similarity on name    - survives typos and partial words
--   3. curated aliases               - bridges "chicken breast" to USDA's
--                                      "Chicken, broilers or fryers, breast,
--                                      meat only, cooked, roasted"
--
-- Chosen over embeddings deliberately: this is deterministic, debuggable, and
-- fixable by inserting one alias row when it gets something wrong. pgvector
-- stays available if recall proves insufficient, but it is a much harder thing
-- to reason about when a user reports that their lunch matched the wrong food.
--
-- SECURITY INVOKER, so the RLS policy on `foods` decides visibility. There is
-- deliberately no repeated is_public/created_by predicate here - one source of
-- truth for who can see what.
-- ============================================================================

create or replace function public.search_foods(
  p_query text,
  p_limit integer default 25
)
returns table (
  id            uuid,
  name          text,
  brand         text,
  kcal_100g     numeric,
  protein_100g  numeric,
  carbs_100g    numeric,
  fat_100g      numeric,
  fiber_100g    numeric,
  source        public.food_source,
  data_quality  smallint,
  score         real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      nullif(btrim(p_query), '') as term,
      least(greatest(coalesce(p_limit, 25), 1), 50) as lim
  )
  select
    f.id,
    f.name,
    f.brand,
    f.kcal_100g,
    f.protein_100g,
    f.carbs_100g,
    f.fat_100g,
    f.fiber_100g,
    f.source,
    f.data_quality,
    greatest(
      ts_rank(f.search_vector, websearch_to_tsquery('simple', q.term)) * 4,
      extensions.similarity(f.name, q.term),
      coalesce((
        select max(extensions.similarity(a.alias, q.term))
        from public.food_aliases a
        where a.food_id = f.id
      ), 0)
    )::real as score
  from public.foods f, q
  where q.term is not null
    and f.archived_at is null
    and (
      f.search_vector @@ websearch_to_tsquery('simple', q.term)
      -- operator(extensions.%) rather than similarity(): only the operator
      -- form uses the GIN trigram index, and a sequential scan over a food
      -- table is exactly what this function exists to avoid.
      or f.name operator(extensions.%) q.term
      or exists (
        select 1 from public.food_aliases a
        where a.food_id = f.id and a.alias operator(extensions.%) q.term
      )
    )
  order by
    score desc,
    -- Curated data beats an unreviewed user entry at equal relevance.
    case f.source when 'curated' then 0 when 'usda' then 1 when 'off' then 2 else 3 end,
    f.data_quality desc,
    f.name
  limit (select lim from q);
$$;

comment on function public.search_foods is
  'Ranked food search over full-text, trigram similarity and curated aliases. SECURITY INVOKER so RLS on foods decides visibility.';

revoke all on function public.search_foods from public;
grant execute on function public.search_foods to authenticated;
