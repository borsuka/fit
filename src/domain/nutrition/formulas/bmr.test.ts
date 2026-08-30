import { describe, expect, it } from '@jest/globals';

import type { ActivityLevel, BodyProfile } from '../types';
import { calculateBmr, calculateTdee } from './bmr';

/**
 * Expectations are computed by hand from the published Mifflin-St Jeor
 * equation, not copied from a run of the implementation. A test that asserts
 * what the code currently does is a change-detector, not a test.
 */
describe('calculateBmr', () => {
  it('matches the male equation: 10w + 6.25h - 5a + 5', () => {
    // 10(80) + 6.25(180) - 5(30) + 5 = 800 + 1125 - 150 + 5
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };
    expect(calculateBmr(profile)).toBeCloseTo(1780, 6);
  });

  it('matches the female equation: 10w + 6.25h - 5a - 161', () => {
    // 10(65) + 6.25(165) - 5(30) - 161 = 650 + 1031.25 - 150 - 161
    const profile: BodyProfile = { sex: 'female', ageYears: 30, heightCm: 165, weightKg: 65 };
    expect(calculateBmr(profile)).toBeCloseTo(1370.25, 6);
  });

  it('separates the sexes by exactly 166 kcal at identical measurements', () => {
    const base = { ageYears: 40, heightCm: 170, weightKg: 70 } as const;
    const male = calculateBmr({ ...base, sex: 'male' });
    const female = calculateBmr({ ...base, sex: 'female' });
    expect(male - female).toBeCloseTo(166, 6); // 5 - (-161)
  });

  it('decreases by 5 kcal per year of age', () => {
    const at30 = calculateBmr({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 });
    const at31 = calculateBmr({ sex: 'male', ageYears: 31, heightCm: 180, weightKg: 80 });
    expect(at30 - at31).toBeCloseTo(5, 6);
  });

  it('increases by 10 kcal per kg of body mass', () => {
    const at80 = calculateBmr({ sex: 'female', ageYears: 25, heightCm: 165, weightKg: 80 });
    const at81 = calculateBmr({ sex: 'female', ageYears: 25, heightCm: 165, weightKg: 81 });
    expect(at81 - at80).toBeCloseTo(10, 6);
  });

  it('increases by 6.25 kcal per cm of height', () => {
    const at170 = calculateBmr({ sex: 'male', ageYears: 25, heightCm: 170, weightKg: 70 });
    const at171 = calculateBmr({ sex: 'male', ageYears: 25, heightCm: 171, weightKg: 70 });
    expect(at171 - at170).toBeCloseTo(6.25, 6);
  });

  it('does not round - rounding belongs at the end of the pipeline', () => {
    const value = calculateBmr({ sex: 'female', ageYears: 30, heightCm: 165, weightKg: 65 });
    expect(Number.isInteger(value)).toBe(false);
  });
});

describe('calculateTdee', () => {
  // Typed explicitly rather than `as const`: a readonly tuple is not assignable
  // to the mutable parameter list @jest/globals declares for `each`.
  const tdeeCases: [activity: ActivityLevel, multiplier: number, expected: number][] = [
    ['sedentary', 1.2, 2136],
    ['light', 1.375, 2447.5],
    ['moderate', 1.55, 2759],
    ['very', 1.725, 3070.5],
    ['extra', 1.9, 3382],
  ];

  it.each(tdeeCases)('applies the %s multiplier (%s)', (activity, _multiplier, expected) => {
    expect(calculateTdee(1780, activity)).toBeCloseTo(expected, 6);
  });

  it('is monotonic across activity levels', () => {
    const bmr = 1600;
    const values = (['sedentary', 'light', 'moderate', 'very', 'extra'] as const).map((a) =>
      calculateTdee(bmr, a),
    );
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });
});
