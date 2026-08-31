-- ============================================================================
-- Extended recipe corpus
-- ============================================================================
-- The starter set had twelve recipes, which is not enough for a planner: with
-- four slots and a week to fill, it repeats the same dinner three times. This
-- file brings the pool to a size where a week of plans looks like a week of
-- food.
--
-- Every slot is covered deliberately. `meal_slots` is what the planner filters
-- on, so a pool that is 80% dinner produces a plan with an empty breakfast and
-- no explanation of why.
--
-- As in recipes.sql: quantities are PER RECIPE and `servings` divides them.
-- Nothing here states a calorie count - the view derives it from the
-- ingredients, so a recipe cannot disagree with what is in it.
-- ============================================================================

insert into public.recipes (id, user_id, name, servings, meal_slots, prep_minutes, cook_minutes,
                            is_public, instructions)
values
  -- Breakfast
  ('e0000000-0000-4000-8000-000000000010', null, 'Omelette with cheese and tomato', 1,
   '{breakfast}', 5, 8, true,
   'Beat the eggs. Cook in a little olive oil, add grated kashkaval and diced tomato, fold over.'),

  ('e0000000-0000-4000-8000-000000000011', null, 'Banitsa with ayran', 1,
   '{breakfast}', 2, 0, true,
   'A slice of banitsa with a glass of ayran. The Bulgarian breakfast, logged honestly.'),

  ('e0000000-0000-4000-8000-000000000012', null, 'Muesli with milk and blueberries', 1,
   '{breakfast}', 3, 0, true,
   'Pour milk over the muesli and top with blueberries.'),

  ('e0000000-0000-4000-8000-000000000013', null, 'Skyr with honey and walnuts', 1,
   '{breakfast,snack}', 3, 0, true,
   'Spoon the skyr into a bowl, drizzle with honey and scatter chopped walnuts.'),

  ('e0000000-0000-4000-8000-000000000014', null, 'Bacon and eggs on toast', 1,
   '{breakfast}', 3, 10, true,
   'Fry the bacon, then the eggs in the fat. Serve on toasted wholemeal bread.'),

  ('e0000000-0000-4000-8000-000000000015', null, 'Protein oats with banana', 1,
   '{breakfast}', 3, 5, true,
   'Cook the oats in milk. Stir the whey through off the heat so it does not curdle. Top with banana.'),

  ('e0000000-0000-4000-8000-000000000016', null, 'Avocado toast with egg', 1,
   '{breakfast}', 5, 5, true,
   'Mash the avocado onto toasted wholemeal bread and top with a boiled egg.'),

  ('e0000000-0000-4000-8000-000000000017', null, 'Cottage cheese with tomato and rye', 1,
   '{breakfast,snack}', 4, 0, true,
   'Cottage cheese with sliced tomato and rye bread.'),

  ('e0000000-0000-4000-8000-000000000018', null, 'Pancakes with jam', 1,
   '{breakfast}', 5, 10, true,
   'Serve the pancakes warm with a spoon of fruit jam.'),

  -- Lunch and dinner
  ('e0000000-0000-4000-8000-000000000019', null, 'Steak with potatoes and salad', 1,
   '{lunch,dinner}', 10, 20, true,
   'Grill the steak to your liking. Serve with boiled potatoes and a dressed leaf salad.'),

  ('e0000000-0000-4000-8000-00000000001a', null, 'Musaka with shopska salad', 1,
   '{lunch,dinner}', 5, 0, true,
   'A portion of musaka with a shopska salad alongside.'),

  ('e0000000-0000-4000-8000-00000000001b', null, 'Chicken with rice and tomato sauce', 1,
   '{lunch,dinner}', 10, 25, true,
   'Brown the chicken with onion, add passata and simmer. Serve over rice.'),

  ('e0000000-0000-4000-8000-00000000001c', null, 'Turkey and hummus wrap', 1,
   '{lunch}', 8, 5, true,
   'Spread hummus over the wrap, fill with turkey, lettuce and tomato, and roll.'),

  ('e0000000-0000-4000-8000-00000000001d', null, 'Pork chop with sauerkraut and potatoes', 1,
   '{dinner}', 10, 25, true,
   'Pan-fry the chop. Serve with warmed sauerkraut and boiled potatoes.'),

  ('e0000000-0000-4000-8000-00000000001e', null, 'Mackerel with bulgur and green beans', 1,
   '{lunch,dinner}', 10, 20, true,
   'Bake the mackerel. Serve with cooked bulgur and steamed green beans.'),

  ('e0000000-0000-4000-8000-00000000001f', null, 'Bean soup with rye bread', 1,
   '{lunch,dinner}', 5, 0, true,
   'A bowl of bob chorba with rye bread.'),

  ('e0000000-0000-4000-8000-000000000020', null, 'Kebapche with fries and lyutenitsa', 1,
   '{lunch,dinner}', 5, 15, true,
   'Grill the kebapche. Serve with fries and a spoon of lyutenitsa.'),

  ('e0000000-0000-4000-8000-000000000021', null, 'Cod with quinoa and asparagus', 1,
   '{dinner}', 10, 20, true,
   'Bake the cod with olive oil. Serve with cooked quinoa and steamed asparagus.'),

  ('e0000000-0000-4000-8000-000000000022', null, 'Lentils with roasted pepper', 1,
   '{lunch,dinner}', 10, 25, true,
   'Soften the onion in olive oil, add lentils and roasted pepper, and warm through.'),

  ('e0000000-0000-4000-8000-000000000023', null, 'Shrimp with rice and courgette', 1,
   '{dinner}', 10, 15, true,
   'Fry the shrimp with garlic. Serve with rice and sauteed courgette.'),

  ('e0000000-0000-4000-8000-000000000024', null, 'Chicken salad with egg and olives', 1,
   '{lunch}', 10, 10, true,
   'Grill and slice the chicken. Toss with leaves, boiled egg, olives and olive oil.'),

  ('e0000000-0000-4000-8000-000000000025', null, 'Sarmi with yoghurt', 1,
   '{lunch,dinner}', 5, 0, true,
   'Warm the sarmi and serve with a spoon of Bulgarian yoghurt.'),

  ('e0000000-0000-4000-8000-000000000026', null, 'Tuna and white bean salad', 1,
   '{lunch}', 8, 0, true,
   'Combine drained tuna with white beans, onion and tomato. Dress with olive oil.'),

  ('e0000000-0000-4000-8000-000000000027', null, 'Pasta with tomato and parmesan', 1,
   '{lunch,dinner}', 5, 15, true,
   'Cook the pasta. Toss with warmed passata and olive oil, finish with grated parmesan.'),

  -- Snacks
  ('e0000000-0000-4000-8000-000000000028', null, 'Apple with peanut butter', 1,
   '{snack}', 2, 0, true,
   'Slice the apple and spread with peanut butter.'),

  ('e0000000-0000-4000-8000-000000000029', null, 'Protein shake with banana', 1,
   '{snack}', 2, 0, true,
   'Blend the whey with milk and a banana.'),

  ('e0000000-0000-4000-8000-00000000002a', null, 'Rice cakes with cottage cheese', 1,
   '{snack}', 3, 0, true,
   'Top rice cakes with cottage cheese.'),

  ('e0000000-0000-4000-8000-00000000002b', null, 'Nuts and raisins', 1,
   '{snack}', 1, 0, true,
   'A handful of almonds and cashews with raisins.'),

  ('e0000000-0000-4000-8000-00000000002c', null, 'Carrot sticks with hummus', 1,
   '{snack}', 5, 0, true,
   'Cut the carrot into sticks and serve with hummus.'),

  ('e0000000-0000-4000-8000-00000000002d', null, 'Dark chocolate with almonds', 1,
   '{snack}', 1, 0, true,
   'A few squares of dark chocolate with almonds.'),

  ('e0000000-0000-4000-8000-00000000002e', null, 'Kefir with chia and raspberries', 1,
   '{snack,breakfast}', 3, 0, true,
   'Stir chia seeds into the kefir, leave to thicken, and top with raspberries.'),

  ('e0000000-0000-4000-8000-00000000002f', null, 'Boiled eggs with cucumber', 1,
   '{snack}', 2, 8, true,
   'Two boiled eggs with sliced cucumber.'),

  ('e0000000-0000-4000-8000-000000000030', null, 'Greek yoghurt with granola', 1,
   '{snack,breakfast}', 2, 0, true,
   'Greek yoghurt topped with granola.'),

  ('e0000000-0000-4000-8000-000000000031', null, 'Tarator', 1,
   '{snack,lunch}', 8, 0, true,
   'A bowl of chilled tarator.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ingredients. Grams are per recipe, not per serving.
-- ---------------------------------------------------------------------------

insert into public.recipe_ingredients (recipe_id, food_id, quantity_g, sort_order) values
  -- Omelette with cheese and tomato
  ('e0000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000020', 100, 0),
  ('e0000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000027', 30, 1),
  ('e0000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000053', 80, 2),
  ('e0000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000080', 5, 3),

  -- Banitsa with ayran
  ('e0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000090', 150, 0),
  ('e0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000132', 250, 1),

  -- Muesli with milk and blueberries
  ('e0000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000141', 60, 0),
  ('e0000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000130', 200, 1),
  ('e0000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000064', 60, 2),

  -- Skyr with honey and walnuts
  ('e0000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-000000000133', 200, 0),
  ('e0000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-0000000001d9', 15, 1),
  ('e0000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-000000000071', 15, 2),

  -- Bacon and eggs on toast
  ('e0000000-0000-4000-8000-000000000014', 'f0000000-0000-4000-8000-000000000108', 36, 0),
  ('e0000000-0000-4000-8000-000000000014', 'f0000000-0000-4000-8000-00000000013c', 92, 1),
  ('e0000000-0000-4000-8000-000000000014', 'f0000000-0000-4000-8000-000000000035', 66, 2),

  -- Protein oats with banana
  ('e0000000-0000-4000-8000-000000000015', 'f0000000-0000-4000-8000-000000000033', 60, 0),
  ('e0000000-0000-4000-8000-000000000015', 'f0000000-0000-4000-8000-000000000220', 30, 1),
  ('e0000000-0000-4000-8000-000000000015', 'f0000000-0000-4000-8000-000000000131', 250, 2),
  ('e0000000-0000-4000-8000-000000000015', 'f0000000-0000-4000-8000-000000000060', 118, 3),

  -- Avocado toast with egg
  ('e0000000-0000-4000-8000-000000000016', 'f0000000-0000-4000-8000-000000000035', 66, 0),
  ('e0000000-0000-4000-8000-000000000016', 'f0000000-0000-4000-8000-000000000066', 80, 1),
  ('e0000000-0000-4000-8000-000000000016', 'f0000000-0000-4000-8000-000000000020', 50, 2),

  -- Cottage cheese with tomato and rye
  ('e0000000-0000-4000-8000-000000000017', 'f0000000-0000-4000-8000-000000000025', 150, 0),
  ('e0000000-0000-4000-8000-000000000017', 'f0000000-0000-4000-8000-000000000053', 100, 1),
  ('e0000000-0000-4000-8000-000000000017', 'f0000000-0000-4000-8000-000000000144', 64, 2),

  -- Pancakes with jam
  ('e0000000-0000-4000-8000-000000000018', 'f0000000-0000-4000-8000-0000000001e5', 120, 0),
  ('e0000000-0000-4000-8000-000000000018', 'f0000000-0000-4000-8000-0000000001da', 30, 1),

  -- Steak with potatoes and salad
  ('e0000000-0000-4000-8000-000000000019', 'f0000000-0000-4000-8000-000000000103', 180, 0),
  ('e0000000-0000-4000-8000-000000000019', 'f0000000-0000-4000-8000-000000000050', 200, 1),
  ('e0000000-0000-4000-8000-000000000019', 'f0000000-0000-4000-8000-000000000166', 50, 2),
  ('e0000000-0000-4000-8000-000000000019', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Musaka with shopska salad
  ('e0000000-0000-4000-8000-00000000001a', 'f0000000-0000-4000-8000-0000000001f8', 350, 0),
  ('e0000000-0000-4000-8000-00000000001a', 'f0000000-0000-4000-8000-000000000091', 150, 1),

  -- Chicken with rice and tomato sauce
  ('e0000000-0000-4000-8000-00000000001b', 'f0000000-0000-4000-8000-000000000001', 150, 0),
  ('e0000000-0000-4000-8000-00000000001b', 'f0000000-0000-4000-8000-000000000030', 180, 1),
  ('e0000000-0000-4000-8000-00000000001b', 'f0000000-0000-4000-8000-000000000213', 100, 2),
  ('e0000000-0000-4000-8000-00000000001b', 'f0000000-0000-4000-8000-000000000055', 50, 3),
  ('e0000000-0000-4000-8000-00000000001b', 'f0000000-0000-4000-8000-000000000080', 10, 4),

  -- Turkey and hummus wrap
  ('e0000000-0000-4000-8000-00000000001c', 'f0000000-0000-4000-8000-000000000146', 45, 0),
  ('e0000000-0000-4000-8000-00000000001c', 'f0000000-0000-4000-8000-000000000005', 120, 1),
  ('e0000000-0000-4000-8000-00000000001c', 'f0000000-0000-4000-8000-000000000154', 40, 2),
  ('e0000000-0000-4000-8000-00000000001c', 'f0000000-0000-4000-8000-000000000166', 30, 3),
  ('e0000000-0000-4000-8000-00000000001c', 'f0000000-0000-4000-8000-000000000053', 50, 4),

  -- Pork chop with sauerkraut and potatoes
  ('e0000000-0000-4000-8000-00000000001d', 'f0000000-0000-4000-8000-000000000105', 180, 0),
  ('e0000000-0000-4000-8000-00000000001d', 'f0000000-0000-4000-8000-00000000016e', 150, 1),
  ('e0000000-0000-4000-8000-00000000001d', 'f0000000-0000-4000-8000-000000000050', 150, 2),

  -- Mackerel with bulgur and green beans
  ('e0000000-0000-4000-8000-00000000001e', 'f0000000-0000-4000-8000-000000000120', 150, 0),
  ('e0000000-0000-4000-8000-00000000001e', 'f0000000-0000-4000-8000-00000000014b', 180, 1),
  ('e0000000-0000-4000-8000-00000000001e', 'f0000000-0000-4000-8000-000000000165', 150, 2),

  -- Bean soup with rye bread
  ('e0000000-0000-4000-8000-00000000001f', 'f0000000-0000-4000-8000-0000000001fb', 400, 0),
  ('e0000000-0000-4000-8000-00000000001f', 'f0000000-0000-4000-8000-000000000144', 64, 1),

  -- Kebapche with fries and lyutenitsa
  ('e0000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-0000000001fe', 160, 0),
  ('e0000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-0000000001f2', 150, 1),
  ('e0000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-0000000001fd', 40, 2),

  -- Cod with quinoa and asparagus
  ('e0000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-000000000012', 180, 0),
  ('e0000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-000000000036', 180, 1),
  ('e0000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-00000000016b', 150, 2),
  ('e0000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Lentils with roasted pepper
  ('e0000000-0000-4000-8000-000000000022', 'f0000000-0000-4000-8000-000000000040', 200, 0),
  ('e0000000-0000-4000-8000-000000000022', 'f0000000-0000-4000-8000-000000000171', 100, 1),
  ('e0000000-0000-4000-8000-000000000022', 'f0000000-0000-4000-8000-000000000055', 50, 2),
  ('e0000000-0000-4000-8000-000000000022', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Shrimp with rice and courgette
  ('e0000000-0000-4000-8000-000000000023', 'f0000000-0000-4000-8000-000000000124', 150, 0),
  ('e0000000-0000-4000-8000-000000000023', 'f0000000-0000-4000-8000-000000000030', 180, 1),
  ('e0000000-0000-4000-8000-000000000023', 'f0000000-0000-4000-8000-000000000162', 150, 2),
  ('e0000000-0000-4000-8000-000000000023', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Chicken salad with egg and olives
  ('e0000000-0000-4000-8000-000000000024', 'f0000000-0000-4000-8000-000000000001', 150, 0),
  ('e0000000-0000-4000-8000-000000000024', 'f0000000-0000-4000-8000-000000000166', 80, 1),
  ('e0000000-0000-4000-8000-000000000024', 'f0000000-0000-4000-8000-000000000020', 50, 2),
  ('e0000000-0000-4000-8000-000000000024', 'f0000000-0000-4000-8000-000000000170', 20, 3),
  ('e0000000-0000-4000-8000-000000000024', 'f0000000-0000-4000-8000-000000000080', 10, 4),

  -- Sarmi with yoghurt
  ('e0000000-0000-4000-8000-000000000025', 'f0000000-0000-4000-8000-0000000001f9', 300, 0),
  ('e0000000-0000-4000-8000-000000000025', 'f0000000-0000-4000-8000-000000000024', 100, 1),

  -- Tuna and white bean salad
  ('e0000000-0000-4000-8000-000000000026', 'f0000000-0000-4000-8000-000000000011', 120, 0),
  ('e0000000-0000-4000-8000-000000000026', 'f0000000-0000-4000-8000-000000000042', 150, 1),
  ('e0000000-0000-4000-8000-000000000026', 'f0000000-0000-4000-8000-000000000055', 40, 2),
  ('e0000000-0000-4000-8000-000000000026', 'f0000000-0000-4000-8000-000000000053', 80, 3),
  ('e0000000-0000-4000-8000-000000000026', 'f0000000-0000-4000-8000-000000000080', 10, 4),

  -- Pasta with tomato and parmesan
  ('e0000000-0000-4000-8000-000000000027', 'f0000000-0000-4000-8000-000000000032', 250, 0),
  ('e0000000-0000-4000-8000-000000000027', 'f0000000-0000-4000-8000-000000000213', 120, 1),
  ('e0000000-0000-4000-8000-000000000027', 'f0000000-0000-4000-8000-000000000138', 20, 2),
  ('e0000000-0000-4000-8000-000000000027', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Apple with peanut butter
  ('e0000000-0000-4000-8000-000000000028', 'f0000000-0000-4000-8000-000000000061', 150, 0),
  ('e0000000-0000-4000-8000-000000000028', 'f0000000-0000-4000-8000-000000000072', 20, 1),

  -- Protein shake with banana
  ('e0000000-0000-4000-8000-000000000029', 'f0000000-0000-4000-8000-000000000220', 30, 0),
  ('e0000000-0000-4000-8000-000000000029', 'f0000000-0000-4000-8000-000000000131', 300, 1),
  ('e0000000-0000-4000-8000-000000000029', 'f0000000-0000-4000-8000-000000000060', 100, 2),

  -- Rice cakes with cottage cheese
  ('e0000000-0000-4000-8000-00000000002a', 'f0000000-0000-4000-8000-000000000149', 18, 0),
  ('e0000000-0000-4000-8000-00000000002a', 'f0000000-0000-4000-8000-000000000025', 80, 1),

  -- Nuts and raisins
  ('e0000000-0000-4000-8000-00000000002b', 'f0000000-0000-4000-8000-000000000070', 20, 0),
  ('e0000000-0000-4000-8000-00000000002b', 'f0000000-0000-4000-8000-0000000001a0', 15, 1),
  ('e0000000-0000-4000-8000-00000000002b', 'f0000000-0000-4000-8000-00000000018e', 20, 2),

  -- Carrot sticks with hummus
  ('e0000000-0000-4000-8000-00000000002c', 'f0000000-0000-4000-8000-000000000056', 120, 0),
  ('e0000000-0000-4000-8000-00000000002c', 'f0000000-0000-4000-8000-000000000154', 50, 1),

  -- Dark chocolate with almonds
  ('e0000000-0000-4000-8000-00000000002d', 'f0000000-0000-4000-8000-0000000001d1', 20, 0),
  ('e0000000-0000-4000-8000-00000000002d', 'f0000000-0000-4000-8000-000000000070', 15, 1),

  -- Kefir with chia and raspberries
  ('e0000000-0000-4000-8000-00000000002e', 'f0000000-0000-4000-8000-00000000013e', 250, 0),
  ('e0000000-0000-4000-8000-00000000002e', 'f0000000-0000-4000-8000-0000000001a5', 15, 1),
  ('e0000000-0000-4000-8000-00000000002e', 'f0000000-0000-4000-8000-00000000018a', 60, 2),

  -- Boiled eggs with cucumber
  ('e0000000-0000-4000-8000-00000000002f', 'f0000000-0000-4000-8000-000000000020', 100, 0),
  ('e0000000-0000-4000-8000-00000000002f', 'f0000000-0000-4000-8000-000000000054', 100, 1),

  -- Greek yoghurt with granola
  ('e0000000-0000-4000-8000-000000000030', 'f0000000-0000-4000-8000-000000000023', 200, 0),
  ('e0000000-0000-4000-8000-000000000030', 'f0000000-0000-4000-8000-000000000142', 40, 1),

  -- Tarator
  ('e0000000-0000-4000-8000-000000000031', 'f0000000-0000-4000-8000-000000000092', 300, 0)
on conflict do nothing;
