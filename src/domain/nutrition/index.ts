/**
 * Nutrition engine — pure business logic.
 *
 * No I/O, no React, no database. Enforced by ESLint zones and
 * dependency-cruiser; see docs/ARCHITECTURE.md section 3.
 */
export * from './types';
export * from './constants';
export * from './targets';
export { calculateBmr, calculateTdee } from './formulas/bmr';
export {
  calculateCalorieTarget,
  calculateEnergyDelta,
  dailyDeltaFromWeeklyRate,
  weeklyRateFromDailyDelta,
} from './formulas/calorieTarget';
export { calculateMacros, macroEnergyKcal, referenceWeightKg } from './formulas/macros';
export {
  DEFAULT_AGE_POLICY,
  ageFromDateOfBirth,
  isAgeAllowed,
  isDeficitGoalAllowed,
  type AgePolicy,
} from './safety/agePolicy';
export { bmi, minHealthyWeightKg, validateBodyProfile, validateGoal } from './safety/guards';
export {
  gramsFromServing,
  gramsFromVolume,
  roundForDisplay,
  scaleNutrition,
} from './calculations/portionScaling';
export {
  EMPTY_TOTAL,
  macroDistribution,
  progressFraction,
  remainingAgainstTargets,
  sumNutrition,
  type MacroDistribution,
  type RemainingAgainstTargets,
} from './calculations/totals';
