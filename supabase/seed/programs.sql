-- ============================================================================
-- Movement patterns and the programme catalogue
-- ============================================================================
-- Ten well-known programmes, named and attributed. They are other people's
-- work; the app reproduces the structure (which lifts, how many sets, how many
-- reps) because that is what a training programme is, and credits the author.
--
-- Loading and progression are NOT prescribed here. Every one of these
-- programmes sets its weights from the lifter's own performance, and a seeded
-- kilo figure would be a number invented for a person we have never met. The
-- progression hint on the session screen derives it from what they lifted last
-- time, which is what these programmes actually say to do.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Movement patterns on the exercise library.
-- ---------------------------------------------------------------------------

update public.exercises set movement_pattern = v.pattern::public.movement_pattern
from (values
  ('barbell-bench-press',      'horizontal_push'),
  ('incline-bench-press',      'horizontal_push'),
  ('dumbbell-bench-press',     'horizontal_push'),
  ('push-up',                  'horizontal_push'),
  ('close-grip-bench',         'horizontal_push'),
  ('dumbbell-fly',             'isolation'),
  ('cable-crossover',          'isolation'),

  ('overhead-press',           'vertical_push'),
  ('dumbbell-shoulder-press',  'vertical_push'),
  ('dip',                      'vertical_push'),
  ('lateral-raise',            'isolation'),
  ('rear-delt-fly',            'isolation'),

  ('barbell-row',              'horizontal_pull'),
  ('seated-cable-row',         'horizontal_pull'),
  ('dumbbell-row',             'horizontal_pull'),
  ('face-pull',                'horizontal_pull'),

  ('pull-up',                  'vertical_pull'),
  ('lat-pulldown',             'vertical_pull'),

  ('back-squat',               'squat'),
  ('front-squat',              'squat'),
  ('leg-press',                'squat'),
  ('leg-extension',            'isolation'),

  ('deadlift',                 'hinge'),
  ('romanian-deadlift',        'hinge'),
  ('hip-thrust',               'hinge'),
  ('kettlebell-swing',         'hinge'),
  ('leg-curl',                 'isolation'),

  ('lunge',                    'lunge'),
  ('bulgarian-split-squat',    'lunge'),

  ('barbell-curl',             'isolation'),
  ('dumbbell-curl',            'isolation'),
  ('hammer-curl',              'isolation'),
  ('triceps-pushdown',         'isolation'),
  ('overhead-extension',       'isolation'),
  ('standing-calf-raise',      'isolation'),

  ('plank',                    'core'),
  ('hanging-leg-raise',        'core'),
  ('cable-crunch',             'core'),
  ('russian-twist',            'core'),

  ('burpee',                   'conditioning')
) as v(slug, pattern)
where public.exercises.slug = v.slug;

-- ---------------------------------------------------------------------------
-- Programmes
-- ---------------------------------------------------------------------------

insert into public.programs
  (id, slug, name, author, focus, experience, days_per_week, sort_order, description)
