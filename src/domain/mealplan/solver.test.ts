import { describe, expect, it } from '@jest/globals';

import { excludedCategoriesForDiet } from './diets';
import { slotShares, type MealSlot } from './slots';
import {
  LIKED_WEIGHT,
  generatePlan,
  isEligible,
  likedShare,
  planError,
  planScore,
  SERVING_MAX,
  SERVING_MIN,
} from './solver';
import type { DayTargets, MealCandidate, PlanConstraints } from './types';

const targets: DayTargets = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 67 };

const noConstraints: PlanConstraints = {
  excludedAllergenIds: [],
  dislikedFoodIds: [],
  maxPrepMinutes: null,
};

const candidate = (
  id: string,
  kcal: number,
  slots: readonly MealSlot[],
  patch: Partial<MealCandidate> = {},
): MealCandidate => ({
  recipeId: id,
  name: `Recipe ${id}`,
  kcal,
  proteinG: kcal * 0.075,
  carbsG: kcal * 0.1,
  fatG: kcal * 0.033,
  allergenIds: [],
  foodIds: [],
  slots,
  prepMinutes: null,
  ...patch,
});

const pool: MealCandidate[] = [
  candidate('a', 500, ['breakfast']),
  candidate('b', 650, ['lunch', 'dinner']),
  candidate('c', 700, ['lunch', 'dinner']),
  candidate('d', 200, ['snack']),
  candidate('e', 450, ['breakfast', 'snack']),
];

const allSlots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

