import type { NutritionAmount, NutritionTargets } from '../types';

export const EMPTY_TOTAL: NutritionAmount = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
};

/**
 * Sums nutrition amounts.
 *
 * Meal totals and day totals are the same operation at different scopes, so
 * there is one implementation rather than two that can disagree. A day is the
 * sum of its meals; a meal is the sum of its items.
 */
export const sumNutrition = (amounts: readonly NutritionAmount[]): NutritionAmount =>
  amounts.reduce<NutritionAmount>(
    (acc, a) => ({
      kcal: acc.kcal + a.kcal,
      proteinG: acc.proteinG + a.proteinG,
      carbsG: acc.carbsG + a.carbsG,
      fatG: acc.fatG + a.fatG,
      fiberG: acc.fiberG + a.fiberG,
    }),
    EMPTY_TOTAL,
  );

export interface RemainingAgainstTargets {
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly fiberG: number;
  readonly isOverCalories: boolean;
}

/**
 * What is left of the day's budget.
 *
 * Values go NEGATIVE past the target rather than clamping at zero. Hiding an
 * overshoot behind "0 remaining" withholds the one number the user most needs
 * to see, and it is their data, not ours to soften.
 */
export const remainingAgainstTargets = (
  targets: Pick<NutritionTargets, 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG'>,
  consumed: NutritionAmount,
): RemainingAgainstTargets => {
  const kcal = targets.calories - consumed.kcal;
  return {
    kcal,
    proteinG: targets.proteinG - consumed.proteinG,
    carbsG: targets.carbsG - consumed.carbsG,
    fatG: targets.fatG - consumed.fatG,
    fiberG: targets.fiberG - consumed.fiberG,
    isOverCalories: kcal < 0,
  };
};

/**
 * Progress toward a target as a fraction, for progress bars and rings.
 *
 * Not clamped to 1: a ring that stops at "full" cannot distinguish 100% from
 * 160%, and the caller decides how to render an overshoot. A zero or invalid
 * target returns 0 rather than Infinity - a NaN reaching the UI renders as an
 * empty ring, which reads as "no data" instead of "we have a bug".
 */
export const progressFraction = (consumed: number, target: number): number => {
  if (!Number.isFinite(consumed) || !Number.isFinite(target) || target <= 0) return 0;
  return consumed / target;
};

/** Share of total energy contributed by each macronutrient, for a pie/bar. */
export interface MacroDistribution {
  readonly proteinPct: number;
  readonly carbsPct: number;
  readonly fatPct: number;
}

export const macroDistribution = (amount: NutritionAmount): MacroDistribution => {
  const proteinKcal = amount.proteinG * 4;
  const carbsKcal = amount.carbsG * 4;
  const fatKcal = amount.fatG * 9;
  const total = proteinKcal + carbsKcal + fatKcal;

  if (total <= 0) {
    return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
  }

  return {
    proteinPct: (proteinKcal / total) * 100,
    carbsPct: (carbsKcal / total) * 100,
    fatPct: (fatKcal / total) * 100,
  };
};
