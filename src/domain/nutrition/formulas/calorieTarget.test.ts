import { describe, expect, it } from '@jest/globals';

import type { AdjustmentCode, BodyProfile, GoalInput } from '../types';
import { calculateBmr, calculateTdee } from './bmr';
import {
  calculateCalorieTarget,
  dailyDeltaFromWeeklyRate,
  weeklyRateFromDailyDelta,
} from './calorieTarget';

const codes = (adjustments: readonly { code: AdjustmentCode }[]): AdjustmentCode[] =>
  adjustments.map((a) => a.code);

const tdeeFor = (profile: BodyProfile, activity: GoalInput['activity']): number =>
  calculateTdee(calculateBmr(profile), activity);

describe('calculateCalorieTarget', () => {
  it('leaves maintenance untouched', () => {
    // male 30y 180cm 80kg: BMR 1780, moderate TDEE 1780 * 1.55 = 2759
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };
    const result = calculateCalorieTarget(2759, profile, {
      goal: 'maintain',
      activity: 'moderate',
    });

    expect(result.calories).toBe(2759);
    expect(result.energyDelta).toBe(0);
    expect(result.adjustments).toHaveLength(0);
  });

  it('applies the default 20% deficit when no rate is given', () => {
    // female 25y 160cm 55kg: BMR 1264, sedentary TDEE 1516.8
    // -20% = -303.36 -> 1213.44 -> 1213, above the 1200 floor
    const profile: BodyProfile = { sex: 'female', ageYears: 25, heightCm: 160, weightKg: 55 };
    const tdee = tdeeFor(profile, 'sedentary');
    expect(tdee).toBeCloseTo(1516.8, 6);

    const result = calculateCalorieTarget(tdee, profile, { goal: 'lose', activity: 'sedentary' });
    expect(result.calories).toBe(1213);
    expect(result.adjustments).toHaveLength(0);
  });

  it('raises a too-low target to the absolute floor and says so', () => {
    // female 60y 150cm 45kg: BMR 926.5, sedentary TDEE 1111.8
    // -20% would be 889.44, below the 1200 kcal floor
    const profile: BodyProfile = { sex: 'female', ageYears: 60, heightCm: 150, weightKg: 45 };
    const tdee = tdeeFor(profile, 'sedentary');
    const result = calculateCalorieTarget(tdee, profile, { goal: 'lose', activity: 'sedentary' });

    expect(result.calories).toBe(1200);
    expect(codes(result.adjustments)).toContain('calorie_floor_applied');
    // The floor produces a SURPLUS relative to a 20% cut - the delta must
    // report what was actually applied, not what was asked for.
    expect(result.energyDelta).toBeGreaterThan(-222);
  });

  it('caps an aggressive requested rate, then caps the share of TDEE', () => {
    // male 30y 180cm 90kg: BMR 1880, moderate TDEE 2914.
    // Asking for 2 kg/week = -2200 kcal/day.
    //   rate cap:  1% of 90 kg = 0.9 kg/week -> 990 kcal/day
    //   share cap: 25% of 2914 = 728.5 kcal/day  <- binds
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 90 };
    const tdee = tdeeFor(profile, 'moderate');
    expect(tdee).toBeCloseTo(2914, 6);

    const result = calculateCalorieTarget(tdee, profile, {
      goal: 'lose',
      activity: 'moderate',
      weeklyRateKg: -2,
    });

    expect(codes(result.adjustments)).toEqual(['rate_capped', 'deficit_capped']);
    expect(result.calories).toBe(2186); // 2914 - 728.5 = 2185.5, rounds to 2186
  });

  it('takes direction from the goal, not from the sign the caller passed', () => {
    // A 'lose' goal with a POSITIVE rate is sign confusion upstream. Honouring
    // it literally would produce a surplus labelled "lose".
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 90 };
    const tdee = tdeeFor(profile, 'moderate');

    const negative = calculateCalorieTarget(tdee, profile, {
      goal: 'lose',
      activity: 'moderate',
      weeklyRateKg: -0.5,
    });
    const positive = calculateCalorieTarget(tdee, profile, {
      goal: 'lose',
      activity: 'moderate',
      weeklyRateKg: 0.5,
    });

    expect(positive.calories).toBe(negative.calories);
    expect(positive.calories).toBeLessThan(tdee);
  });

  it('caps a surplus at 15% of TDEE', () => {
    // male 30y 180cm 70kg: BMR 1680, sedentary TDEE 2016.
    // Request 0.318 kg/week -> 349.8 kcal/day.
    //   rate cap:  0.5% of 70 kg = 0.35 kg/week -> 385 kcal/day  (not binding)
    //   share cap: 15% of 2016 = 302.4                            <- binds
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 70 };
    const tdee = tdeeFor(profile, 'sedentary');
    expect(tdee).toBeCloseTo(2016, 6);
    expect(dailyDeltaFromWeeklyRate(0.318)).toBeCloseTo(349.8, 6);

    const result = calculateCalorieTarget(tdee, profile, {
      goal: 'gain',
      activity: 'sedentary',
      weeklyRateKg: 0.318,
    });

    expect(codes(result.adjustments)).toEqual(['surplus_capped']);
    expect(result.calories).toBe(2318); // 2016 + 302.4 = 2318.4
  });

  it('applies the default surplus for a gain goal', () => {
    // male 30y 180cm 70kg moderate: BMR 1680, TDEE 2604; +10% = 2864.4
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 70 };
    const tdee = tdeeFor(profile, 'moderate');
    const result = calculateCalorieTarget(tdee, profile, { goal: 'gain', activity: 'moderate' });

    expect(result.calories).toBe(2864);
    expect(result.adjustments).toHaveLength(0);
  });

  it('gives muscle_gain a larger surplus than plain gain', () => {
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 70 };
    const tdee = tdeeFor(profile, 'moderate');
    const gain = calculateCalorieTarget(tdee, profile, { goal: 'gain', activity: 'moderate' });
    const muscle = calculateCalorieTarget(tdee, profile, {
      goal: 'muscle_gain',
      activity: 'moderate',
    });

    expect(muscle.calories).toBeGreaterThan(gain.calories);
  });

  it('ignores a non-finite rate rather than producing NaN', () => {
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };
    const result = calculateCalorieTarget(2759, profile, {
      goal: 'lose',
      activity: 'moderate',
      weeklyRateKg: Number.NaN,
    });

    expect(Number.isFinite(result.calories)).toBe(true);
    expect(result.calories).toBe(2207); // falls back to the default -20%
  });
});

describe('weeklyRateFromDailyDelta', () => {
  it('is the inverse of dailyDeltaFromWeeklyRate', () => {
    const rate = -0.75;
    expect(weeklyRateFromDailyDelta(dailyDeltaFromWeeklyRate(rate))).toBeCloseTo(rate, 9);
  });

  it('converts a 500 kcal daily deficit to roughly 0.45 kg/week', () => {
    // 500 * 7 / 7700. The familiar "500 a day is half a kilo a week" rule of
    // thumb, which is an approximation - real bodies are not this linear,
    // which is why rate is capped and progress is measured, not assumed.
    expect(weeklyRateFromDailyDelta(-500)).toBeCloseTo(-0.4545, 4);
  });
});
