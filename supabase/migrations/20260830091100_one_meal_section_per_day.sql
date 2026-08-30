-- ============================================================================
-- 0012  One meal section per type per day
-- ============================================================================
-- The diary shows Breakfast / Lunch / Dinner / Snack as sections for a given
-- day, and food goes INTO a section. Two "lunch" rows on the same date is not
-- a state the UI can render - it would silently show one section and hide the
-- other's items, which reads as lost data.
--
-- The constraint also makes adding food a single upsert on the conflict target
-- instead of a read-then-insert, closing the race where two quick taps create
-- two sections.
-- ============================================================================

-- Collapse any duplicates before the index refuses them. There is no
-- production data yet, but a migration that only works on an empty table is a
-- migration that fails the first time it matters.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, local_date, meal_type
           order by created_at, id
         ) as rn,
         first_value(id) over (
           partition by user_id, local_date, meal_type
           order by created_at, id
         ) as keeper
    from public.meals
)
update public.meal_items mi
   set meal_id = r.keeper
  from ranked r
 where mi.meal_id = r.id
   and r.rn > 1;

delete from public.meals m
 using (
   select id,
          row_number() over (
            partition by user_id, local_date, meal_type
            order by created_at, id
          ) as rn
     from public.meals
 ) d
 where m.id = d.id and d.rn > 1;

create unique index meals_one_section_per_day
  on public.meals (user_id, local_date, meal_type);

comment on index public.meals_one_section_per_day is
  'A day has one Breakfast, one Lunch, one Dinner and one Snack section. Items belong to a section.';
