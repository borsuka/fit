import { describe, expect, it } from '@jest/globals';

import { slotShares, type MealSlot } from './slots';
import { generatePlan, isEligible, planError, SERVING_MAX, SERVING_MIN } from './solver';
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
