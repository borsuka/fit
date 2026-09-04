-- ============================================================================
-- 0023  Recipes and exercises in the user's language
-- ============================================================================
-- Migration 0022 did this for foods. The other two catalogues had the same
-- problem and one of them had it worse:
--
--   * `recipe_translations` did not exist at all, so a meal plan read
--     "Chicken, rice and broccoli" whatever the phone was set to.
--
--   * `exercise_translations` HAS existed since 0008 and carried 25 Bulgarian
--     names that nothing ever read - the workout screens select
--     `exercises.name`. Worse, `searchExercises` was an ILIKE over the English
--     name, so "клек" found nothing while the row for it sat in the table.
--
-- Same shape as foods, for the same reasons: the translation is both what a
-- row is CALLED and one more thing it can be FOUND by, and matching runs
-- across every language regardless of which one the interface is in.
-- ============================================================================

create table public.recipe_translations (
  recipe_id    uuid not null references public.recipes(id) on delete cascade,
  locale       text not null check (locale in ('en', 'bg')),
  name         text not null check (char_length(name) between 1 and 120),
  instructions text,
  primary key (recipe_id, locale)
);

alter table public.recipe_translations enable row level security;

-- Visibility follows the recipe exactly, one hop up. A translation must never
-- be readable when its recipe is not: the name is the part worth stealing.
create policy recipe_translations_read on public.recipe_translations for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_translations.recipe_id
      and (r.is_public or r.user_id = (select auth.uid()))
  ));

create index recipe_translations_fts_idx
  on public.recipe_translations
  using gin (to_tsvector('pg_catalog.simple'::regconfig, name));

create index exercise_translations_fts_idx
  on public.exercise_translations
  using gin (to_tsvector('pg_catalog.simple'::regconfig, name));

create index exercise_translations_trgm_idx
  on public.exercise_translations
  using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- The planner's candidate view carries every translation it has
-- ---------------------------------------------------------------------------
-- A jsonb map rather than a `name_bg` column: a third locale then costs a seed
-- row instead of a migration, and the view has no locale parameter to take.

create or replace view public.meal_plan_candidates
with (security_invoker = true) as
select
  r.id                         as recipe_id,
  r.name,
  r.user_id,
  r.is_public,
  r.meal_slots,
  r.prep_minutes,
  rn.kcal_per_serving          as kcal,
  rn.protein_g_per_serving     as protein_g,
  rn.carbs_g_per_serving       as carbs_g,
  rn.fat_g_per_serving         as fat_g,
  coalesce(
    (select array_agg(distinct fa.allergen_id)
       from public.recipe_ingredients ri
       join public.food_allergens fa on fa.food_id = ri.food_id
      where ri.recipe_id = r.id),
    '{}'::smallint[]
  ) as allergen_ids,
  coalesce(
    (select array_agg(distinct ri.food_id)
       from public.recipe_ingredients ri
      where ri.recipe_id = r.id),
    '{}'::uuid[]
  ) as food_ids,
  -- Slugs rather than ids: the solver is a pure function that has to be
  -- readable in a test, and `['meat-poultry']` says what a uuid cannot.
  coalesce(
    (select array_agg(distinct fc.slug)
       from public.recipe_ingredients ri
       join public.foods f           on f.id  = ri.food_id
       join public.food_categories fc on fc.id = f.category_id
      where ri.recipe_id = r.id),
    '{}'::text[]
  ) as category_slugs,
  coalesce(
    (select jsonb_object_agg(rt.locale, rt.name)
       from public.recipe_translations rt
      where rt.recipe_id = r.id),
    '{}'::jsonb
  ) as translations
from public.recipes r
join public.recipe_nutrition rn on rn.recipe_id = r.id
where array_length(r.meal_slots, 1) > 0
  -- A recipe with no ingredients has no derived nutrition, and planning around
  -- a zero-calorie meal produces a day that adds up on paper and starves in
  -- practice.
  and rn.kcal_per_serving > 0;

comment on view public.meal_plan_candidates is
  'One row per plannable recipe, with derived per-serving nutrition, aggregated allergens, ingredient categories and a locale->name map. security_invoker: RLS decides visibility.';

-- ---------------------------------------------------------------------------
-- search_exercises(query, limit, locale)
-- ---------------------------------------------------------------------------
-- Replaces an ILIKE over the English name in the client. Same three signals as
-- food search, minus the alias table exercises do not have: whole word, prefix,
-- trigram - over the name AND every translation.

