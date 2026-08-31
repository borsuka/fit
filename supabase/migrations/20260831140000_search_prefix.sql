-- ============================================================================
-- 0021  Food search that works while you are still typing
-- ============================================================================
-- The previous version matched WHOLE words or nothing. `websearch_to_tsquery`
-- produces exact lexemes, and trigram similarity divides by the union of both
-- strings' trigrams - so a short query against a long name scores far below
-- the 0.3 threshold. Measured against the seeded corpus:
--
--   'chicken' -> 10 hits      'chick' -> 2       'chic'  -> 0
--   'pizza'   ->  1 hit       'pizz'  -> 0
--   'пилешко' ->  4 hits      'пиле'  -> 2       'пил'   -> 0
--   'мляко'   ->  3 hits      'мля'   -> 0
--
-- Nobody types a whole word before looking at the list. What people saw was an
-- empty list that occasionally, at some unpredictable length, filled up - and
-- 'ме' returning honey, because 'ме' against the alias 'мед' happens to clear
-- the trigram threshold while nothing else does.
--
-- Two changes:
--
--   1. Every token in the query gets a `:*` prefix marker, so 'chic' matches
--      'Chicken breast' from the fourth keystroke. Built by round-tripping the
--      term through to_tsvector and quoting each lexeme, which is what makes
--      it safe: the user's text never reaches to_tsquery as syntax.
--
--   2. Aliases are matched by full text as well as by trigram. This is what
--      makes Bulgarian work at all - `foods.search_vector` covers name and
--      brand, both of which are English, so before this the ONLY route for a
--      Cyrillic query was trigram similarity against an alias.
--
-- Trigram matching is kept alongside, because it is what survives a typo.
-- ============================================================================

-- Immutable form of the expression, so it can be indexed: to_tsvector(text,
-- text) is only STABLE - the configuration is resolved at run time - while
-- to_tsvector(regconfig, text) is IMMUTABLE. The function below spells the
-- expression identically so the planner can use this index.
create index food_aliases_fts_idx
  on public.food_aliases
  using gin (to_tsvector('pg_catalog.simple'::regconfig, alias));

-- Dropped rather than replaced: `create or replace` cannot add an OUT column,
-- and matched_alias is one. The grant is reissued at the bottom, because a drop
-- takes the privileges with it.
drop function if exists public.search_foods(text, integer);

create function public.search_foods(
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
  -- Which alias caused the match, when one did. The list shows English names;
  -- a Bulgarian speaker who typed "кюфте" deserves to see why a given row is
  -- in front of them rather than guessing.
  matched_alias text,
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
  ),
  parsed as (
    select
      q.term,
      q.lim,
      websearch_to_tsquery('simple', q.term) as exact_q,
      -- Safe prefix query. The term is normalised into lexemes by tsvector
      -- first and each is quoted, so tsquery operators typed by the user are
      -- data, not syntax. Null when the term contains no lexemes at all.
      (
        select to_tsquery('simple', string_agg(quote_literal(lex) || ':*', ' & '))
        from unnest(tsvector_to_array(to_tsvector('simple', q.term))) as lex
      ) as prefix_q
    from q
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
    al.alias as matched_alias,
    greatest(
      -- A whole-word hit on the name is the strongest signal there is.
      case when f.search_vector @@ p.exact_q then 1.0 else 0 end,
      coalesce(al.strength, 0),
      case
        when p.prefix_q is not null and f.search_vector @@ p.prefix_q then 0.70
        else 0
      end,
      extensions.similarity(f.name, p.term)
    )::real as score
  from public.foods f
  cross join parsed p
  -- One best alias per food, or none. A lateral rather than a grouped join so
  -- the alias TEXT comes back with its score instead of just the maximum.
  left join lateral (
    select
      a.alias,
      case
        -- The alias IS the query. "мляко" must put milk above skimmed milk,
        -- whose alias merely contains the word.
        when lower(a.alias) = lower(p.term) then 1.0
        -- Within a tier, how much of the alias the user actually typed breaks
        -- the tie: "пилешко" covers more of "пилешко филе" than of "пилешко
        -- бедро", and coverage is the only signal available here that is not
        -- an arbitrary preference between two equally valid chicken cuts.
        when to_tsvector('pg_catalog.simple'::regconfig, a.alias) @@ p.exact_q
          then 0.90 + 0.05 * coverage.share
        when p.prefix_q is not null
             and to_tsvector('pg_catalog.simple'::regconfig, a.alias) @@ p.prefix_q
          then 0.60 + 0.05 * coverage.share
        else extensions.similarity(a.alias, p.term)
      end as strength
    from public.food_aliases a
    cross join lateral (
      select least(
        1.0,
        char_length(p.term)::numeric / greatest(char_length(a.alias), 1)
      ) as share
    ) coverage
    where a.food_id = f.id
      and (
        lower(a.alias) = lower(p.term)
        or to_tsvector('pg_catalog.simple'::regconfig, a.alias) @@ p.exact_q
        or (p.prefix_q is not null
            and to_tsvector('pg_catalog.simple'::regconfig, a.alias) @@ p.prefix_q)
        -- operator form rather than similarity(): only this uses the GIN
        -- trigram index.
        or a.alias operator(extensions.%) p.term
      )
    order by strength desc, length(a.alias)
    limit 1
  ) al on true
  where p.term is not null
    and f.archived_at is null
    and (
      f.search_vector @@ p.exact_q
      or (p.prefix_q is not null and f.search_vector @@ p.prefix_q)
      or f.name operator(extensions.%) p.term
      or al.alias is not null
    )
  order by
    score desc,
    -- At equal relevance, prefer the row a human explicitly named that way. A
    -- curated alias is evidence someone decided this phrase means this food;
    -- a name that merely contains the word is not. This is what puts chicken
    -- breast ahead of chicken liver for the query "chicken".
    case when al.alias is not null then 0 else 1 end,
    -- "Milk, 3.6% fat" before "Almond milk, unsweetened" for the query "milk".
    -- starts_with rather than LIKE: no pattern metacharacters to escape.
    case when starts_with(lower(f.name), lower(p.term)) then 0 else 1 end,
    -- Curated data beats an unreviewed user entry at equal relevance.
    case f.source when 'curated' then 0 when 'usda' then 1 when 'off' then 2 else 3 end,
    f.data_quality desc,
    -- The plainer name is nearly always the one meant: "Banana" over
    -- "Banana bread, homemade".
    char_length(f.name),
    f.name
  limit (select lim from parsed);
$$;

comment on function public.search_foods is
  'Ranked food search over full-text (whole word AND prefix), trigram similarity and curated aliases in either language. Returns the alias that matched, when one did. SECURITY INVOKER so RLS on foods decides visibility.';

revoke all on function public.search_foods from public;
grant execute on function public.search_foods to authenticated;
