import {
  CARBS_G_MIN,
  FAT_ENERGY_FRACTION,
  FAT_G_PER_KG_MIN,
  FIBER_G_MAX,
  FIBER_G_MIN,
  FIBER_G_PER_1000_KCAL,
  HIGH_BMI_THRESHOLD,
  KCAL_PER_G_CARBS,
  KCAL_PER_G_FAT,
  KCAL_PER_G_PROTEIN,
  MAX_HEALTHY_BMI,
  PROTEIN_G_PER_KG,
  PROTEIN_G_PER_KG_MAX,
  PROTEIN_G_PER_KG_MIN,
} from '../constants';
import { bmi } from '../safety/guards';
import type { Adjustment, BodyProfile, GoalType, Macros } from '../types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * The weight protein and fat targets are scaled from.
 *
 * For most people this is simply their body weight. Above BMI 30 it is the
 * weight at the top of the healthy BMI band instead, because scaling protein
 * from actual mass would prescribe 300 g/day to a 150 kg user - a number that
 * is neither achievable nor useful. Adipose tissue has little protein demand.
 */
export const referenceWeightKg = (profile: BodyProfile): number => {
  if (bmi(profile.weightKg, profile.heightCm) <= HIGH_BMI_THRESHOLD) {
    return profile.weightKg;
  }
  const heightM = profile.heightCm / 100;
  return MAX_HEALTHY_BMI * heightM * heightM;
};

export interface MacroResult extends Macros {
  readonly adjustments: readonly Adjustment[];
}

/**
 * Splits a calorie target into macronutrients.
 *
 * Order of operations, and why:
 *
 *   protein first  - it is the target with the most evidence behind it and the
 *                    most to lose by getting wrong, especially in a deficit
 *   fat second     - a percentage of energy, but never below the absolute
 *                    floor needed for hormone production and fat-soluble
 *                    vitamin absorption
 *   carbs last     - the remainder, which is also what makes the arithmetic
 *                    close exactly
 *
 * Computing carbohydrate as the remainder after protein and fat are rounded
 * means only the final carb rounding contributes error, so the macro energy sum
 * lands within a few kcal of the target rather than drifting by fifty.
 */
export const calculateMacros = (
  calories: number,
  profile: BodyProfile,
  goal: GoalType,
): MacroResult => {
  const adjustments: Adjustment[] = [];
  const refWeight = referenceWeightKg(profile);

  const proteinPerKg = clamp(PROTEIN_G_PER_KG[goal], PROTEIN_G_PER_KG_MIN, PROTEIN_G_PER_KG_MAX);
  let proteinG = refWeight * proteinPerKg;

  const fatFloorG = refWeight * FAT_G_PER_KG_MIN;
  const fatFromEnergyG = (calories * FAT_ENERGY_FRACTION) / KCAL_PER_G_FAT;
  let fatG = Math.max(fatFromEnergyG, fatFloorG);

  if (fatG > fatFromEnergyG) {
    adjustments.push({
      code: 'fat_floor_applied',
      detail: `fat raised to the ${FAT_G_PER_KG_MIN} g/kg minimum`,
    });
  }

  let carbsKcal = calories - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT;
  const carbsMinKcal = CARBS_G_MIN * KCAL_PER_G_CARBS;

  // On a tight budget, buy carbohydrate back - fat first down to its floor,
  // then protein down to its minimum. No loops: each step takes what it can.
  if (carbsKcal < carbsMinKcal) {
    const fromFatKcal = Math.min(
      carbsMinKcal - carbsKcal,
      Math.max(0, (fatG - fatFloorG) * KCAL_PER_G_FAT),
    );
    if (fromFatKcal > 0) {
      fatG -= fromFatKcal / KCAL_PER_G_FAT;
      carbsKcal += fromFatKcal;
    }
  }

  if (carbsKcal < carbsMinKcal) {
    const proteinMinG = refWeight * PROTEIN_G_PER_KG_MIN;
    const fromProteinKcal = Math.min(
      carbsMinKcal - carbsKcal,
      Math.max(0, (proteinG - proteinMinG) * KCAL_PER_G_PROTEIN),
    );
    if (fromProteinKcal > 0) {
      proteinG -= fromProteinKcal / KCAL_PER_G_PROTEIN;
      carbsKcal += fromProteinKcal;
      adjustments.push({
        code: 'protein_clamped',
        detail: `protein reduced toward ${PROTEIN_G_PER_KG_MIN} g/kg to fit the calorie target`,
      });
    }
  }

  // Still short: the floors cannot all be met at this energy level. Scale
  // protein and fat proportionally so the split consumes the target exactly,
  // rather than emitting a negative carbohydrate figure.
  if (carbsKcal < 0) {
    const usedKcal = proteinG * KCAL_PER_G_PROTEIN + fatG * KCAL_PER_G_FAT;
    const scale = usedKcal > 0 ? calories / usedKcal : 0;
    proteinG *= scale;
    fatG *= scale;
    carbsKcal = 0;
    adjustments.push({
      code: 'carbs_floor_applied',
      detail: 'calorie target too low to meet all macronutrient minimums',
    });
  } else if (carbsKcal < carbsMinKcal) {
    adjustments.push({
      code: 'carbs_floor_applied',
      detail: `carbohydrate below the ${CARBS_G_MIN} g reference minimum`,
    });
  }

  const proteinRounded = Math.round(proteinG);
  const fatRounded = Math.round(fatG);
  const carbsRounded = Math.max(
    0,
    Math.round(
      (calories - proteinRounded * KCAL_PER_G_PROTEIN - fatRounded * KCAL_PER_G_FAT) /
        KCAL_PER_G_CARBS,
    ),
  );

  const fiberG = Math.round(
    clamp((calories / 1000) * FIBER_G_PER_1000_KCAL, FIBER_G_MIN, FIBER_G_MAX),
  );

  return {
    proteinG: proteinRounded,
    carbsG: carbsRounded,
    fatG: fatRounded,
    fiberG,
    adjustments,
  };
};

/** Energy represented by a macro split, using Atwater factors. */
export const macroEnergyKcal = (macros: Pick<Macros, 'proteinG' | 'carbsG' | 'fatG'>): number =>
  macros.proteinG * KCAL_PER_G_PROTEIN +
  macros.carbsG * KCAL_PER_G_CARBS +
  macros.fatG * KCAL_PER_G_FAT;
