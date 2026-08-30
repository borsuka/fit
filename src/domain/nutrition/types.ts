/**
 * Nutrition domain types.
 *
 * Pure data. No I/O, no React, no database rows - service-layer DTOs are mapped
 * into these at the boundary.
 */

export type Sex = 'male' | 'female';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';

export type GoalType = 'lose' | 'maintain' | 'gain' | 'muscle_gain';

export interface BodyProfile {
  readonly sex: Sex;
  readonly ageYears: number;
  readonly heightCm: number;
  readonly weightKg: number;
}

export interface GoalInput {
  readonly goal: GoalType;
  readonly activity: ActivityLevel;
  /** Optional. When absent, a default rate for the goal is used. */
  readonly targetWeightKg?: number;
  /** Optional signed rate, kg per week. Negative loses, positive gains. */
  readonly weeklyRateKg?: number;
}

export interface Macros {
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly fiberG: number;
}

/**
 * Every clamp the safety layer applied, so the UI can explain itself. A target
 * that was silently adjusted is a target the user cannot reason about.
 */
export type AdjustmentCode =
  | 'deficit_capped'
  | 'surplus_capped'
  | 'calorie_floor_applied'
  | 'rate_capped'
  | 'protein_clamped'
  | 'fat_floor_applied'
  | 'carbs_floor_applied';

export interface Adjustment {
  readonly code: AdjustmentCode;
  /** Human-readable detail for the UI; not a translation key by design - the
   *  i18n layer maps `code`, this is for logs and debugging. */
  readonly detail: string;
}

export interface NutritionTargets extends Macros {
  readonly calories: number;
  readonly bmr: number;
  readonly tdee: number;
  /** Signed daily energy delta actually applied, after safety clamping. */
  readonly energyDelta: number;
  readonly adjustments: readonly Adjustment[];
}

/** Codes are stable identifiers the i18n layer maps to messages. */
export type ValidationCode =
  | 'age_below_minimum'
  | 'age_above_maximum'
  | 'height_out_of_range'
  | 'weight_out_of_range'
  | 'target_weight_out_of_range'
  | 'target_weight_below_healthy_bmi'
  | 'target_weight_wrong_direction'
  | 'deficit_goal_not_permitted_for_age'
  | 'non_finite_input';

export interface ValidationError {
  readonly code: ValidationCode;
  readonly field: string;
  readonly detail: string;
}

/**
 * Expected validation failures are returned, not thrown. An unreachable target
 * weight is a normal thing for a user to type; it is not exceptional, and a
 * thrown error would push control flow into a catch block far from the form
 * field that caused it.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = <T>(errors: readonly ValidationError[]): Result<T> => ({ ok: false, errors });

/** Nutrition per 100 g, the canonical form everything scales from. */
export interface NutritionPer100g {
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly fiberG?: number;
}

/** A concrete amount of a food, already resolved to grams. */
export interface NutritionAmount {
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly fiberG: number;
}
