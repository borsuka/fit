-- ============================================================================
-- Reference data seed
-- ============================================================================
-- Lookup tables the schema is unusable without. Applied by `supabase db reset`.
-- Food and exercise corpora are imported separately (see supabase/seed/).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Allergens: the 14 substances requiring mandatory declaration in the EU under
-- Regulation (EU) No 1169/2011, Annex II. This is a regulatory list, not a
-- preference list - the meal planner filters on it as a hard SQL constraint.
-- ---------------------------------------------------------------------------

insert into public.allergens (id, code) values
  ( 1, 'gluten'),          -- cereals containing gluten
  ( 2, 'crustaceans'),
  ( 3, 'eggs'),
  ( 4, 'fish'),
  ( 5, 'peanuts'),
  ( 6, 'soybeans'),
  ( 7, 'milk'),
  ( 8, 'nuts'),            -- tree nuts
  ( 9, 'celery'),
  (10, 'mustard'),
  (11, 'sesame'),
  (12, 'sulphites'),       -- sulphur dioxide and sulphites > 10 mg/kg
  (13, 'lupin'),
  (14, 'molluscs')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Nutrients
-- ---------------------------------------------------------------------------
-- Macros are NOT here. They live as columns on `foods` because every search
-- result needs them and an EAV pivot on the hottest query in the app is a
-- needless cost. This table is the sparse tail: vitamins, minerals, and the
-- fat/carb breakdowns that only a detail screen reads.
--
-- group_id: 1 = fats, 2 = carbohydrates, 3 = minerals,
--           4 = fat-soluble vitamins, 5 = water-soluble vitamins, 6 = other
-- ---------------------------------------------------------------------------

insert into public.nutrients (id, code, unit, group_id) values
  -- Fats
  (10, 'saturated_fat',        'g',  1),
  (11, 'monounsaturated_fat',  'g',  1),
  (12, 'polyunsaturated_fat',  'g',  1),
  (13, 'trans_fat',            'g',  1),
  (14, 'omega_3',              'g',  1),
  (15, 'omega_6',              'g',  1),
  (16, 'cholesterol',          'mg', 1),

  -- Carbohydrates
  (20, 'fiber',                'g',  2),
  (21, 'sugar',                'g',  2),
  (22, 'added_sugar',          'g',  2),
  (23, 'starch',               'g',  2),
  (24, 'sugar_alcohol',        'g',  2),

  -- Minerals
  (30, 'sodium',               'mg', 3),
  (31, 'potassium',            'mg', 3),
  (32, 'calcium',              'mg', 3),
  (33, 'iron',                 'mg', 3),
  (34, 'magnesium',            'mg', 3),
  (35, 'zinc',                 'mg', 3),
  (36, 'phosphorus',           'mg', 3),
  (37, 'selenium',             'ug', 3),
  (38, 'copper',               'mg', 3),
  (39, 'manganese',            'mg', 3),
  (40, 'iodine',               'ug', 3),

  -- Fat-soluble vitamins
  (50, 'vitamin_a',            'ug', 4),
  (51, 'vitamin_d',            'ug', 4),
  (52, 'vitamin_e',            'mg', 4),
  (53, 'vitamin_k',            'ug', 4),

  -- Water-soluble vitamins
  (60, 'vitamin_c',            'mg', 5),
  (61, 'thiamin',              'mg', 5),   -- B1
  (62, 'riboflavin',           'mg', 5),   -- B2
  (63, 'niacin',               'mg', 5),   -- B3
  (64, 'pantothenic_acid',     'mg', 5),   -- B5
  (65, 'vitamin_b6',           'mg', 5),
  (66, 'biotin',               'ug', 5),   -- B7
  (67, 'folate',               'ug', 5),   -- B9
  (68, 'vitamin_b12',          'ug', 5),
  (69, 'choline',              'mg', 5),

  -- Other
  (80, 'caffeine',             'mg', 6),
  (81, 'alcohol',              'g',  6),
  (82, 'water',                'g',  6)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Food categories
-- ---------------------------------------------------------------------------

insert into public.food_categories (id, slug) values
  ('c0000000-0000-0000-0000-000000000001', 'meat-poultry'),
  ('c0000000-0000-0000-0000-000000000002', 'fish-seafood'),
  ('c0000000-0000-0000-0000-000000000003', 'dairy-eggs'),
  ('c0000000-0000-0000-0000-000000000004', 'grains-cereals'),
  ('c0000000-0000-0000-0000-000000000005', 'legumes'),
  ('c0000000-0000-0000-0000-000000000006', 'vegetables'),
  ('c0000000-0000-0000-0000-000000000007', 'fruits'),
  ('c0000000-0000-0000-0000-000000000008', 'nuts-seeds'),
  ('c0000000-0000-0000-0000-000000000009', 'fats-oils'),
  ('c0000000-0000-0000-0000-00000000000a', 'beverages'),
  ('c0000000-0000-0000-0000-00000000000b', 'sweets-snacks'),
  ('c0000000-0000-0000-0000-00000000000c', 'prepared-dishes'),
  ('c0000000-0000-0000-0000-00000000000d', 'supplements'),
  ('c0000000-0000-0000-0000-00000000000e', 'condiments-sauces')
on conflict (id) do nothing;
