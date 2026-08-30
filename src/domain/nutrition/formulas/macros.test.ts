import { describe, expect, it } from '@jest/globals';

import { MACRO_SUM_TOLERANCE_KCAL } from '../constants';
import type { AdjustmentCode, BodyProfile } from '../types';
import { calculateMacros, macroEnergyKcal, referenceWeightKg } from './macros';

const codes = (adjustments: readonly { code: AdjustmentCode }[]): AdjustmentCode[] =>
  adjustments.map((a) => a.code);

describe('referenceWeightKg', () => {
  it('uses actual body weight at a normal BMI', () => {
    // 80 kg at 180 cm = BMI 24.7
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };
    expect(referenceWeightKg(profile)).toBe(80);
  });

  it('caps at the top of the healthy BMI band above BMI 30', () => {
    // 130 kg at 175 cm = BMI 42.4. Reference becomes 25 * 1.75^2 = 76.5625 kg.
    // Scaling protein from actual mass would prescribe 260 g/day - a number
    // that is neither achievable nor useful. Adipose tissue has little protein
    // demand.
    const profile: BodyProfile = { sex: 'male', ageYears: 40, heightCm: 175, weightKg: 130 };
    expect(referenceWeightKg(profile)).toBeCloseTo(76.5625, 6);
  });

  it('switches exactly at BMI 30, not before', () => {
    // 30 * 1.80^2 = 97.2 kg is exactly BMI 30
    const at30: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 97.2 };
    expect(referenceWeightKg(at30)).toBeCloseTo(97.2, 6);

    const above: BodyProfile = { ...at30, weightKg: 97.3 };
    expect(referenceWeightKg(above)).toBeLessThan(97.3);
  });
});

describe('calculateMacros', () => {
  it('splits a comfortable target with the arithmetic closing exactly', () => {
    // male 80 kg, 180 cm, 2000 kcal, losing:
    //   protein 2.0 g/kg = 160 g = 640 kcal
    //   fat     27% of 2000 / 9 = 60 g = 540 kcal  (floor 48 g does not bind)
    //   carbs   remainder 820 kcal = 205 g
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };
    const result = calculateMacros(2000, profile, 'lose');

    expect(result.proteinG).toBe(160);
    expect(result.fatG).toBe(60);
    expect(result.carbsG).toBe(205);
    expect(macroEnergyKcal(result)).toBe(2000);
    expect(result.adjustments).toHaveLength(0);
  });

  it('gives a deficit more protein than maintenance', () => {
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };
    const losing = calculateMacros(2000, profile, 'lose');
    const maintaining = calculateMacros(2000, profile, 'maintain');

    // 2.0 g/kg vs 1.6 g/kg - protein preserves lean mass when energy is scarce
    expect(losing.proteinG).toBe(160);
    expect(maintaining.proteinG).toBe(128);
  });

  it('raises fat to its absolute floor when the percentage falls short', () => {
    // male 80 kg at 1500 kcal: 27% of 1500 / 9 = 45 g, but the floor is
    // 0.6 * 80 = 48 g. Below roughly this level, fat-soluble vitamin
    // absorption and hormone production suffer.
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };
    const result = calculateMacros(1500, profile, 'lose');

    expect(result.fatG).toBe(48);
    expect(codes(result.adjustments)).toContain('fat_floor_applied');
  });

  it('buys carbohydrate back from protein on a tight budget, and reports it', () => {
    // male 80 kg at 1200 kcal:
    //   protein 160 g = 640, fat floor 48 g = 432  ->  carbs only 128 kcal
    //   fat is already at its floor, so protein gives way, down toward
    //   1.4 g/kg (112 g), until carbohydrate reaches its 50 g reference floor
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };
    const result = calculateMacros(1200, profile, 'lose');

    expect(result.proteinG).toBe(142);
    expect(result.fatG).toBe(48);
    expect(result.carbsG).toBe(50);
    expect(macroEnergyKcal(result)).toBe(1200);
    expect(codes(result.adjustments)).toContain('protein_clamped');
    expect(codes(result.adjustments)).toContain('fat_floor_applied');
  });

  it('never emits a negative carbohydrate figure', () => {
    // An absurdly low target against a large reference weight. The floors
    // cannot all be met; protein and fat scale down to fit rather than
    // producing a negative remainder.
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 190, weightKg: 100 };
    const result = calculateMacros(600, profile, 'lose');

    expect(result.carbsG).toBeGreaterThanOrEqual(0);
    expect(result.proteinG).toBeGreaterThan(0);
    expect(result.fatG).toBeGreaterThan(0);
    expect(Math.abs(macroEnergyKcal(result) - 600)).toBeLessThanOrEqual(MACRO_SUM_TOLERANCE_KCAL);
    expect(codes(result.adjustments)).toContain('carbs_floor_applied');
  });

  it('scales fibre with energy and clamps it to a sensible band', () => {
    const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };

    expect(calculateMacros(2000, profile, 'maintain').fiberG).toBe(28); // 2.0 * 14
    expect(calculateMacros(1000, profile, 'maintain').fiberG).toBe(20); // 14 -> floor 20
    expect(calculateMacros(5000, profile, 'maintain').fiberG).toBe(50); // 70 -> ceiling 50
  });

  it('bases protein on the reference weight, not actual weight, at high BMI', () => {
    // 130 kg at 175 cm -> reference 76.5625 kg -> 2.0 g/kg = 153.125 -> 153 g
    const profile: BodyProfile = { sex: 'male', ageYears: 40, heightCm: 175, weightKg: 130 };
    const result = calculateMacros(2200, profile, 'lose');

    expect(result.proteinG).toBe(153);
  });
});

describe('macroEnergyKcal', () => {
  it('uses Atwater factors: 4 / 4 / 9', () => {
    expect(macroEnergyKcal({ proteinG: 10, carbsG: 10, fatG: 10 })).toBe(170);
  });
});

describe('calculateMacros - defensive branches', () => {
  it('takes carbohydrate back from fat before touching protein', () => {
    // A boundary probe rather than a realistic user: with the calorie floors in
    // place this ordering rarely fires, but the branch decides which macro
    // gives way first and should not be able to silently invert.
    //
    // ref 30 kg at 601 kcal: fat from energy is 18.03 g, a hair ABOVE its 18 g
    // floor, so no floor adjustment is reported - yet fat still ends at exactly
    // 18 g, because that 0.03 g was spent on carbohydrate before protein was
    // touched. That combination is what pins the ordering.
    const profile: BodyProfile = { sex: 'female', ageYears: 30, heightCm: 160, weightKg: 30 };
    const result = calculateMacros(601, profile, 'lose');

    expect(codes(result.adjustments)).not.toContain('fat_floor_applied');
    expect(result.fatG).toBe(18);
    expect(codes(result.adjustments)).toContain('protein_clamped');
    // Protein gave way by 0.25 g (60 -> 59.75), which rounds back to 60 for
    // display. The adjustment code is the honest signal here, not the gram
    // figure.
    expect(result.proteinG).toBe(60);
  });
});
