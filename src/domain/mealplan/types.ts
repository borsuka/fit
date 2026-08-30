import type { MealSlot } from './slots';

/**
 * A meal the planner may choose from.
 *
 * Nutrition is per serving and comes from `recipe_nutrition`, which derives it
 * from ingredients. The planner never sees a hand-entered total, and never asks
 * a model for one.
 */
export interface MealCandidate {
  readonly recipeId: string;
  readonly name: string;
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  /** Allergen ids present in the recipe, from food_allergens via ingredients. */
  readonly allergenIds: readonly number[];
  /** Food ids used, so a disliked ingredient can exclude the whole recipe. */
  readonly foodIds: readonly number[] | readonly string[];
  /** Which slots this is appropriate for. Porridge is not dinner. */
  readonly slots: readonly MealSlot[];
  readonly prepMinutes: number | null;
}

export interface PlannedMeal {
  readonly slot: MealSlot;
  readonly recipeId: string;
  readonly name: string;
  /** Scaled to fit the slot budget. Clamped - see SERVING_MIN/MAX. */
  readonly servings: number;
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly locked: boolean;
}

export interface DayTargets {
  readonly calories: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
}

export interface PlanConstraints {
  /** Hard exclusion. Never a preference, never a prompt instruction. */
  readonly excludedAllergenIds: readonly number[];
  readonly dislikedFoodIds: readonly string[];
  readonly maxPrepMinutes: number | null;
}

export interface PlanRequest {
  readonly targets: DayTargets;
  readonly slots: readonly MealSlot[];
  readonly candidates: readonly MealCandidate[];
  readonly constraints: PlanConstraints;
  /** Slots the user pinned. The solver must keep these exactly. */
  readonly locked?: Readonly<Partial<Record<MealSlot, PlannedMeal>>>;
}

export type PlanFailureReason = 'no_candidates' | 'no_candidate_for_slot' | 'targets_invalid';

export interface PlanResult {
  readonly meals: readonly PlannedMeal[];
  readonly totals: DayTargets;
  /** Weighted distance from the targets. Lower is better; 0 is exact. */
  readonly error: number;
}

export type PlanOutcome =
  | { readonly ok: true; readonly value: PlanResult }
  | { readonly ok: false; readonly reason: PlanFailureReason; readonly detail: string };
