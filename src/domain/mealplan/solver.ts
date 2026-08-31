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

/**
 * How much a liked ingredient is worth, in units of plan error.
 *
 * Deliberately small. A plan the user enjoys is a plan they follow, so taste
 * belongs in the objective - but it is worth about 15% of one axis, not more.
 * Set it high and the solver starts serving what you like at the cost of the
 * numbers, which is the failure mode of every "personalised" planner that
 * quietly stops being a planner.
 */
export const LIKED_WEIGHT = 0.15;

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);

/**
 * Fraction of a recipe's ingredients the user has said they like.
 *
 * A fraction rather than a boolean: a recipe built mostly from favourites is a
 * better match than one that happens to contain a liked garnish, and a boolean
 * cannot tell those apart.
 */
export const likedShare = (
  candidate: MealCandidate,
  likedFoodIds: readonly string[] | undefined,
): number => {
  if (likedFoodIds === undefined || likedFoodIds.length === 0) return 0;

  const foodIds = candidate.foodIds as readonly string[];
  if (foodIds.length === 0) return 0;

  let liked = 0;
  for (const foodId of foodIds) {
    if (likedFoodIds.includes(foodId)) liked += 1;
  }
  return liked / foodIds.length;
};

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
 * The objective the solver actually minimises: distance from the targets, plus
 * a small penalty for a meal the user has shown no taste for.
 *
 * One function used by both passes. Greedy and local search optimising
 * different objectives is how a solver ends up undoing its own good choices.
 */
export const planScore = (
  totals: DayTargets,
  targets: DayTargets,
  meanLikedShare: number,
): number => planError(totals, targets) + LIKED_WEIGHT * (1 - meanLikedShare);

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

  const excludedCategories = constraints.excludedCategorySlugs;
  if (excludedCategories !== undefined && excludedCategories.length > 0) {
    // Unknown categories are rejected, not waved through. A vegetarian asking
    // for no meat is better served by a smaller pool than by one recipe whose
    // ingredients we could not classify.
    const categories = candidate.categorySlugs;
    if (categories === undefined) return false;
    for (const slug of categories) {
      if (excludedCategories.includes(slug)) return false;
    }
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
      const score = planScore(
        {
          calories: planned.kcal,
          proteinG: planned.proteinG,
          carbsG: planned.carbsG,
          fatG: planned.fatG,
        },
        slotTarget,
        likedShare(candidate, constraints.likedFoodIds),
      );

      if (score < bestError) {
        best = planned;
        bestError = score;
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
  const byRecipeId = new Map(candidates.map((c) => [c.recipeId, c]));
  const meanLiked = (meals: readonly PlannedMeal[]): number => {
    if (meals.length === 0) return 0;
    let total = 0;
    for (const meal of meals) {
      const source = byRecipeId.get(meal.recipeId);
      total += source === undefined ? 0 : likedShare(source, constraints.likedFoodIds);
    }
    return total / meals.length;
  };

  let current = chosen;
  let currentError = planScore(sumMeals(current), targets, meanLiked(current));

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
        const trialError = planScore(sumMeals(trial), targets, meanLiked(trial));

        if (trialError < currentError - 1e-9) {
          current = trial;
          currentError = trialError;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  // The reported `error` is the pure distance from target, NOT the objective:
  // the user is told how far the plan is from their numbers, and a figure that
  // secretly included a taste penalty would not mean what it says.
  const totals = sumMeals(current);
  return { ok: true, value: { meals: current, totals, error: planError(totals, targets) } };
};
