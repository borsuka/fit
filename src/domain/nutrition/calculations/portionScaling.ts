import type { NutritionAmount, NutritionPer100g } from '../types';

/**
 * Scales per-100 g nutrition to a concrete gram amount.
 *
 * Grams are the single canonical unit inside the domain. Servings, cups and
 * "one medium" are resolved to grams at the edges, so there is exactly one
 * place where a unit mistake can happen instead of one per feature.
 *
 * Unrounded on purpose: a meal is the sum of its items, and rounding each item
 * before summing accumulates error. Round once, at the point of display.
 */
export const scaleNutrition = (per100g: NutritionPer100g, grams: number): NutritionAmount => {
  const factor = grams / 100;
  return {
    kcal: per100g.kcal * factor,
    proteinG: per100g.proteinG * factor,
    carbsG: per100g.carbsG * factor,
    fatG: per100g.fatG * factor,
    fiberG: (per100g.fiberG ?? 0) * factor,
  };
};

/** Grams for a quantity of a named serving ("2 slices" where 1 slice = 28 g). */
export const gramsFromServing = (servingGrams: number, quantity: number): number =>
  servingGrams * quantity;

/**
 * Grams from a volume, using the food's density.
 *
 * Only valid where a density is known. Without one the caller must ask for a
 * weight rather than guess: 250 ml of oil and 250 ml of milk differ by about
 * 15%, and honey by nearly 50%. Returning `null` forces that decision to be
 * made explicitly instead of defaulting to water and being quietly wrong.
 */
export const gramsFromVolume = (
  millilitres: number,
  densityGPerMl: number | null,
): number | null =>
  densityGPerMl === null || !Number.isFinite(densityGPerMl) || densityGPerMl <= 0
    ? null
    : millilitres * densityGPerMl;

/** Rounds a nutrition amount for display. One decimal on macros, whole kcal. */
export const roundForDisplay = (amount: NutritionAmount): NutritionAmount => ({
  kcal: Math.round(amount.kcal),
  proteinG: Math.round(amount.proteinG * 10) / 10,
  carbsG: Math.round(amount.carbsG * 10) / 10,
  fatG: Math.round(amount.fatG * 10) / 10,
  fiberG: Math.round(amount.fiberG * 10) / 10,
});