create or replace function public.search_exercises(
  p_query  text default null,
  p_limit  integer default 30,
  p_locale text default 'en'
)
returns table (
  id                uuid,
  slug              text,
  name              text,
  primary_muscle    text,
  secondary_muscles text[],
  equipment         text,
  difficulty        smallint,
  movement_pattern  public.movement_pattern,
  score             real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      nullif(btrim(p_query), '') as term,
      least(greatest(coalesce(p_limit, 30), 1), 100) as lim,
      case when p_locale in ('en', 'bg') then p_locale else 'en' end as locale
  ),
  parsed as (
    select
      q.term,
      q.lim,
      q.locale,
      websearch_to_tsquery('simple', q.term) as exact_q,
      (
        select to_tsquery('simple', string_agg(quote_literal(lex) || ':*', ' & '))
        from unnest(tsvector_to_array(to_tsvector('simple', q.term))) as lex
      ) as prefix_q
    from q
  )
  select
    e.id,
    e.slug,
    coalesce(tr.name, e.name) as name,
    e.primary_muscle,
    e.secondary_muscles,
    e.equipment,
    e.difficulty,
    e.movement_pattern,
    (case
       -- An empty box is a browse, not a search. Every row scores the same and
       -- the ordering below decides, which is what makes the picker usable
       -- before anyone has typed.
       when p.term is null then 0
       else greatest(
         case when to_tsvector('pg_catalog.simple'::regconfig, e.name) @@ p.exact_q then 1.0
              else 0 end,
         case when p.prefix_q is not null
                   and to_tsvector('pg_catalog.simple'::regconfig, e.name) @@ p.prefix_q then 0.70
              else 0 end,
         coalesce(tl.strength, 0),
         extensions.similarity(e.name, p.term)
       )
     end)::real as score
  from public.exercises e
  cross join parsed p
  left join public.exercise_translations tr
    on tr.exercise_id = e.id and tr.locale = p.locale
  -- Translations as a search surface, in EVERY language rather than only the
  -- current one.
  left join lateral (
    select
      case
        when lower(t.name) = lower(p.term) then 1.0
        when to_tsvector('pg_catalog.simple'::regconfig, t.name) @@ p.exact_q then 0.95
        when p.prefix_q is not null
             and to_tsvector('pg_catalog.simple'::regconfig, t.name) @@ p.prefix_q then 0.65
        else extensions.similarity(t.name, p.term)
      end as strength
    from public.exercise_translations t
    where t.exercise_id = e.id
      and p.term is not null
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
  where e.is_public
    and (
      p.term is null
      or to_tsvector('pg_catalog.simple'::regconfig, e.name) @@ p.exact_q
      or (p.prefix_q is not null
          and to_tsvector('pg_catalog.simple'::regconfig, e.name) @@ p.prefix_q)
      or e.name operator(extensions.%) p.term
      or tl.strength is not null
    )
  order by
    score desc,
    -- Compound movements before isolation, then easier before harder. What a
    -- programme trains first is what a picker should offer first.
    case when e.movement_pattern = 'isolation' then 1 else 0 end,
    e.difficulty,
    coalesce(tr.name, e.name)
  limit (select lim from parsed);
$$;

comment on function public.search_exercises is
  'Ranked exercise search over full-text (whole word AND prefix), trigram similarity and translations, matched in every language. Returns the name in p_locale. A null query browses the whole public library.';

revoke all on function public.search_exercises from public;
grant execute on function public.search_exercises to authenticated;

-- ---------------------------------------------------------------------------
-- suggest_alternatives returns localised names too
-- ---------------------------------------------------------------------------
-- Same reason: this feeds a picker, and a picker showing English inside an
-- otherwise Bulgarian screen is the bug 0022 existed to fix.

drop function if exists public.suggest_alternatives(uuid, integer);

create function public.suggest_alternatives(
  p_exercise_id uuid,
  p_limit       integer default 8,
  p_locale      text default 'en'
)
returns table (
  id             uuid,
  slug           text,
  name           text,
  primary_muscle text,
  equipment      text,
  difficulty     smallint,
  match_rank     smallint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with source as (
    select movement_pattern, primary_muscle
      from public.exercises
     where id = p_exercise_id
  ),
  loc as (
    select case when p_locale in ('en', 'bg') then p_locale else 'en' end as locale
  )
  select
    e.id,
    e.slug,
    coalesce(tr.name, e.name) as name,
    e.primary_muscle,
    e.equipment,
    e.difficulty,
    (case
       when e.movement_pattern is not distinct from s.movement_pattern
            and e.movement_pattern is not null
            and e.primary_muscle = s.primary_muscle then 1
       when e.movement_pattern is not distinct from s.movement_pattern
            and e.movement_pattern is not null then 2
       else 3
     end)::smallint as match_rank
  from public.exercises e
  cross join source s
  cross join loc
  left join public.exercise_translations tr
    on tr.exercise_id = e.id and tr.locale = loc.locale
  where e.id <> p_exercise_id
    and e.is_public
    and (
      (e.movement_pattern is not distinct from s.movement_pattern
       and e.movement_pattern is not null)
      or e.primary_muscle = s.primary_muscle
    )
  -- Easier first within a rank: someone swapping an exercise out is usually
  -- swapping away from something they cannot do, not towards something harder.
  order by match_rank, e.difficulty, coalesce(tr.name, e.name)
  limit greatest(p_limit, 1);
$$;

comment on function public.suggest_alternatives is
  'Ranked substitutions for one exercise: same pattern and muscle first, then same pattern, then same muscle. Names in p_locale. Returns nothing rather than an unrelated exercise.';

revoke all on function public.suggest_alternatives from public;
grant execute on function public.suggest_alternatives to authenticated;
