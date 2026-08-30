import { slotShares, type MealSlot } from './slots';
import type {
  DayTargets,
  MealCandidate,
  PlanConstraints,
  PlanOutcome,
  PlanRequest,
  PlannedMeal,
} from './types';

/**
 * Deterministic meal plan selection.
 *
 * No LLM anywhere in this file. The model may describe a plan or suggest a
 * substitution, but what gets chosen and what it adds up to is arithmetic over
 * recipes whose nutrition is derived from their ingredients.
 *
 * Same inputs always produce the same plan - candidates are sorted by id before
 * anything else, so a plan is reproducible and a bug is reproducible with it.
 */

/** A recipe may be scaled within this range to fit a slot. Beyond it the
 *  "portion" stops resembling the recipe: a third of a bowl of porridge is not
 *  breakfast, and three servings of lasagne is not one either. */
export const SERVING_MIN = 0.5;
export const SERVING_MAX = 2;

/**
 * Relative weight of each axis in the error function.
 *
 * Calories lead because that is what the goal is expressed in. Protein is next
 * because it is the macro with the most evidence behind it and the most to lose
 * by undershooting. Carbohydrate and fat are largely the remainder and are
 * weighted accordingly.
 */
const WEIGHTS = { calories: 1, protein: 0.6, carbs: 0.25, fat: 0.25 } as const;

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);

/** Normalised, weighted distance from a target set. Scale-free, so it compares
 *  a 1500 kcal day and a 3500 kcal day on equal terms. */
export const planError = (totals: DayTargets, targets: DayTargets): number => {
  const relative = (actual: number, target: number): number =>
    target <= 0 ? 0 : Math.abs(actual - target) / target;

  return (
    relative(totals.calories, targets.calories) * WEIGHTS.calories +
    relative(totals.proteinG, targets.proteinG) * WEIGHTS.protein +
    relative(totals.carbsG, targets.carbsG) * WEIGHTS.carbs +
    relative(totals.fatG, targets.fatG) * WEIGHTS.fat
  );
};

/**
 * Whether a candidate may be used at all.
 *
 * Allergen exclusion is a HARD filter and is applied here as well as in SQL.
 * Defence in depth on purpose: an allergen miss is a safety incident, not a
 * preference miss, and it must not depend on one query being written correctly.
 */
export const isEligible = (
  candidate: MealCandidate,
  slot: MealSlot,
  constraints: PlanConstraints,
): boolean => {
  if (!candidate.slots.includes(slot)) return false;

  for (const allergenId of candidate.allergenIds) {
    if (constraints.excludedAllergenIds.includes(allergenId)) return false;
  }

  for (const foodId of candidate.foodIds as readonly string[]) {
    if (constraints.dislikedFoodIds.includes(foodId)) return false;
  }

  if (
    constraints.maxPrepMinutes !== null &&
    candidate.prepMinutes !== null &&
    candidate.prepMinutes > constraints.maxPrepMinutes
  ) {
    return false;
  }

  return true;
};

const scaleTo = (candidate: MealCandidate, budgetKcal: number): number => {
  if (candidate.kcal <= 0) return 1;
  return clamp(budgetKcal / candidate.kcal, SERVING_MIN, SERVING_MAX);
};

const toPlanned = (
  candidate: MealCandidate,
  slot: MealSlot,
  servings: number,
  locked: boolean,
): PlannedMeal => ({
  slot,
  recipeId: candidate.recipeId,
  name: candidate.name,
  servings: Math.round(servings * 100) / 100,
  kcal: candidate.kcal * servings,
  proteinG: candidate.proteinG * servings,
  carbsG: candidate.carbsG * servings,
  fatG: candidate.fatG * servings,
  locked,
});