values
  ('a0000000-0000-4000-8000-000000000001', 'stronglifts-5x5', 'StrongLifts 5x5',
   'Mehdi Hadim', 'strength', 1, 3, 10,
   'Two alternating full-body sessions, five sets of five on the main lifts. Add weight every session for as long as it keeps working. The most common first barbell programme, and hard to beat as one.'),

  ('a0000000-0000-4000-8000-000000000002', 'starting-strength', 'Starting Strength',
   'Mark Rippetoe', 'strength', 1, 3, 20,
   'Three sets of five on a handful of barbell lifts, alternating two sessions. Fewer working sets than 5x5 and a heavier deadlift day.'),

  ('a0000000-0000-4000-8000-000000000003', 'full-body-3x', 'Full body, three days',
   null, 'general', 1, 3, 30,
   'One session trained three times a week. The simplest thing that works when you have three days and no interest in a split.'),

  ('a0000000-0000-4000-8000-000000000004', 'upper-lower', 'Upper / lower split',
   null, 'hypertrophy', 2, 4, 40,
   'Four days: upper body twice, lower body twice. Every muscle gets trained twice a week, which is where most of the evidence points.'),

  ('a0000000-0000-4000-8000-000000000005', 'push-pull-legs', 'Push / pull / legs',
   null, 'hypertrophy', 2, 6, 50,
   'Pressing, pulling and legs on separate days, run twice a week. Six sessions, and the most popular split in any gym for a reason.'),

  ('a0000000-0000-4000-8000-000000000006', 'phul', 'PHUL - power hypertrophy upper lower',
   'Brandon Campbell', 'hypertrophy', 2, 4, 60,
   'Upper / lower run twice: the first pair heavy and low-rep, the second lighter and higher-rep. Strength and size in one week.'),

  ('a0000000-0000-4000-8000-000000000007', 'wendler-531', '5/3/1',
   'Jim Wendler', 'strength', 2, 4, 70,
   'One main lift per day on a four-week wave, then assistance work. Built for the long run: the progression is monthly, not per session.'),

  ('a0000000-0000-4000-8000-000000000008', 'gzclp', 'GZCLP',
   'Cody Lefever', 'strength', 2, 4, 80,
   'Three tiers a day - a heavy main lift, a volume second lift, and accessories. Linear progression with a built-in answer for when you stall.'),

  ('a0000000-0000-4000-8000-000000000009', 'texas-method', 'Texas method',
   'Mark Rippetoe and Glenn Pendlay', 'strength', 3, 3, 90,
   'Volume Monday, light Wednesday, a new personal record Friday. What to run when adding weight every session has stopped working.'),

  ('a0000000-0000-4000-8000-00000000000a', 'bodyweight-basics', 'Bodyweight basics',
   null, 'general', 1, 3, 100,
   'No barbell, no gym. Three full-body sessions built from push-ups, pull-ups, split squats and core work.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Days
-- ---------------------------------------------------------------------------

insert into public.program_days (id, program_id, day_index, name) values
  -- StrongLifts 5x5
  ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 0, 'Workout A'),
  ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 1, 'Workout B'),

  -- Starting Strength
  ('b0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000002', 0, 'Workout A'),
  ('b0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000002', 1, 'Workout B'),

  -- Full body 3x
  ('b0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000003', 0, 'Full body'),

  -- Upper / lower
  ('b0000000-0000-4000-8000-000000000040', 'a0000000-0000-4000-8000-000000000004', 0, 'Upper A'),
  ('b0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000004', 1, 'Lower A'),
  ('b0000000-0000-4000-8000-000000000042', 'a0000000-0000-4000-8000-000000000004', 2, 'Upper B'),
  ('b0000000-0000-4000-8000-000000000043', 'a0000000-0000-4000-8000-000000000004', 3, 'Lower B'),

  -- Push / pull / legs
  ('b0000000-0000-4000-8000-000000000050', 'a0000000-0000-4000-8000-000000000005', 0, 'Push'),
  ('b0000000-0000-4000-8000-000000000051', 'a0000000-0000-4000-8000-000000000005', 1, 'Pull'),
  ('b0000000-0000-4000-8000-000000000052', 'a0000000-0000-4000-8000-000000000005', 2, 'Legs'),

  -- PHUL
  ('b0000000-0000-4000-8000-000000000060', 'a0000000-0000-4000-8000-000000000006', 0, 'Upper power'),
  ('b0000000-0000-4000-8000-000000000061', 'a0000000-0000-4000-8000-000000000006', 1, 'Lower power'),
  ('b0000000-0000-4000-8000-000000000062', 'a0000000-0000-4000-8000-000000000006', 2, 'Upper hypertrophy'),
  ('b0000000-0000-4000-8000-000000000063', 'a0000000-0000-4000-8000-000000000006', 3, 'Lower hypertrophy'),

  -- 5/3/1
  ('b0000000-0000-4000-8000-000000000070', 'a0000000-0000-4000-8000-000000000007', 0, 'Overhead press day'),
  ('b0000000-0000-4000-8000-000000000071', 'a0000000-0000-4000-8000-000000000007', 1, 'Deadlift day'),
  ('b0000000-0000-4000-8000-000000000072', 'a0000000-0000-4000-8000-000000000007', 2, 'Bench press day'),
  ('b0000000-0000-4000-8000-000000000073', 'a0000000-0000-4000-8000-000000000007', 3, 'Squat day'),

  -- GZCLP
  ('b0000000-0000-4000-8000-000000000080', 'a0000000-0000-4000-8000-000000000008', 0, 'Squat / bench'),
  ('b0000000-0000-4000-8000-000000000081', 'a0000000-0000-4000-8000-000000000008', 1, 'Overhead press / deadlift'),
  ('b0000000-0000-4000-8000-000000000082', 'a0000000-0000-4000-8000-000000000008', 2, 'Bench / squat'),
  ('b0000000-0000-4000-8000-000000000083', 'a0000000-0000-4000-8000-000000000008', 3, 'Deadlift / overhead press'),

  -- Texas method
  ('b0000000-0000-4000-8000-000000000090', 'a0000000-0000-4000-8000-000000000009', 0, 'Volume day'),
  ('b0000000-0000-4000-8000-000000000091', 'a0000000-0000-4000-8000-000000000009', 1, 'Light day'),
  ('b0000000-0000-4000-8000-000000000092', 'a0000000-0000-4000-8000-000000000009', 2, 'Intensity day'),

  -- Bodyweight basics
  ('b0000000-0000-4000-8000-0000000000a0', 'a0000000-0000-4000-8000-00000000000a', 0, 'Session A'),
  ('b0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a', 1, 'Session B')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Exercises within each day.
