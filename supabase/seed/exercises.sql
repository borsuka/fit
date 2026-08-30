-- ============================================================================
-- Exercise library
-- ============================================================================
-- Compound movements first within each group, because that is the order most
-- programmes train them and the order a picker should offer them.
-- ============================================================================

insert into public.exercises (slug, name, primary_muscle, secondary_muscles, equipment, difficulty)
values
  -- Chest
  ('barbell-bench-press',   'Barbell bench press',   'chest',     '{triceps,shoulders}', 'barbell',    2),
  ('incline-bench-press',   'Incline bench press',   'chest',     '{shoulders,triceps}', 'barbell',    2),
  ('dumbbell-bench-press',  'Dumbbell bench press',  'chest',     '{triceps,shoulders}', 'dumbbell',   2),
  ('dumbbell-fly',          'Dumbbell fly',          'chest',     '{shoulders}',         'dumbbell',   2),
  ('push-up',               'Push-up',               'chest',     '{triceps,core}',      'bodyweight', 1),
  ('cable-crossover',       'Cable crossover',       'chest',     '{shoulders}',         'cable',      2),

  -- Back
  ('deadlift',              'Deadlift',              'back',      '{hamstrings,glutes,forearms}', 'barbell', 3),
  ('barbell-row',           'Barbell row',           'back',      '{biceps,forearms}',   'barbell',    2),
  ('pull-up',               'Pull-up',               'back',      '{biceps,forearms}',   'bodyweight', 3),
  ('lat-pulldown',          'Lat pulldown',          'back',      '{biceps}',            'cable',      1),
  ('seated-cable-row',      'Seated cable row',      'back',      '{biceps,shoulders}',  'cable',      1),
  ('dumbbell-row',          'Dumbbell row',          'back',      '{biceps}',            'dumbbell',   1),

  -- Shoulders
  ('overhead-press',        'Overhead press',        'shoulders', '{triceps,core}',      'barbell',    2),
  ('dumbbell-shoulder-press','Dumbbell shoulder press','shoulders','{triceps}',          'dumbbell',   2),
  ('lateral-raise',         'Lateral raise',         'shoulders', '{}',                  'dumbbell',   1),
  ('face-pull',             'Face pull',             'shoulders', '{back}',              'cable',      1),
  ('rear-delt-fly',         'Rear delt fly',         'shoulders', '{back}',              'dumbbell',   1),

  -- Arms
  ('barbell-curl',          'Barbell curl',          'biceps',    '{forearms}',          'barbell',    1),
  ('dumbbell-curl',         'Dumbbell curl',         'biceps',    '{forearms}',          'dumbbell',   1),
  ('hammer-curl',           'Hammer curl',           'biceps',    '{forearms}',          'dumbbell',   1),
  ('close-grip-bench',      'Close-grip bench press','triceps',   '{chest,shoulders}',   'barbell',    2),
  ('triceps-pushdown',      'Triceps pushdown',      'triceps',   '{}',                  'cable',      1),
  ('overhead-extension',    'Overhead triceps extension','triceps','{}',                 'dumbbell',   1),
  ('dip',                   'Dip',                   'triceps',   '{chest,shoulders}',   'bodyweight', 2),

  -- Legs
  ('back-squat',            'Back squat',            'quads',     '{glutes,hamstrings,core}', 'barbell', 3),
  ('front-squat',           'Front squat',           'quads',     '{glutes,core}',       'barbell',    3),
  ('leg-press',             'Leg press',             'quads',     '{glutes,hamstrings}', 'machine',    1),
  ('lunge',                 'Lunge',                 'quads',     '{glutes,hamstrings}', 'dumbbell',   2),
  ('leg-extension',         'Leg extension',         'quads',     '{}',                  'machine',    1),
  ('romanian-deadlift',     'Romanian deadlift',     'hamstrings','{glutes,back}',       'barbell',    2),
  ('leg-curl',              'Leg curl',              'hamstrings','{}',                  'machine',    1),
  ('hip-thrust',            'Hip thrust',            'glutes',    '{hamstrings}',        'barbell',    2),
  ('bulgarian-split-squat', 'Bulgarian split squat', 'glutes',    '{quads,hamstrings}',  'dumbbell',   2),
  ('standing-calf-raise',   'Standing calf raise',   'calves',    '{}',                  'machine',    1),

  -- Core
  ('plank',                 'Plank',                 'core',      '{shoulders}',         'bodyweight', 1),
  ('hanging-leg-raise',     'Hanging leg raise',     'core',      '{forearms}',          'bodyweight', 2),
  ('cable-crunch',          'Cable crunch',          'core',      '{}',                  'cable',      1),
  ('russian-twist',         'Russian twist',         'core',      '{}',                  'bodyweight', 1),

  -- Full body
  ('kettlebell-swing',      'Kettlebell swing',      'full_body', '{glutes,hamstrings,back}', 'kettlebell', 2),
  ('burpee',                'Burpee',                'full_body', '{chest,quads,core}',  'bodyweight', 2)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Bulgarian names. Kept in a translation table rather than duplicated rows, so
-- a session logged in one language reads correctly in the other.
-- ---------------------------------------------------------------------------

insert into public.exercise_translations (exercise_id, locale, name)
select e.id, 'bg', t.name
from (values
  ('barbell-bench-press',    'Лежанка с щанга'),
  ('incline-bench-press',    'Наклонена лежанка'),
  ('dumbbell-bench-press',   'Лежанка с дъмбели'),
  ('push-up',                'Лицева опора'),
  ('deadlift',               'Мъртва тяга'),
  ('barbell-row',            'Гребане с щанга'),
  ('pull-up',                'Набиране'),
  ('lat-pulldown',           'Дърпане на лат машина'),
  ('overhead-press',         'Раменна преса'),
  ('lateral-raise',          'Странично повдигане'),
  ('barbell-curl',           'Сгъване с щанга'),
  ('dumbbell-curl',          'Сгъване с дъмбели'),
  ('triceps-pushdown',       'Трицепс на скрипец'),
  ('dip',                    'Кофички'),
  ('back-squat',             'Клек с щанга'),
  ('front-squat',            'Преден клек'),
  ('leg-press',              'Лег преса'),
  ('lunge',                  'Напад'),
  ('romanian-deadlift',      'Румънска тяга'),
  ('leg-curl',               'Сгъване за бедра'),
  ('hip-thrust',             'Тазово повдигане'),
  ('standing-calf-raise',    'Повдигане на прасци'),
  ('plank',                  'Планк'),
  ('kettlebell-swing',       'Замах с пудовка'),
  ('burpee',                 'Бърпи')
) as t(slug, name)
join public.exercises e on e.slug = t.slug
on conflict do nothing;