const sumMeals = (meals: readonly PlannedMeal[]): DayTargets =>
  meals.reduce<DayTargets>(
    (acc, meal) => ({
      calories: acc.calories + meal.kcal,
      proteinG: acc.proteinG + meal.proteinG,
      carbsG: acc.carbsG + meal.carbsG,
      fatG: acc.fatG + meal.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

export const generatePlan = (request: PlanRequest): PlanOutcome => {
  const { targets, slots, constraints } = request;

  if (targets.calories <= 0 || !Number.isFinite(targets.calories)) {
    return { ok: false, reason: 'targets_invalid', detail: 'calorie target must be positive' };
  }
  if (slots.length === 0) {
    return { ok: false, reason: 'targets_invalid', detail: 'at least one meal slot is required' };
  }
  if (request.candidates.length === 0) {
    return { ok: false, reason: 'no_candidates', detail: 'no recipes available' };
  }

  // Sorted so the result is reproducible: two runs over the same data must
  // produce the same plan, or a user reporting a bad plan cannot show it to us.
  const candidates = [...request.candidates].sort((a, b) => a.recipeId.localeCompare(b.recipeId));
  const shares = slotShares(slots);
  const locked = request.locked ?? {};

  // --- greedy pass: best single choice per slot ------------------------------
  const chosen: PlannedMeal[] = [];
  const used = new Set<string>();

  for (const slot of slots) {
    const pinned = locked[slot];
    if (pinned !== undefined) {
      chosen.push({ ...pinned, locked: true });
      used.add(pinned.recipeId);
      continue;
    }

    const share = shares[slot] ?? 1 / slots.length;
    const slotTarget: DayTargets = {
      calories: targets.calories * share,
      proteinG: targets.proteinG * share,
      carbsG: targets.carbsG * share,
      fatG: targets.fatG * share,
    };

    let best: PlannedMeal | null = null;
    let bestError = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      if (!isEligible(candidate, slot, constraints)) continue;
      // Variety, not correctness: the same recipe twice in a day is a plan
      // nobody follows. Relaxed below if a slot has nothing else.
      if (used.has(candidate.recipeId)) continue;

      const servings = scaleTo(candidate, slotTarget.calories);
      const planned = toPlanned(candidate, slot, servings, false);
      const error = planError(
        {
          calories: planned.kcal,
          proteinG: planned.proteinG,
          carbsG: planned.carbsG,
          fatG: planned.fatG,
        },
        slotTarget,
      );

      if (error < bestError) {
        best = planned;
        bestError = error;
      }
    }

    // Nothing unused fits: allow a repeat rather than leaving the slot empty.
    // A repeated meal is a worse plan; a missing meal is not a plan.
    if (best === null) {
      for (const candidate of candidates) {
        if (!isEligible(candidate, slot, constraints)) continue;
        const servings = scaleTo(candidate, slotTarget.calories);
        best = toPlanned(candidate, slot, servings, false);
        break;
      }
    }

    if (best === null) {
      return {
        ok: false,
        reason: 'no_candidate_for_slot',
        detail: `no eligible recipe for ${slot}`,
      };
    }

    chosen.push(best);
    used.add(best.recipeId);
  }

  // --- local search: one swap at a time, keep it if the whole day improves ---
  // Greedy fills each slot against its own budget and can miss badly on the
  // total, because slot shares are a convention rather than a constraint. This
  // pass optimises what the user actually cares about.
  let current = chosen;
  let currentError = planError(sumMeals(current), targets);

  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;

    for (let index = 0; index < current.length; index += 1) {
      const meal = current[index];
      if (meal === undefined || meal.locked) continue;

      const slot = meal.slot;
      const others = current.filter((_, i) => i !== index);
      const inUse = new Set(others.map((m) => m.recipeId));

      for (const candidate of candidates) {
        if (!isEligible(candidate, slot, constraints)) continue;
        if (inUse.has(candidate.recipeId)) continue;

        // Scaled against what the rest of the day leaves, not against the slot
        // share - this is the step that closes the gap on the daily total.
        const remaining = targets.calories - sumMeals(others).calories;
        const servings = scaleTo(candidate, Math.max(remaining, 0));
        const replacement = toPlanned(candidate, slot, servings, false);
        const trial = [...others.slice(0, index), replacement, ...others.slice(index)];
        const trialError = planError(sumMeals(trial), targets);

        if (trialError < currentError - 1e-9) {
          current = trial;
          currentError = trialError;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return { ok: true, value: { meals: current, totals: sumMeals(current), error: currentError } };
};