-- Joined on slug so a renumbered exercise library does not silently repoint a
-- programme at the wrong lift.
-- ---------------------------------------------------------------------------

insert into public.program_exercises
  (program_day_id, exercise_id, sort_order, target_sets, target_reps, rest_seconds)
select d.day_id::uuid, e.id, d.sort_order::smallint, d.sets::smallint, d.reps::smallint,
       d.rest::smallint
from (values
  -- StrongLifts A: squat, bench, row
  ('b0000000-0000-4000-8000-000000000010', 'back-squat',            0, 5, 5, 180),
  ('b0000000-0000-4000-8000-000000000010', 'barbell-bench-press',   1, 5, 5, 180),
  ('b0000000-0000-4000-8000-000000000010', 'barbell-row',           2, 5, 5, 180),
  -- StrongLifts B: squat, press, deadlift (one set of five)
  ('b0000000-0000-4000-8000-000000000011', 'back-squat',            0, 5, 5, 180),
  ('b0000000-0000-4000-8000-000000000011', 'overhead-press',        1, 5, 5, 180),
  ('b0000000-0000-4000-8000-000000000011', 'deadlift',              2, 1, 5, 240),

  -- Starting Strength A
  ('b0000000-0000-4000-8000-000000000020', 'back-squat',            0, 3, 5, 180),
  ('b0000000-0000-4000-8000-000000000020', 'barbell-bench-press',   1, 3, 5, 180),
  ('b0000000-0000-4000-8000-000000000020', 'deadlift',              2, 1, 5, 240),
  -- Starting Strength B
  ('b0000000-0000-4000-8000-000000000021', 'back-squat',            0, 3, 5, 180),
  ('b0000000-0000-4000-8000-000000000021', 'overhead-press',        1, 3, 5, 180),
  ('b0000000-0000-4000-8000-000000000021', 'barbell-row',           2, 3, 5, 180),

  -- Full body 3x
  ('b0000000-0000-4000-8000-000000000030', 'back-squat',            0, 3, 8, 150),
  ('b0000000-0000-4000-8000-000000000030', 'barbell-bench-press',   1, 3, 8, 150),
  ('b0000000-0000-4000-8000-000000000030', 'barbell-row',           2, 3, 8, 150),
  ('b0000000-0000-4000-8000-000000000030', 'romanian-deadlift',     3, 3, 10, 120),
  ('b0000000-0000-4000-8000-000000000030', 'overhead-press',        4, 3, 10, 120),
  ('b0000000-0000-4000-8000-000000000030', 'plank',                 5, 3, 45, 60),

  -- Upper A
  ('b0000000-0000-4000-8000-000000000040', 'barbell-bench-press',   0, 4, 6, 150),
  ('b0000000-0000-4000-8000-000000000040', 'barbell-row',           1, 4, 6, 150),
  ('b0000000-0000-4000-8000-000000000040', 'overhead-press',        2, 3, 8, 120),
  ('b0000000-0000-4000-8000-000000000040', 'lat-pulldown',          3, 3, 10, 90),
  ('b0000000-0000-4000-8000-000000000040', 'barbell-curl',          4, 3, 12, 60),
  ('b0000000-0000-4000-8000-000000000040', 'triceps-pushdown',      5, 3, 12, 60),
  -- Lower A
  ('b0000000-0000-4000-8000-000000000041', 'back-squat',            0, 4, 6, 180),
  ('b0000000-0000-4000-8000-000000000041', 'romanian-deadlift',     1, 3, 8, 150),
  ('b0000000-0000-4000-8000-000000000041', 'leg-press',             2, 3, 12, 90),
  ('b0000000-0000-4000-8000-000000000041', 'leg-curl',              3, 3, 12, 60),
  ('b0000000-0000-4000-8000-000000000041', 'standing-calf-raise',   4, 4, 15, 45),
  -- Upper B
  ('b0000000-0000-4000-8000-000000000042', 'incline-bench-press',   0, 4, 8, 150),
  ('b0000000-0000-4000-8000-000000000042', 'pull-up',               1, 4, 8, 150),
  ('b0000000-0000-4000-8000-000000000042', 'dumbbell-shoulder-press', 2, 3, 10, 120),
  ('b0000000-0000-4000-8000-000000000042', 'seated-cable-row',      3, 3, 12, 90),
  ('b0000000-0000-4000-8000-000000000042', 'lateral-raise',         4, 3, 15, 60),
  ('b0000000-0000-4000-8000-000000000042', 'hammer-curl',           5, 3, 12, 60),
  -- Lower B
  ('b0000000-0000-4000-8000-000000000043', 'deadlift',              0, 3, 5, 210),
  ('b0000000-0000-4000-8000-000000000043', 'front-squat',           1, 3, 8, 150),
  ('b0000000-0000-4000-8000-000000000043', 'bulgarian-split-squat', 2, 3, 10, 90),
  ('b0000000-0000-4000-8000-000000000043', 'hip-thrust',            3, 3, 12, 90),
  ('b0000000-0000-4000-8000-000000000043', 'hanging-leg-raise',     4, 3, 12, 60),

  -- Push
  ('b0000000-0000-4000-8000-000000000050', 'barbell-bench-press',   0, 4, 8, 150),
  ('b0000000-0000-4000-8000-000000000050', 'overhead-press',        1, 4, 8, 150),
  ('b0000000-0000-4000-8000-000000000050', 'incline-bench-press',   2, 3, 10, 120),
  ('b0000000-0000-4000-8000-000000000050', 'lateral-raise',         3, 3, 15, 60),
  ('b0000000-0000-4000-8000-000000000050', 'triceps-pushdown',      4, 3, 12, 60),
  ('b0000000-0000-4000-8000-000000000050', 'overhead-extension',    5, 3, 12, 60),
  -- Pull
  ('b0000000-0000-4000-8000-000000000051', 'deadlift',              0, 3, 5, 210),
  ('b0000000-0000-4000-8000-000000000051', 'pull-up',               1, 4, 8, 150),
  ('b0000000-0000-4000-8000-000000000051', 'barbell-row',           2, 4, 8, 150),
  ('b0000000-0000-4000-8000-000000000051', 'seated-cable-row',      3, 3, 12, 90),
  ('b0000000-0000-4000-8000-000000000051', 'face-pull',             4, 3, 15, 60),
  ('b0000000-0000-4000-8000-000000000051', 'barbell-curl',          5, 3, 12, 60),
  -- Legs
  ('b0000000-0000-4000-8000-000000000052', 'back-squat',            0, 4, 8, 180),
  ('b0000000-0000-4000-8000-000000000052', 'romanian-deadlift',     1, 3, 10, 150),
  ('b0000000-0000-4000-8000-000000000052', 'leg-press',             2, 3, 12, 90),
  ('b0000000-0000-4000-8000-000000000052', 'leg-curl',              3, 3, 12, 60),
  ('b0000000-0000-4000-8000-000000000052', 'standing-calf-raise',   4, 4, 15, 45),
  ('b0000000-0000-4000-8000-000000000052', 'plank',                 5, 3, 45, 60),

  -- PHUL upper power
  ('b0000000-0000-4000-8000-000000000060', 'barbell-bench-press',   0, 4, 5, 180),
  ('b0000000-0000-4000-8000-000000000060', 'barbell-row',           1, 4, 5, 180),
  ('b0000000-0000-4000-8000-000000000060', 'overhead-press',        2, 3, 6, 150),
  ('b0000000-0000-4000-8000-000000000060', 'pull-up',               3, 3, 6, 150),
  ('b0000000-0000-4000-8000-000000000060', 'close-grip-bench',      4, 3, 8, 120),
  -- PHUL lower power
  ('b0000000-0000-4000-8000-000000000061', 'back-squat',            0, 4, 5, 210),
  ('b0000000-0000-4000-8000-000000000061', 'deadlift',              1, 3, 5, 210),
  ('b0000000-0000-4000-8000-000000000061', 'leg-press',             2, 3, 10, 120),
  ('b0000000-0000-4000-8000-000000000061', 'standing-calf-raise',   3, 4, 10, 60),
  -- PHUL upper hypertrophy
  ('b0000000-0000-4000-8000-000000000062', 'incline-bench-press',   0, 4, 12, 90),
  ('b0000000-0000-4000-8000-000000000062', 'seated-cable-row',      1, 4, 12, 90),
  ('b0000000-0000-4000-8000-000000000062', 'dumbbell-fly',          2, 3, 15, 60),
  ('b0000000-0000-4000-8000-000000000062', 'lat-pulldown',          3, 3, 12, 90),
  ('b0000000-0000-4000-8000-000000000062', 'lateral-raise',         4, 3, 15, 60),
  ('b0000000-0000-4000-8000-000000000062', 'dumbbell-curl',         5, 3, 12, 60),
  ('b0000000-0000-4000-8000-000000000062', 'triceps-pushdown',      6, 3, 12, 60),
  -- PHUL lower hypertrophy
  ('b0000000-0000-4000-8000-000000000063', 'front-squat',           0, 3, 12, 120),
  ('b0000000-0000-4000-8000-000000000063', 'lunge',                 1, 3, 12, 90),
  ('b0000000-0000-4000-8000-000000000063', 'leg-extension',         2, 3, 15, 60),
  ('b0000000-0000-4000-8000-000000000063', 'leg-curl',              3, 3, 15, 60),
  ('b0000000-0000-4000-8000-000000000063', 'standing-calf-raise',   4, 4, 20, 45),

  -- 5/3/1 press day
  ('b0000000-0000-4000-8000-000000000070', 'overhead-press',        0, 3, 5, 210),
  ('b0000000-0000-4000-8000-000000000070', 'dip',                   1, 5, 10, 90),
  ('b0000000-0000-4000-8000-000000000070', 'lat-pulldown',          2, 5, 10, 90),
  ('b0000000-0000-4000-8000-000000000070', 'hanging-leg-raise',     3, 3, 12, 60),
  -- 5/3/1 deadlift day
  ('b0000000-0000-4000-8000-000000000071', 'deadlift',              0, 3, 5, 240),
  ('b0000000-0000-4000-8000-000000000071', 'romanian-deadlift',     1, 5, 10, 120),
  ('b0000000-0000-4000-8000-000000000071', 'hanging-leg-raise',     2, 5, 12, 60),
  -- 5/3/1 bench day
  ('b0000000-0000-4000-8000-000000000072', 'barbell-bench-press',   0, 3, 5, 210),
  ('b0000000-0000-4000-8000-000000000072', 'dumbbell-bench-press',  1, 5, 10, 90),
  ('b0000000-0000-4000-8000-000000000072', 'dumbbell-row',          2, 5, 10, 90),
  ('b0000000-0000-4000-8000-000000000072', 'triceps-pushdown',      3, 3, 12, 60),
  -- 5/3/1 squat day
  ('b0000000-0000-4000-8000-000000000073', 'back-squat',            0, 3, 5, 240),
  ('b0000000-0000-4000-8000-000000000073', 'leg-press',             1, 5, 10, 120),
  ('b0000000-0000-4000-8000-000000000073', 'leg-curl',              2, 5, 10, 90),
  ('b0000000-0000-4000-8000-000000000073', 'cable-crunch',          3, 3, 15, 60),

  -- GZCLP day 1
  ('b0000000-0000-4000-8000-000000000080', 'back-squat',            0, 5, 3, 180),
  ('b0000000-0000-4000-8000-000000000080', 'barbell-bench-press',   1, 3, 10, 120),
  ('b0000000-0000-4000-8000-000000000080', 'lat-pulldown',          2, 3, 15, 90),
  -- GZCLP day 2
  ('b0000000-0000-4000-8000-000000000081', 'overhead-press',        0, 5, 3, 180),
  ('b0000000-0000-4000-8000-000000000081', 'deadlift',              1, 3, 10, 150),
  ('b0000000-0000-4000-8000-000000000081', 'dumbbell-row',          2, 3, 15, 90),
  -- GZCLP day 3
  ('b0000000-0000-4000-8000-000000000082', 'barbell-bench-press',   0, 5, 3, 180),
  ('b0000000-0000-4000-8000-000000000082', 'back-squat',            1, 3, 10, 150),
  ('b0000000-0000-4000-8000-000000000082', 'seated-cable-row',      2, 3, 15, 90),
  -- GZCLP day 4
  ('b0000000-0000-4000-8000-000000000083', 'deadlift',              0, 5, 3, 210),
  ('b0000000-0000-4000-8000-000000000083', 'overhead-press',        1, 3, 10, 120),
  ('b0000000-0000-4000-8000-000000000083', 'pull-up',               2, 3, 12, 90),

  -- Texas volume day
  ('b0000000-0000-4000-8000-000000000090', 'back-squat',            0, 5, 5, 240),
  ('b0000000-0000-4000-8000-000000000090', 'barbell-bench-press',   1, 5, 5, 210),
  ('b0000000-0000-4000-8000-000000000090', 'romanian-deadlift',     2, 3, 5, 180),
  -- Texas light day
  ('b0000000-0000-4000-8000-000000000091', 'back-squat',            0, 2, 5, 180),
  ('b0000000-0000-4000-8000-000000000091', 'overhead-press',        1, 3, 5, 180),
  ('b0000000-0000-4000-8000-000000000091', 'pull-up',               2, 3, 8, 120),
  -- Texas intensity day
  ('b0000000-0000-4000-8000-000000000092', 'back-squat',            0, 1, 5, 300),
  ('b0000000-0000-4000-8000-000000000092', 'barbell-bench-press',   1, 1, 5, 300),
  ('b0000000-0000-4000-8000-000000000092', 'deadlift',              2, 1, 5, 300),

  -- Bodyweight A
  ('b0000000-0000-4000-8000-0000000000a0', 'push-up',               0, 4, 12, 90),
  ('b0000000-0000-4000-8000-0000000000a0', 'pull-up',               1, 4, 6, 120),
  ('b0000000-0000-4000-8000-0000000000a0', 'bulgarian-split-squat', 2, 3, 12, 90),
  ('b0000000-0000-4000-8000-0000000000a0', 'plank',                 3, 3, 45, 60),
  -- Bodyweight B
  ('b0000000-0000-4000-8000-0000000000a1', 'dip',                   0, 4, 8, 120),
  ('b0000000-0000-4000-8000-0000000000a1', 'lunge',                 1, 3, 12, 90),
  ('b0000000-0000-4000-8000-0000000000a1', 'hanging-leg-raise',     2, 3, 10, 60),
  ('b0000000-0000-4000-8000-0000000000a1', 'burpee',                3, 3, 15, 60)
) as d(day_id, slug, sort_order, sets, reps, rest)
join public.exercises e on e.slug = d.slug
on conflict do nothing;
