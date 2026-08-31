/**
 * Diet types the planner can actually honour.
 *
 * Only exclusions live here. Keto and mediterranean are shapes of a macro
 * split rather than lists of forbidden foods, and the database allows them for
 * later - but the picker does not offer what the solver cannot enforce. A
 * setting that silently does nothing is worse than an absent one.
 */
export type PlannableDiet = 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian';

export const PLANNABLE_DIETS: readonly PlannableDiet[] = [
  'omnivore',
  'vegetarian',
  'vegan',
  'pescatarian',
];

/** Category slugs each diet rules out, matching `public.food_categories.slug`. */
const EXCLUSIONS: Readonly<Record<PlannableDiet, readonly string[]>> = {
  omnivore: [],
  vegetarian: ['meat-poultry', 'fish-seafood'],
  vegan: ['meat-poultry', 'fish-seafood', 'dairy-eggs'],
  pescatarian: ['meat-poultry'],
};

export const excludedCategoriesForDiet = (diet: string): readonly string[] =>
  EXCLUSIONS[diet as PlannableDiet] ?? [];
