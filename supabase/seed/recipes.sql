-- ============================================================================
-- Starter recipes
-- ============================================================================
-- Curated (user_id null, is_public true) so every account can plan from day
-- one. Quantities are per RECIPE, and `servings` divides them - the view
-- derives per-serving nutrition from the ingredients, so nothing here states a
-- calorie count and nothing can drift out of agreement with what is in it.
--
-- Allergens are not listed: meal_plan_candidates aggregates them up from each
-- ingredient's food. Asking an author to remember that milk is in the yoghurt
-- is exactly how an allergy gets missed.
-- ============================================================================

insert into public.recipes (id, user_id, name, servings, meal_slots, prep_minutes, cook_minutes,
                            is_public, instructions)
values
  ('e0000000-0000-4000-8000-000000000001', null, 'Oats with banana and peanut butter', 1,
   '{breakfast}', 5, 5, true,
   'Cook the oats with water or milk. Top with sliced banana and peanut butter.'),

  ('e0000000-0000-4000-8000-000000000002', null, 'Greek yoghurt with berries and walnuts', 1,
   '{breakfast,snack}', 5, 0, true,
   'Spoon the yoghurt into a bowl. Top with berries and chopped walnuts.'),

  ('e0000000-0000-4000-8000-000000000003', null, 'Scrambled eggs on wholemeal toast', 1,
   '{breakfast}', 5, 8, true,
   'Scramble the eggs in butter over low heat. Serve on toasted wholemeal bread.'),

  ('e0000000-0000-4000-8000-000000000004', null, 'Chicken, rice and broccoli', 1,
   '{lunch,dinner}', 10, 20, true,
   'Grill the chicken. Serve with cooked rice and steamed broccoli, dressed with olive oil.'),

  ('e0000000-0000-4000-8000-000000000005', null, 'Salmon with sweet potato and spinach', 1,
   '{lunch,dinner}', 10, 25, true,
   'Bake the salmon and sweet potato. Wilt the spinach in olive oil.'),

  ('e0000000-0000-4000-8000-000000000006', null, 'Lentil and vegetable stew', 2,
   '{lunch,dinner}', 15, 35, true,
   'Soften onion and carrot in olive oil. Add lentils and tomato; simmer until tender.'),

  ('e0000000-0000-4000-8000-000000000007', null, 'Shopska salad with sirene', 1,
   '{lunch,snack}', 10, 0, true,
   'Dice tomato, cucumber and pepper. Dress with olive oil and top with grated sirene.'),

  ('e0000000-0000-4000-8000-000000000008', null, 'Turkey and chickpea bowl', 1,
   '{lunch,dinner}', 10, 15, true,
   'Cook the turkey. Combine with chickpeas, spinach and a spoon of olive oil.'),

  ('e0000000-0000-4000-8000-000000000009', null, 'Tuna pasta with tomato', 1,
   '{lunch,dinner}', 5, 15, true,
   'Cook the pasta. Stir through drained tuna and chopped tomato with olive oil.'),

  ('e0000000-0000-4000-8000-00000000000a', null, 'Cottage cheese with apple and almonds', 1,
   '{snack,breakfast}', 5, 0, true,
   'Combine cottage cheese with diced apple and a small handful of almonds.'),

  ('e0000000-0000-4000-8000-00000000000b', null, 'Tofu, quinoa and pepper stir fry', 1,
   '{lunch,dinner}', 10, 15, true,
   'Fry the tofu and pepper in olive oil. Serve over cooked quinoa.'),

  ('e0000000-0000-4000-8000-00000000000c', null, 'Banana and almond snack', 1,
   '{snack}', 2, 0, true,
   'A banana with a small handful of almonds.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ingredients. Grams are per recipe, not per serving.
-- ---------------------------------------------------------------------------

insert into public.recipe_ingredients (recipe_id, food_id, quantity_g, sort_order) values
  -- Oats with banana and peanut butter
  ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000033', 60, 0),
  ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000060', 118, 1),
  ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000072', 16, 2),

  -- Greek yoghurt with berries and walnuts
  ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000023', 200, 0),
  ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000064', 80, 1),
  ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000071', 20, 2),

  -- Scrambled eggs on wholemeal toast
  ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000020', 100, 0),
  ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000035', 66, 1),
  ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000081', 10, 2),

  -- Chicken, rice and broccoli
  ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 150, 0),
  ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000030', 180, 1),
  ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000052', 120, 2),
  ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Salmon with sweet potato and spinach
  ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000010', 140, 0),
  ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000051', 200, 1),
  ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000057', 80, 2),
  ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Lentil and vegetable stew (2 servings)
  ('e0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000040', 400, 0),
  ('e0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000056', 120, 1),
  ('e0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000055', 100, 2),
  ('e0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000053', 200, 3),
  ('e0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000080', 20, 4),

  -- Shopska salad with sirene
  ('e0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000053', 150, 0),
  ('e0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000054', 120, 1),
  ('e0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000058', 80, 2),
  ('e0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000026', 40, 3),
  ('e0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000080', 10, 4),

  -- Turkey and chickpea bowl
  ('e0000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000005', 140, 0),
  ('e0000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000041', 150, 1),
  ('e0000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000057', 60, 2),
  ('e0000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Tuna pasta with tomato
  ('e0000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000032', 220, 0),
  ('e0000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000011', 120, 1),
  ('e0000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000053', 120, 2),
  ('e0000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Cottage cheese with apple and almonds
  ('e0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000025', 200, 0),
  ('e0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000061', 150, 1),
  ('e0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000070', 20, 2),

  -- Tofu, quinoa and pepper stir fry
  ('e0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000043', 180, 0),
  ('e0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000036', 200, 1),
  ('e0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000058', 100, 2),
  ('e0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000080', 10, 3),

  -- Banana and almond snack
  ('e0000000-0000-4000-8000-00000000000c', 'f0000000-0000-4000-8000-000000000060', 118, 0),
  ('e0000000-0000-4000-8000-00000000000c', 'f0000000-0000-4000-8000-000000000070', 20, 1)
on conflict do nothing;
