-- ============================================================================
-- Extended exercise library
-- ============================================================================
-- The starter library was 40 movements - enough to express the ten seeded
-- programmes and not much else. That shows up in one place in particular:
-- `suggest_alternatives` can only offer what exists, so a lifter swapping out
-- a barbell bench press in a gym with no bench had three options and two of
-- them also needed a barbell.
--
-- Every row carries a movement_pattern from the start. It is what substitution
-- ranks on, and an exercise without one can only ever be offered as a
-- same-muscle match.
--
-- Bulgarian names are in translations_bg.sql, and a pgTAP test fails if a new
-- exercise arrives without one.
-- ============================================================================

insert into public.exercises
  (slug, name, primary_muscle, secondary_muscles, equipment, difficulty, movement_pattern)
values
  -- Chest
  ('incline-dumbbell-press', 'Incline dumbbell press', 'chest', '{shoulders,triceps}', 'dumbbell', 2, 'horizontal_push'),
  ('decline-bench-press',    'Decline bench press',    'chest', '{triceps}',           'barbell',  2, 'horizontal_push'),
  ('machine-chest-press',    'Machine chest press',    'chest', '{triceps,shoulders}', 'machine',  1, 'horizontal_push'),
  ('pec-deck',               'Pec deck',               'chest', '{shoulders}',         'machine',  1, 'isolation'),
  ('incline-push-up',        'Incline push-up',        'chest', '{triceps,core}',      'bodyweight', 1, 'horizontal_push'),

  -- Back
  ('t-bar-row',              'T-bar row',              'back', '{biceps,forearms}',    'barbell',  2, 'horizontal_pull'),
  ('chin-up',                'Chin-up',                'back', '{biceps,forearms}',    'bodyweight', 3, 'vertical_pull'),
  ('chest-supported-row',    'Chest-supported row',    'back', '{biceps,shoulders}',   'machine',  1, 'horizontal_pull'),
  ('straight-arm-pulldown',  'Straight-arm pulldown',  'back', '{triceps}',            'cable',    1, 'isolation'),
  ('shrug',                  'Shrug',                  'back', '{forearms}',           'dumbbell', 1, 'isolation'),
  ('good-morning',           'Good morning',           'back', '{hamstrings,glutes}',  'barbell',  3, 'hinge'),
  ('inverted-row',           'Inverted row',           'back', '{biceps,core}',        'bodyweight', 2, 'horizontal_pull'),

  -- Shoulders
  ('arnold-press',           'Arnold press',           'shoulders', '{triceps}',       'dumbbell', 2, 'vertical_push'),
  ('machine-shoulder-press', 'Machine shoulder press', 'shoulders', '{triceps}',       'machine',  1, 'vertical_push'),
  ('cable-lateral-raise',    'Cable lateral raise',    'shoulders', '{}',              'cable',    1, 'isolation'),
  ('front-raise',            'Front raise',            'shoulders', '{chest}',         'dumbbell', 1, 'isolation'),
  ('upright-row',            'Upright row',            'shoulders', '{biceps,back}',   'barbell',  2, 'vertical_pull'),

  -- Arms
  ('preacher-curl',          'Preacher curl',          'biceps',  '{forearms}',        'barbell',  1, 'isolation'),
  ('cable-curl',             'Cable curl',             'biceps',  '{forearms}',        'cable',    1, 'isolation'),
  ('concentration-curl',     'Concentration curl',     'biceps',  '{forearms}',        'dumbbell', 1, 'isolation'),
  ('incline-dumbbell-curl',  'Incline dumbbell curl',  'biceps',  '{forearms}',        'dumbbell', 2, 'isolation'),
  ('skull-crusher',          'Skull crusher',          'triceps', '{}',                'barbell',  2, 'isolation'),
  ('rope-pushdown',          'Rope pushdown',          'triceps', '{}',                'cable',    1, 'isolation'),
  ('bench-dip',              'Bench dip',              'triceps', '{chest,shoulders}', 'bodyweight', 1, 'vertical_push'),
  ('reverse-curl',           'Reverse curl',           'forearms','{biceps}',          'barbell',  1, 'isolation'),
  ('wrist-curl',             'Wrist curl',             'forearms','{}',                'dumbbell', 1, 'isolation'),

  -- Legs
  ('hack-squat',             'Hack squat',             'quads',      '{glutes}',       'machine',  2, 'squat'),
  ('goblet-squat',           'Goblet squat',           'quads',      '{glutes,core}',  'dumbbell', 1, 'squat'),
  ('box-squat',              'Box squat',              'quads',      '{glutes,hamstrings}', 'barbell', 2, 'squat'),
  ('sumo-deadlift',          'Sumo deadlift',          'hamstrings', '{glutes,back,quads}', 'barbell', 3, 'hinge'),
  ('trap-bar-deadlift',      'Trap bar deadlift',      'hamstrings', '{glutes,quads,back}', 'barbell', 2, 'hinge'),
  ('nordic-curl',            'Nordic hamstring curl',  'hamstrings', '{glutes,core}',  'bodyweight', 3, 'isolation'),
  ('step-up',                'Step-up',                'glutes',     '{quads,hamstrings}', 'dumbbell', 1, 'lunge'),
  ('walking-lunge',          'Walking lunge',          'glutes',     '{quads,hamstrings}', 'dumbbell', 2, 'lunge'),
  ('glute-bridge',           'Glute bridge',           'glutes',     '{hamstrings,core}', 'bodyweight', 1, 'hinge'),
  ('hip-abduction',          'Hip abduction',          'glutes',     '{}',             'machine',  1, 'isolation'),
  ('seated-calf-raise',      'Seated calf raise',      'calves',     '{}',             'machine',  1, 'isolation'),

  -- Core
  ('ab-wheel-rollout',       'Ab wheel rollout',       'core', '{shoulders,back}',     'other',    3, 'core'),
  ('side-plank',             'Side plank',             'core', '{shoulders,glutes}',   'bodyweight', 1, 'core'),
  ('dead-bug',               'Dead bug',               'core', '{}',                   'bodyweight', 1, 'core'),
  ('sit-up',                 'Sit-up',                 'core', '{}',                   'bodyweight', 1, 'core'),
  ('mountain-climber',       'Mountain climber',       'core', '{shoulders,quads}',    'bodyweight', 1, 'conditioning'),

  -- Conditioning and carries
  ('rowing-machine',         'Rowing machine',         'full_body', '{back,quads,core}', 'machine', 1, 'conditioning'),
  ('treadmill-run',          'Treadmill run',          'full_body', '{quads,calves}',  'machine',  1, 'conditioning'),
  ('stationary-bike',        'Stationary bike',        'full_body', '{quads,calves}',  'machine',  1, 'conditioning'),
  ('jump-rope',              'Jump rope',              'full_body', '{calves,shoulders}', 'other', 1, 'conditioning'),
  ('farmers-walk',           'Farmer''s walk',         'full_body', '{forearms,core,back}', 'dumbbell', 2, 'conditioning')
on conflict (slug) do nothing;
