import { describe, expect, it } from '@jest/globals';

import {
  CALORIE_CEILING,
  CALORIE_FLOOR,
  MACRO_SUM_TOLERANCE_KCAL,
  MAX_DEFICIT_FRACTION,
  MAX_SURPLUS_FRACTION,
  PROTEIN_G_PER_KG_MAX,
  PROTEIN_G_PER_KG_MIN,
} from './constants';
import { macroEnergyKcal, referenceWeightKg } from './formulas/macros';
import { calculateNutritionTargets } from './targets';
import type { ActivityLevel, BodyProfile, GoalType, Sex } from './types';

describe('calculateNutritionTargets', () => {
  const profile: BodyProfile = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 };

  it('produces a complete target set for a typical user', () => {
    const result = calculateNutritionTargets(profile, { goal: 'lose', activity: 'moderate' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // BMR 1780, TDEE 1780 * 1.55 = 2759, -20% -> 2207.2 -> 2207
    expect(result.value.bmr).toBe(1780);
    expect(result.value.tdee).toBe(2759);
    expect(result.value.calories).toBe(2207);
    expect(result.value.energyDelta).toBe(-552);

    // Carbohydrate is the remainder rounded to whole grams, so the macro sum
    // lands within a couple of kcal rather than exactly on the target. Here:
    // protein 160 g (640) + fat 66 g (594) leaves 973 kcal, and 243.25 g of
    // carbohydrate rounds to 243 g (972) - one kcal short by construction.
    expect(Math.abs(macroEnergyKcal(result.value) - result.value.calories)).toBeLessThanOrEqual(
      MACRO_SUM_TOLERANCE_KCAL,
    );
  });

  it('returns validation errors instead of throwing', () => {
    // An unreachable target weight is a normal thing for a user to type. It is
    // not exceptional, and a thrown error would push control flow into a catch
    // block far from the form field that caused it.
    const result = calculateNutritionTargets(profile, {
      goal: 'lose',
      activity: 'moderate',
      targetWeightKg: 50,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toContain('target_weight_below_healthy_bmi');
  });

  it('explains every clamp it applied', () => {
    // female 60y 150cm 45kg sedentary: a 20% cut lands below the 1200 floor
    const small: BodyProfile = { sex: 'female', ageYears: 60, heightCm: 150, weightKg: 45 };
    const result = calculateNutritionTargets(small, { goal: 'lose', activity: 'sedentary' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.calories).toBe(1200);
    expect(result.value.adjustments.map((a) => a.code)).toContain('calorie_floor_applied');
    // A target that was silently adjusted is a target the user cannot reason
    // about, so the detail has to be presentable, not just a code.
    expect(result.value.adjustments[0]?.detail.length).toBeGreaterThan(0);
  });

  it('refuses a minor outright', () => {
    const result = calculateNutritionTargets(
      { ...profile, ageYears: 15 },
      {
        goal: 'lose',
        activity: 'moderate',
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toContain('age_below_minimum');
  });
});

/**
 * Properties that must hold for EVERY valid input, checked over a generated
 * matrix rather than a handful of examples.
 *
 * 2 sexes x 4 ages x 3 heights x 4 weights x 5 activities x 4 goals = 1920
 * combinations, minus those the guards legitimately reject.
 */
describe('invariants across the full input matrix', () => {
  const sexes: readonly Sex[] = ['male', 'female'];
  const ages = [18, 30, 55, 100];
  const heights = [150, 175, 200];
  const weights = [40, 70, 110, 180];
  const activities: readonly ActivityLevel[] = ['sedentary', 'light', 'moderate', 'very', 'extra'];
  const goals: readonly GoalType[] = ['lose', 'maintain', 'gain', 'muscle_gain'];

  const cases: { profile: BodyProfile; goal: GoalType; activity: ActivityLevel }[] = [];
  for (const sex of sexes)
    for (const ageYears of ages)
      for (const heightCm of heights)
        for (const weightKg of weights)
          for (const activity of activities)
            for (const goal of goals)
              cases.push({ profile: { sex, ageYears, heightCm, weightKg }, goal, activity });

  it('covers the whole matrix', () => {
    expect(cases).toHaveLength(1920);
  });

  it('never produces a non-finite or negative number', () => {
    for (const { profile, goal, activity } of cases) {
      const result = calculateNutritionTargets(profile, { goal, activity });
      if (!result.ok) continue;
      const t = result.value;

      for (const [field, value] of Object.entries({
        calories: t.calories,
        proteinG: t.proteinG,
        carbsG: t.carbsG,
        fatG: t.fatG,
        fiberG: t.fiberG,
        bmr: t.bmr,
        tdee: t.tdee,
      })) {
        // A NaN reaching the UI renders as an empty macro ring, which reads as
        // "no data" rather than "we have a bug".
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(value)).toBe(true);
        if (!Number.isFinite(value)) throw new Error(`${field} was not finite`);
      }
    }
  });

  it('closes the macro arithmetic within tolerance', () => {
    for (const { profile, goal, activity } of cases) {
      const result = calculateNutritionTargets(profile, { goal, activity });
      if (!result.ok) continue;

      const diff = Math.abs(macroEnergyKcal(result.value) - result.value.calories);
      expect(diff).toBeLessThanOrEqual(MACRO_SUM_TOLERANCE_KCAL);
    }
  });

  it('never drops below the absolute calorie floor', () => {
    for (const { profile, goal, activity } of cases) {
      const result = calculateNutritionTargets(profile, { goal, activity });
      if (!result.ok) continue;
      expect(result.value.calories).toBeGreaterThanOrEqual(CALORIE_FLOOR[profile.sex]);
    }
  });

  it('respects the deficit and surplus caps', () => {
    for (const { profile, goal, activity } of cases) {
      const result = calculateNutritionTargets(profile, { goal, activity });
      if (!result.ok) continue;
      const { calories, tdee } = result.value;

      // calories = clamp(tdee + delta) with delta bounded, then floored, then
      // ceilinged - so both bounds hold at once. Allow 1 kcal of rounding plus
      // a float epsilon: tdee * 1.15 is not exact in binary, so a bare
      // `<= upper + 1` fails by 5e-13 on otherwise correct values.
      const slack = 1 + 1e-6;

      const lower = Math.min(
        CALORIE_CEILING,
        Math.max(CALORIE_FLOOR[profile.sex], tdee * (1 - MAX_DEFICIT_FRACTION)),
      );
      expect(lower - calories).toBeLessThanOrEqual(slack);

      const upper = Math.max(
        CALORIE_FLOOR[profile.sex],
        Math.min(CALORIE_CEILING, tdee * (1 + MAX_SURPLUS_FRACTION)),
      );
      expect(calories - upper).toBeLessThanOrEqual(slack);
    }
  });

  it('keeps protein within its permitted band, or reports why not', () => {
    for (const { profile, goal, activity } of cases) {
      const result = calculateNutritionTargets(profile, { goal, activity });
      if (!result.ok) continue;

      const perKg = result.value.proteinG / referenceWeightKg(profile);
      const wasReduced = result.value.adjustments.some(
        (a) => a.code === 'protein_clamped' || a.code === 'carbs_floor_applied',
      );

      expect(perKg).toBeLessThanOrEqual(PROTEIN_G_PER_KG_MAX + 0.02);
      if (!wasReduced) {
        // 0.02 absorbs rounding to whole grams at low reference weights.
        expect(perKg).toBeGreaterThanOrEqual(PROTEIN_G_PER_KG_MIN - 0.02);
      }
    }
  });

  it('is monotonic: more activity never means fewer calories', () => {
    for (const sex of sexes)
      for (const goal of goals) {
        const p: BodyProfile = { sex, ageYears: 30, heightCm: 175, weightKg: 75 };
        const values = activities.map((activity) => {
          const r = calculateNutritionTargets(p, { goal, activity });
          return r.ok ? r.value.calories : 0;
        });
        for (let i = 1; i < values.length; i += 1) {
          expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
        }
      }
  });

  it('orders the goals: lose < maintain < gain <= muscle_gain', () => {
    for (const sex of sexes) {
      const p: BodyProfile = { sex, ageYears: 30, heightCm: 175, weightKg: 75 };
      const cal = (goal: GoalType): number => {
        const r = calculateNutritionTargets(p, { goal, activity: 'moderate' });
        return r.ok ? r.value.calories : Number.NaN;
      };
      expect(cal('lose')).toBeLessThan(cal('maintain'));
      expect(cal('maintain')).toBeLessThan(cal('gain'));
      expect(cal('gain')).toBeLessThanOrEqual(cal('muscle_gain'));
    }
  });
});
