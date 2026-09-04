-- ============================================================================
-- 0022  Food names in the user's language
-- ============================================================================
-- `food_aliases` made a food findable in Bulgarian. It did not make it
-- readable: every screen shows `foods.name`, which is English, so someone who
-- searched "кюфте" and logged it then watched "Kyufte (grilled meatball)"
-- appear in their diary.
--
-- `food_translations` has existed since 0003 and was empty. It is now seeded
-- for Bulgarian, and this makes it do two jobs:
--
--   1. DISPLAY - `name` comes back translated, falling back to the catalogue
--      name when no translation exists. Callers need no new column and cannot
--      forget to use it.
--
--   2. SEARCH - the translation is matched alongside the name and the aliases.
--      A translation carries qualifiers an alias deliberately drops ("без
--      кожа", "сварен"), so "без кожа" now finds something. An alias has to
--      stay short to match what people type; a translation has to stay precise
--      to tell two minces apart. Both are useful to search.
--
-- The MATCH is still against every language at once. Someone whose phone is in
-- Bulgarian may well type "chicken", and refusing them because of a settings
-- value would be a worse search for no benefit.
-- ============================================================================

create index food_translations_fts_idx
  on public.food_translations
  using gin (to_tsvector('pg_catalog.simple'::regconfig, name));

create index food_translations_trgm_idx
  on public.food_translations
  using gin (name extensions.gin_trgm_ops);

-- Adds an IN parameter, which `create or replace` cannot do.
drop function if exists public.search_foods(text, integer);

create function public.search_foods(
  p_query  text,
  p_limit  integer default 25,
  p_locale text default 'en'
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
  -- Which alias caused the match, when one did. Still returned with a
  -- translated name: an English speaker searching "кюфте" wants to know why
  -- "Kyufte (grilled meatball)" came back, and the interface hides this line
  -- when the name already contains it.
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
      least(greatest(coalesce(p_limit, 25), 1), 50) as lim,
      -- An unknown locale falls back to the catalogue name rather than
      -- erroring: a stray value in a profile must not break search.
      case when p_locale in ('en', 'bg') then p_locale else 'en' end as locale
  ),
  parsed as (
    select
      q.term,
      q.lim,
      q.locale,
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
    coalesce(tr.name, f.name) as name,
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
      coalesce(tl.strength, 0),
      case
        when p.prefix_q is not null and f.search_vector @@ p.prefix_q then 0.70
        else 0
      end,
      extensions.similarity(f.name, p.term)
    )::real as score
  from public.foods f
  cross join parsed p
  -- The translation for display. Left join: a food with no translation in this
  -- locale keeps its catalogue name rather than disappearing.
  left join public.food_translations tr
    on tr.food_id = f.id and tr.locale = p.locale
  -- Translations as a SEARCH surface, in EVERY language rather than only the
  -- current one. Separate from `tr` above, which is display only.
  left join lateral (
    select
      case
        when lower(t.name) = lower(p.term) then 1.0
        when to_tsvector('pg_catalog.simple'::regconfig, t.name) @@ p.exact_q then 0.90
        when p.prefix_q is not null
             and to_tsvector('pg_catalog.simple'::regconfig, t.name) @@ p.prefix_q then 0.65
        else extensions.similarity(t.name, p.term)
      end as strength
    from public.food_translations t
    where t.food_id = f.id
      and (
        lower(t.name) = lower(p.term)
        or to_tsvector('pg_catalog.simple'::regconfig, t.name) @@ p.exact_q
        or (p.prefix_q is not null
            and to_tsvector('pg_catalog.simple'::regconfig, t.name) @@ p.prefix_q)
        or t.name operator(extensions.%) p.term
      )
    order by strength desc
    limit 1
  ) tl on true
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
      or tl.strength is not null
    )
  order by
    score desc,
    -- At equal relevance, prefer the row a human explicitly named that way. A
    -- curated alias is evidence someone decided this phrase means this food;
    -- a name that merely contains the word is not. This is what puts chicken
    -- breast ahead of chicken liver for the query "chicken".
    case when al.alias is not null then 0 else 1 end,
    -- "Milk, 3.6% fat" before "Almond milk, unsweetened" for the query "milk".
    -- Against the DISPLAYED name, so the ordering matches what is on screen.
    -- starts_with rather than LIKE: no pattern metacharacters to escape.
    case when starts_with(lower(coalesce(tr.name, f.name)), lower(p.term)) then 0 else 1 end,
    -- Curated data beats an unreviewed user entry at equal relevance.
    case f.source when 'curated' then 0 when 'usda' then 1 when 'off' then 2 else 3 end,
    f.data_quality desc,
    -- The plainer name is nearly always the one meant: "Banana" over
    -- "Banana bread, homemade".
    char_length(coalesce(tr.name, f.name)),
    coalesce(tr.name, f.name)
  limit (select lim from parsed);
$$;

comment on function public.search_foods is
  'Ranked food search over full-text (whole word AND prefix), trigram similarity, curated aliases and translations, matched in every language. Returns the name in p_locale, falling back to the catalogue name. SECURITY INVOKER so RLS on foods decides visibility.';

revoke all on function public.search_foods from public;
grant execute on function public.search_foods to authenticated;