describe('slotShares', () => {
  it('sums to exactly 1 for every supported meal count', () => {
    for (let count = 2; count <= 5; count += 1) {
      const slots = allSlots.slice(0, Math.min(count, allSlots.length));
      const shares = slotShares(slots);
      const total = Object.values(shares).reduce((sum, share) => sum + share, 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it('normalises a subset rather than budgeting only part of the day', () => {
    // Taken raw from the four-meal table, breakfast + dinner is 0.575, and the
    // planner would confidently build a 1150 kcal plan for a 2000 kcal goal.
    const shares = slotShares(['breakfast', 'dinner']);
    expect(shares.breakfast! + shares.dinner!).toBeCloseTo(1, 9);
  });

  it('falls back to an even split for an unusual meal count', () => {
    const shares = slotShares(['breakfast', 'lunch', 'dinner', 'snack', 'snack', 'snack']);
    const total = Object.values(shares).reduce((sum, share) => sum + share, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('returns nothing for no slots rather than dividing by zero', () => {
    expect(slotShares([])).toEqual({});
  });
});

describe('isEligible', () => {
  it('rejects a recipe that does not belong in the slot', () => {
    expect(isEligible(candidate('x', 500, ['breakfast']), 'dinner', noConstraints)).toBe(false);
  });

  it('rejects an excluded allergen', () => {
    // A hard filter, applied here as well as in SQL. An allergen miss is a
    // safety incident, not a preference miss, and must not depend on one query
    // being written correctly.
    const withMilk = candidate('x', 500, ['lunch'], { allergenIds: [7] });
    expect(isEligible(withMilk, 'lunch', { ...noConstraints, excludedAllergenIds: [7] })).toBe(
      false,
    );
  });

  it('allows an allergen the user did not exclude', () => {
    const withMilk = candidate('x', 500, ['lunch'], { allergenIds: [7] });
    expect(isEligible(withMilk, 'lunch', { ...noConstraints, excludedAllergenIds: [5] })).toBe(
      true,
    );
  });

  it('rejects a recipe containing a disliked food', () => {
    const withOlives = candidate('x', 500, ['lunch'], { foodIds: ['olive-id'] });
    expect(
      isEligible(withOlives, 'lunch', { ...noConstraints, dislikedFoodIds: ['olive-id'] }),
    ).toBe(false);
  });

  it('respects a prep time ceiling', () => {
    const slow = candidate('x', 500, ['dinner'], { prepMinutes: 90 });
    expect(isEligible(slow, 'dinner', { ...noConstraints, maxPrepMinutes: 30 })).toBe(false);
    expect(isEligible(slow, 'dinner', { ...noConstraints, maxPrepMinutes: 120 })).toBe(true);
  });

  it('does not exclude a recipe with unknown prep time', () => {
    const unknown = candidate('x', 500, ['dinner'], { prepMinutes: null });
    expect(isEligible(unknown, 'dinner', { ...noConstraints, maxPrepMinutes: 15 })).toBe(true);
  });
});

describe('planError', () => {
  it('is zero at the target', () => {
    expect(planError(targets, targets)).toBe(0);
  });

  it('is scale-free, so a small day and a large day compare fairly', () => {
    const small: DayTargets = { calories: 1500, proteinG: 110, carbsG: 150, fatG: 50 };
    const large: DayTargets = { calories: 3500, proteinG: 260, carbsG: 350, fatG: 117 };

    // Both 10 % over on every axis.
    const over = (t: DayTargets): DayTargets => ({
      calories: t.calories * 1.1,
      proteinG: t.proteinG * 1.1,
      carbsG: t.carbsG * 1.1,
      fatG: t.fatG * 1.1,
    });

    expect(planError(over(small), small)).toBeCloseTo(planError(over(large), large), 9);
  });

  it('weights calories above fat', () => {
    const offByCalories = { ...targets, calories: targets.calories * 1.2 };
    const offByFat = { ...targets, fatG: targets.fatG * 1.2 };
    expect(planError(offByCalories, targets)).toBeGreaterThan(planError(offByFat, targets));
  });
});

describe('generatePlan', () => {
  it('fills every requested slot', () => {
    const result = generatePlan({
      targets,
      slots: allSlots,
      candidates: pool,
      constraints: noConstraints,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meals).toHaveLength(4);
    expect(result.value.meals.map((m) => m.slot)).toEqual(allSlots);
  });

  it('lands close to the calorie target', () => {
    const result = generatePlan({
      targets,
      slots: allSlots,
      candidates: pool,
      constraints: noConstraints,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Within 15 % of the goal. A tighter promise would be dishonest with five
    // recipes to choose from - the constraint is the corpus, not the solver.
    const drift = Math.abs(result.value.totals.calories - targets.calories) / targets.calories;
    expect(drift).toBeLessThan(0.15);
  });

  it('is deterministic - the same inputs give the same plan', () => {
    // A user reporting a bad plan has to be able to show it to us.
    const first = generatePlan({
      targets,
      slots: allSlots,
      candidates: pool,
      constraints: noConstraints,
    });
    const shuffled = generatePlan({
      targets,
      slots: allSlots,
      candidates: [...pool].reverse(),
      constraints: noConstraints,
    });

    expect(first.ok && shuffled.ok).toBe(true);
    if (!first.ok || !shuffled.ok) return;
    expect(first.value.meals.map((m) => m.recipeId)).toEqual(
      shuffled.value.meals.map((m) => m.recipeId),
    );
  });

  it('never selects an excluded allergen, whatever the arithmetic prefers', () => {
    // The milk recipe is the closest fit for every slot by calories. It must
    // still not be chosen.
    const withAllergen = [...pool, candidate('perfect', 500, allSlots, { allergenIds: [7] })];

    const result = generatePlan({
      targets,
      slots: allSlots,
      candidates: withAllergen,
      constraints: { ...noConstraints, excludedAllergenIds: [7] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meals.map((m) => m.recipeId)).not.toContain('perfect');
  });

  it('keeps a locked meal exactly as pinned', () => {
    const locked = {
      breakfast: {
        slot: 'breakfast' as const,
        recipeId: 'a',
        name: 'Recipe a',
        servings: 1.5,
        kcal: 750,
        proteinG: 56,
        carbsG: 75,
        fatG: 25,
        locked: true,
      },
    };

    const result = generatePlan({
      targets,
      slots: allSlots,
      candidates: pool,
      constraints: noConstraints,
      locked,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const breakfast = result.value.meals.find((m) => m.slot === 'breakfast');
    expect(breakfast?.recipeId).toBe('a');
    expect(breakfast?.servings).toBe(1.5);
    expect(breakfast?.locked).toBe(true);
  });

  it('keeps servings inside the sensible range', () => {
    // A third of a bowl of porridge is not breakfast, and three servings of
    // lasagne is not one either.
    const tiny = [candidate('tiny', 50, allSlots)];
    const huge = [candidate('huge', 3000, allSlots)];

    for (const candidates of [tiny, huge]) {
      const result = generatePlan({
        targets,
        slots: allSlots,
        candidates,
        constraints: noConstraints,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      for (const meal of result.value.meals) {
        expect(meal.servings).toBeGreaterThanOrEqual(SERVING_MIN);
        expect(meal.servings).toBeLessThanOrEqual(SERVING_MAX);
      }
    }
  });

  it('avoids repeating a recipe when it has alternatives', () => {
    const result = generatePlan({
      targets,
      slots: ['lunch', 'dinner'],
      candidates: pool,
      constraints: noConstraints,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.meals.map((m) => m.recipeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('repeats rather than leaving a slot empty', () => {
    // A repeated meal is a worse plan; a missing meal is not a plan.
    const only = [candidate('only', 600, ['lunch', 'dinner'])];
    const result = generatePlan({
      targets,
      slots: ['lunch', 'dinner'],
      candidates: only,
      constraints: noConstraints,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meals).toHaveLength(2);
  });

  it('fails cleanly when a slot has nothing eligible', () => {
    const result = generatePlan({
      targets,
      slots: ['breakfast', 'lunch'],
      candidates: [candidate('a', 500, ['breakfast'])],
      constraints: noConstraints,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_candidate_for_slot');
    expect(result.detail).toContain('lunch');
  });

  it.each([
    ['no candidates', [] as MealCandidate[], ['lunch'] as MealSlot[], 'no_candidates'],
    ['no slots', pool, [] as MealSlot[], 'targets_invalid'],
  ])('fails cleanly with %s', (_label, candidates, slots, reason) => {
    const result = generatePlan({ targets, slots, candidates, constraints: noConstraints });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(reason);
  });

  it('rejects a non-finite calorie target instead of producing NaN meals', () => {
    const result = generatePlan({
      targets: { ...targets, calories: Number.NaN },
      slots: allSlots,
      candidates: pool,
      constraints: noConstraints,
    });
    expect(result.ok).toBe(false);
  });

  it('produces finite numbers throughout', () => {
    const result = generatePlan({
      targets,
      slots: allSlots,
      candidates: pool,
      constraints: noConstraints,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const meal of result.value.meals) {
      for (const value of [meal.kcal, meal.proteinG, meal.carbsG, meal.fatG, meal.servings]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
    expect(Number.isFinite(result.value.error)).toBe(true);
  });
});

describe('likedShare', () => {
  const withFoods = (foodIds: readonly string[]): MealCandidate =>
    candidate('x', 500, ['lunch'], { foodIds });

  it('is zero when the user has liked nothing', () => {
    expect(likedShare(withFoods(['egg', 'oats']), [])).toBe(0);
    expect(likedShare(withFoods(['egg', 'oats']), undefined)).toBe(0);
  });

  it('is the fraction of ingredients liked, not a yes/no', () => {
    expect(likedShare(withFoods(['egg', 'oats', 'jam', 'salt']), ['egg'])).toBe(0.25);
    expect(likedShare(withFoods(['egg', 'oats']), ['egg', 'oats'])).toBe(1);
  });

  it('is zero for a recipe with no ingredients rather than dividing by zero', () => {
    expect(likedShare(withFoods([]), ['egg'])).toBe(0);
  });

  it('ignores liked foods the recipe does not contain', () => {
    expect(likedShare(withFoods(['egg']), ['salmon', 'rice'])).toBe(0);
  });
});

describe('planScore', () => {
  it('equals the plan error when nothing is liked, plus the full penalty', () => {
    expect(planScore(targets, targets, 0)).toBeCloseTo(LIKED_WEIGHT, 10);
  });

  it('carries no penalty when every meal is fully liked', () => {
    expect(planScore(targets, targets, 1)).toBe(0);
  });

  it('never lets taste outweigh a meaningful miss on the numbers', () => {
    // 20% over on calories alone already costs 0.2, more than the entire
    // preference term can ever be worth. That ordering is the safety property:
    // a liked plan must not beat an accurate one by much.
    const over: DayTargets = { ...targets, calories: targets.calories * 1.2 };
    expect(planScore(over, targets, 1)).toBeGreaterThan(planScore(targets, targets, 0));
  });
});

describe('generatePlan with food preferences', () => {
  /** Two lunches with identical nutrition; only the ingredients differ. */
  const twinPool: MealCandidate[] = [
    candidate('a', 500, ['breakfast']),
    candidate('lunch-plain', 650, ['lunch'], { foodIds: ['rice', 'chicken'] }),
    candidate('lunch-liked', 650, ['lunch'], { foodIds: ['salmon', 'quinoa'] }),
    candidate('c', 700, ['dinner']),
    candidate('d', 200, ['snack']),
  ];

  it('prefers the recipe built from liked foods when nutrition is a tie', () => {
    const result = generatePlan({
      targets,
      slots: allSlots,
      candidates: twinPool,
      constraints: { ...noConstraints, likedFoodIds: ['salmon', 'quinoa'] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meals.find((m) => m.slot === 'lunch')?.recipeId).toBe('lunch-liked');
  });

  it('still reports the honest distance from target, not the taste-adjusted one', () => {
    const liked = generatePlan({
      targets,
      slots: allSlots,
      candidates: twinPool,
      constraints: { ...noConstraints, likedFoodIds: ['salmon', 'quinoa'] },
    });

    expect(liked.ok).toBe(true);
    if (!liked.ok) return;
    // The two lunches are nutritionally identical, so preferring one cannot
    // change the reported error. If it did, the number shown to the user would
    // be measuring something other than what it claims to measure.
    expect(liked.value.error).toBeCloseTo(planError(liked.value.totals, targets), 10);
  });

  it('does not let a liked food override a dislike or an allergen', () => {
    const conflicted = generatePlan({
      targets,
      slots: ['lunch'],
      candidates: [
        candidate('safe', 650, ['lunch'], { foodIds: ['rice'] }),
        candidate('unsafe', 650, ['lunch'], { foodIds: ['peanut'], allergenIds: [5] }),
      ],
      // Liking peanuts changes nothing: an allergen exclusion is a hard filter.
      constraints: { ...noConstraints, excludedAllergenIds: [5], likedFoodIds: ['peanut'] },
    });

    expect(conflicted.ok).toBe(true);
    if (!conflicted.ok) return;
    expect(conflicted.value.meals[0]?.recipeId).toBe('safe');
  });

  it('produces the same plan as before when the user has liked nothing', () => {
    const withField = generatePlan({
      targets,
      slots: allSlots,
      candidates: pool,
      constraints: { ...noConstraints, likedFoodIds: [] },
    });
    const without = generatePlan({
      targets,
      slots: allSlots,
      candidates: pool,
      constraints: noConstraints,
    });

    expect(withField).toEqual(without);
  });
});

describe('diet exclusions', () => {
  const meaty = candidate('meaty', 600, ['dinner'], {
    categorySlugs: ['meat-poultry', 'grains-cereals'],
  });
  const fishy = candidate('fishy', 600, ['dinner'], {
    categorySlugs: ['fish-seafood', 'vegetables'],
  });
  const cheesy = candidate('cheesy', 600, ['dinner'], {
    categorySlugs: ['dairy-eggs', 'vegetables'],
  });
  const plants = candidate('plants', 600, ['dinner'], {
    categorySlugs: ['legumes', 'vegetables'],
  });
  const unknown = candidate('unknown', 600, ['dinner']);

  const eligibleFor = (excluded: readonly string[]): string[] =>
    [meaty, fishy, cheesy, plants, unknown]
      .filter((c) => isEligible(c, 'dinner', { ...noConstraints, excludedCategorySlugs: excluded }))
      .map((c) => c.recipeId);

  it('lets everything through when no diet is set', () => {
    expect(eligibleFor([])).toEqual(['meaty', 'fishy', 'cheesy', 'plants', 'unknown']);
  });

  it('excludes meat and fish for a vegetarian', () => {
    expect(eligibleFor(excludedCategoriesForDiet('vegetarian'))).toEqual(['cheesy', 'plants']);
  });

  it('excludes dairy as well for a vegan', () => {
    expect(eligibleFor(excludedCategoriesForDiet('vegan'))).toEqual(['plants']);
  });

  it('keeps fish for a pescatarian', () => {
    expect(eligibleFor(excludedCategoriesForDiet('pescatarian'))).toEqual([
      'fishy',
      'cheesy',
      'plants',
    ]);
  });

  it('rejects a recipe whose ingredients we cannot classify', () => {
    // Not a technicality: an unclassified recipe is one we cannot prove is
    // meat-free, and a vegan would rather see a shorter list than a wrong one.
    expect(eligibleFor(['meat-poultry'])).not.toContain('unknown');
  });

  it('treats an unknown diet name as no restriction rather than throwing', () => {
    expect(excludedCategoriesForDiet('carnivore')).toEqual([]);
  });
});
