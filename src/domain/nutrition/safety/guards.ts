import {
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MIN_HEALTHY_BMI,
  MIN_HEIGHT_CM,
  MIN_WEIGHT_KG,
} from '../constants';
import type { BodyProfile, GoalInput, ValidationError } from '../types';
import {
  DEFAULT_AGE_POLICY,
  isAgeAllowed,
  isDeficitGoalAllowed,
  type AgePolicy,
} from './agePolicy';

/** BMI in kg/m². */
export const bmi = (weightKg: number, heightCm: number): number => {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
};

/** The lightest weight that still sits at or above the healthy BMI floor. */
export const minHealthyWeightKg = (heightCm: number): number => {
  const heightM = heightCm / 100;
  return MIN_HEALTHY_BMI * heightM * heightM;
};

const error = (code: ValidationError['code'], field: string, detail: string): ValidationError => ({
  code,
  field,
  detail,
});

const isFinitePositive = (n: number): boolean => Number.isFinite(n) && n > 0;

export const validateBodyProfile = (
  profile: BodyProfile,
  policy: AgePolicy = DEFAULT_AGE_POLICY,
): readonly ValidationError[] => {
  const errors: ValidationError[] = [];

  // Guard non-finite input first. Every downstream formula is arithmetic, and
  // NaN propagates silently all the way to a macro ring that renders empty -
  // which reads to the user as "no data" rather than "we have a bug".
  for (const [field, value] of [
    ['ageYears', profile.ageYears],
    ['heightCm', profile.heightCm],
    ['weightKg', profile.weightKg],
  ] as const) {
    if (!Number.isFinite(value)) {
      errors.push(error('non_finite_input', field, `${field} must be a finite number`));
    }
  }
  if (errors.length > 0) return errors;

  if (profile.ageYears < policy.minAge) {
    errors.push(
      error('age_below_minimum', 'ageYears', `must be at least ${policy.minAge} years old`),
    );
  } else if (!isAgeAllowed(profile.ageYears, policy)) {
    errors.push(error('age_above_maximum', 'ageYears', `must be at most ${policy.maxAge}`));
  }

  if (profile.heightCm < MIN_HEIGHT_CM || profile.heightCm > MAX_HEIGHT_CM) {
    errors.push(
      error('height_out_of_range', 'heightCm', `must be ${MIN_HEIGHT_CM}-${MAX_HEIGHT_CM} cm`),
    );
  }

  if (profile.weightKg < MIN_WEIGHT_KG || profile.weightKg > MAX_WEIGHT_KG) {
    errors.push(
      error('weight_out_of_range', 'weightKg', `must be ${MIN_WEIGHT_KG}-${MAX_WEIGHT_KG} kg`),
    );
  }

  return errors;
};

export const validateGoal = (
  profile: BodyProfile,
  goal: GoalInput,
  policy: AgePolicy = DEFAULT_AGE_POLICY,
): readonly ValidationError[] => {
  const errors: ValidationError[] = [];

  if (goal.goal === 'lose' && !isDeficitGoalAllowed(profile.ageYears, policy)) {
    errors.push(
      error(
        'deficit_goal_not_permitted_for_age',
        'goal',
        `weight-loss goals require age ${policy.minAgeForDeficitGoals}+`,
      ),
    );
  }

  const target = goal.targetWeightKg;
  if (target !== undefined) {
    if (!isFinitePositive(target)) {
      errors.push(error('non_finite_input', 'targetWeightKg', 'must be a finite number'));
      return errors;
    }

    if (target < MIN_WEIGHT_KG || target > MAX_WEIGHT_KG) {
      errors.push(
        error(
          'target_weight_out_of_range',
          'targetWeightKg',
          `must be ${MIN_WEIGHT_KG}-${MAX_WEIGHT_KG} kg`,
        ),
      );
    } else if (bmi(target, profile.heightCm) < MIN_HEALTHY_BMI) {
      // A hard stop. An app that helps someone aim below a healthy BMI is
      // causing harm, not tracking it.
      const floor = minHealthyWeightKg(profile.heightCm);
      errors.push(
        error(
          'target_weight_below_healthy_bmi',
          'targetWeightKg',
          `below a healthy BMI for this height; the lowest supported target is ${floor.toFixed(1)} kg`,
        ),
      );
    }

    // A 'lose' goal with a target above current weight is almost always a typo
    // or a mis-tapped unit. Accepting it produces a surplus labelled "lose".
    if (goal.goal === 'lose' && target > profile.weightKg) {
      errors.push(
        error(
          'target_weight_wrong_direction',
          'targetWeightKg',
          'a weight-loss target must be below current weight',
        ),
      );
    }
    if ((goal.goal === 'gain' || goal.goal === 'muscle_gain') && target < profile.weightKg) {
      errors.push(
        error(
          'target_weight_wrong_direction',
          'targetWeightKg',
          'a weight-gain target must be above current weight',
        ),
      );
    }
  }

  return errors;
};
