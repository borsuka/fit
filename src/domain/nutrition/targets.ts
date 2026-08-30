import { calculateBmr, calculateTdee } from './formulas/bmr';
import { calculateCalorieTarget } from './formulas/calorieTarget';
import { calculateMacros } from './formulas/macros';
import { DEFAULT_AGE_POLICY, type AgePolicy } from './safety/agePolicy';
import { validateBodyProfile, validateGoal } from './safety/guards';
import {
  err,
  ok,
  type BodyProfile,
  type GoalInput,
  type NutritionTargets,
  type Result,
} from './types';

/**
 * The entry point for the nutrition engine.
 *
 *   profile + goal
 *     -> validate (returns, never throws)
 *     -> BMR (Mifflin-St Jeor)
 *     -> TDEE (activity multiplier)
 *     -> energy delta, rate- and share-capped
 *     -> calorie target, floor enforced
 *     -> macro split, floors enforced
 *
 * Every clamp the safety layer applied comes back in `adjustments`, so the UI
 * can say what it changed and why. A target that was silently adjusted is a
 * target the user cannot reason about - and quietly overriding what someone
 * asked for, with no explanation, is how an app loses trust it cannot rebuy.
 *
 * The result is an ESTIMATE. It is not medical advice, and the UI must present
 * it as a starting point that measured weight change will correct.
 */
export const calculateNutritionTargets = (
  profile: BodyProfile,
  goal: GoalInput,
  policy: AgePolicy = DEFAULT_AGE_POLICY,
): Result<NutritionTargets> => {
  const errors = [...validateBodyProfile(profile, policy), ...validateGoal(profile, goal, policy)];
  if (errors.length > 0) {
    return err(errors);
  }

  const bmr = calculateBmr(profile);
  const tdee = calculateTdee(bmr, goal.activity);

  const {
    calories,
    energyDelta,
    adjustments: energyAdjustments,
  } = calculateCalorieTarget(tdee, profile, goal);

  const {
    proteinG,
    carbsG,
    fatG,
    fiberG,
    adjustments: macroAdjustments,
  } = calculateMacros(calories, profile, goal.goal);

  return ok({
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    energyDelta: Math.round(energyDelta),
    adjustments: [...energyAdjustments, ...macroAdjustments],
  });
};
