import { describe, expect, it } from '@jest/globals';

import type { BodyProfile, GoalInput, ValidationCode } from '../types';
import {
  ageFromDateOfBirth,
  DEFAULT_AGE_POLICY,
  isAgeAllowed,
  isDeficitGoalAllowed,
  type AgePolicy,
} from './agePolicy';
import { bmi, minHealthyWeightKg, validateBodyProfile, validateGoal } from './guards';

const codes = (errors: readonly { code: ValidationCode }[]): ValidationCode[] =>
  errors.map((e) => e.code);

const adult: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };

/**
 * The safety rails exist for the users least able to absorb a mistake, so they
 * are tested with inputs chosen to break them rather than with a typical
 * thirty-year-old.
 */
describe('validateBodyProfile', () => {
  it('accepts a valid adult', () => {
    expect(validateBodyProfile(adult)).toHaveLength(0);
  });

  it('rejects a minor', () => {
    const errors = validateBodyProfile({ ...adult, ageYears: 17 });
    expect(codes(errors)).toContain('age_below_minimum');
  });

  it('accepts exactly the minimum age', () => {
    expect(validateBodyProfile({ ...adult, ageYears: 18 })).toHaveLength(0);
  });

  // Typed explicitly rather than `as const`: a readonly tuple is not assignable
  // to the mutable parameter list @jest/globals declares for `each`.
  const outOfRange: [label: string, patch: Partial<BodyProfile>, expected: ValidationCode][] = [
    ['age', { ageYears: 101 }, 'age_above_maximum'],
    ['height low', { heightCm: 119 }, 'height_out_of_range'],
    ['height high', { heightCm: 251 }, 'height_out_of_range'],
    ['weight low', { weightKg: 29 }, 'weight_out_of_range'],
    ['weight high', { weightKg: 301 }, 'weight_out_of_range'],
  ];

  it.each(outOfRange)('rejects out-of-range %s', (_label, patch, expected) => {
    expect(codes(validateBodyProfile({ ...adult, ...patch }))).toContain(expected);
  });

  const nonFinite: [label: string, value: number][] = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ];

  it.each(nonFinite)('rejects %s before any arithmetic runs', (_label, value) => {
    // NaN propagates silently through every downstream formula and surfaces as
    // an empty macro ring, which reads to the user as "no data" rather than
    // "we have a bug".
    const errors = validateBodyProfile({ ...adult, weightKg: value });
    expect(codes(errors)).toEqual(['non_finite_input']);
  });

  it('reports every out-of-range field at once, not just the first', () => {
    const errors = validateBodyProfile({ sex: 'female', ageYears: 5, heightCm: 90, weightKg: 15 });
    expect(errors).toHaveLength(3);
  });
});

describe('validateGoal', () => {
  it('accepts a sensible loss target', () => {
    const goal: GoalInput = { goal: 'lose', activity: 'moderate', targetWeightKg: 75 };
    expect(validateGoal(adult, goal)).toHaveLength(0);
  });

  it('refuses a target below a healthy BMI', () => {
    // 55 kg at 180 cm is BMI 17.0. An app that helps someone aim below the
    // healthy band is causing harm, not tracking it.
    const goal: GoalInput = { goal: 'lose', activity: 'moderate', targetWeightKg: 55 };
    expect(codes(validateGoal(adult, goal))).toContain('target_weight_below_healthy_bmi');
  });

  it('accepts a target exactly at the healthy BMI floor', () => {
    const floor = minHealthyWeightKg(adult.heightCm); // 18.5 * 1.8^2 = 59.94
    expect(floor).toBeCloseTo(59.94, 2);
    const goal: GoalInput = { goal: 'lose', activity: 'moderate', targetWeightKg: floor };
    expect(validateGoal(adult, goal)).toHaveLength(0);
  });

  it('catches a loss target above current weight', () => {
    const goal: GoalInput = { goal: 'lose', activity: 'moderate', targetWeightKg: 90 };
    expect(codes(validateGoal(adult, goal))).toContain('target_weight_wrong_direction');
  });

  it('catches a gain target below current weight', () => {
    const goal: GoalInput = { goal: 'gain', activity: 'moderate', targetWeightKg: 70 };
    expect(codes(validateGoal(adult, goal))).toContain('target_weight_wrong_direction');
  });

  it('refuses a deficit goal below the age policy threshold', () => {
    // A 16+ policy that still bars dieting: track and maintain, do not cut.
    const policy: AgePolicy = { minAge: 16, maxAge: 100, minAgeForDeficitGoals: 18 };
    const teen: BodyProfile = { ...adult, ageYears: 16 };

    expect(validateBodyProfile(teen, policy)).toHaveLength(0);
    expect(codes(validateGoal(teen, { goal: 'lose', activity: 'light' }, policy))).toContain(
      'deficit_goal_not_permitted_for_age',
    );
    expect(validateGoal(teen, { goal: 'maintain', activity: 'light' }, policy)).toHaveLength(0);
  });

  it('has no opinion when no target weight is given', () => {
    expect(validateGoal(adult, { goal: 'lose', activity: 'moderate' })).toHaveLength(0);
  });
});

describe('bmi', () => {
  it('computes kg per square metre', () => {
    expect(bmi(80, 180)).toBeCloseTo(24.691, 3);
  });
});

describe('ageFromDateOfBirth', () => {
  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageFromDateOfBirth(new Date('2000-12-31'), new Date('2026-01-01'))).toBe(25);
  });

  it('counts the birthday on the day itself', () => {
    expect(ageFromDateOfBirth(new Date('2000-06-15'), new Date('2026-06-15'))).toBe(26);
  });

  it('does not count it the day before', () => {
    // The whole point of an age gate is the boundary, and (now - dob) / 365.25
    // is wrong by a day right here.
    expect(ageFromDateOfBirth(new Date('2000-06-15'), new Date('2026-06-14'))).toBe(25);
  });

  it('uses the default policy of 18+', () => {
    expect(DEFAULT_AGE_POLICY.minAge).toBe(18);
    expect(DEFAULT_AGE_POLICY.minAgeForDeficitGoals).toBe(18);
  });
});

describe('validateGoal - malformed target weights', () => {
  it('rejects a non-finite target weight before any BMI arithmetic', () => {
    const errors = validateGoal(adult, {
      goal: 'lose',
      activity: 'moderate',
      targetWeightKg: Number.NaN,
    });
    expect(codes(errors)).toEqual(['non_finite_input']);
  });

  it('rejects a target weight outside the supported range', () => {
    expect(
      codes(validateGoal(adult, { goal: 'lose', activity: 'moderate', targetWeightKg: 25 })),
    ).toContain('target_weight_out_of_range');
  });
});

describe('age policy predicates', () => {
  it('treats a non-finite age as not allowed rather than throwing', () => {
    expect(isAgeAllowed(Number.NaN)).toBe(false);
    expect(isDeficitGoalAllowed(Number.NaN)).toBe(false);
  });
});
