import type { ActivityLevel, GoalType, Sex } from './types';

/**
 * Every constant here is an assumption, and each one is written down with its
 * reasoning. These numbers decide what people eat, so "it looked about right"
 * is not an acceptable provenance.
 *
 * All targets produced from these are ESTIMATES, not medical advice.
 */

/** Identifies which engine version produced a stored goal, so a formula change
 *  is auditable rather than invisible. Bump on any behavioural change. */
export const ENGINE_VERSION = 'nutrition-engine-v1';

/**
 * Mifflin-St Jeor sex constants: BMR = 10w + 6.25h - 5a + C.
 * Chosen over Harris-Benedict (dated) and Katch-McArdle (needs a body-fat
 * percentage most users do not have).
 */
export const BMR_SEX_CONSTANT: Readonly<Record<Sex, number>> = {
  male: 5,
  female: -161,
};

/** Standard Mifflin-St Jeor activity multipliers. */
export const ACTIVITY_MULTIPLIER: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

/** Default energy adjustment as a fraction of TDEE, when the user has not
 *  specified a rate. Conservative by design: an aggressive default is a
 *  default nobody chose. */
export const DEFAULT_GOAL_ADJUSTMENT: Readonly<Record<GoalType, number>> = {
  lose: -0.2,
  maintain: 0,
  gain: 0.1,
  muscle_gain: 0.15,
};

/** Hard caps on the energy delta, as a fraction of TDEE. */
export const MAX_DEFICIT_FRACTION = 0.25;
export const MAX_SURPLUS_FRACTION = 0.15;

/**
 * Absolute floors for unsupervised use. Widely used clinical minimums for
 * self-directed dieting; below these, meeting micronutrient requirements from
 * food becomes unreliable. A convention, not a law of physics - and explicitly
 * not a substitute for medical supervision.
 */
export const CALORIE_FLOOR: Readonly<Record<Sex, number>> = {
  male: 1500,
  female: 1200,
};

/** Ceiling, purely to catch nonsense input reaching the UI. */
export const CALORIE_CEILING = 6000;

/** Energy in 1 kg of body fat, kcal. The 7700 figure is the conventional
 *  approximation used for rate-of-change estimates. Real bodies are not this
 *  linear, which is why rate is capped and progress is measured, not assumed. */
export const KCAL_PER_KG_BODY_FAT = 7700;

/** Rate caps as a fraction of body weight per week. Faster loss costs lean
 *  mass; faster gain is mostly fat. */
export const MAX_WEEKLY_LOSS_FRACTION = 0.01;
export const MAX_WEEKLY_GAIN_FRACTION = 0.005;

/** Protein grams per kg of reference weight, by goal. Higher in a deficit
 *  because protein preserves lean mass when energy is scarce. */
export const PROTEIN_G_PER_KG: Readonly<Record<GoalType, number>> = {
  lose: 2.0,
  maintain: 1.6,
  gain: 1.8,
  muscle_gain: 2.0,
};

export const PROTEIN_G_PER_KG_MIN = 1.4;
export const PROTEIN_G_PER_KG_MAX = 2.2;

/** Fat as a fraction of energy, with an absolute floor per kg. Dietary fat
 *  below roughly 0.6 g/kg risks fat-soluble vitamin absorption and hormone
 *  production. */
export const FAT_ENERGY_FRACTION = 0.27;
export const FAT_G_PER_KG_MIN = 0.6;

/** Carbohydrate floor. Not an essential macronutrient in the strict sense, but
 *  a target of zero is not a usable diet. */
export const CARBS_G_MIN = 50;

/** Fibre per 1000 kcal, the conventional recommendation, then clamped. */
export const FIBER_G_PER_1000_KCAL = 14;
export const FIBER_G_MIN = 20;
export const FIBER_G_MAX = 50;

/** Energy per gram, Atwater factors. */
export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARBS = 4;
export const KCAL_PER_G_FAT = 9;

/**
 * Input ranges. Enforced here as well as in the database, because a domain
 * function must be safe to call from anywhere - including a future importer
 * that never touches a form.
 */
export const MIN_AGE_YEARS = 18;
export const MAX_AGE_YEARS = 100;
export const MIN_HEIGHT_CM = 120;
export const MAX_HEIGHT_CM = 250;
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;

/** WHO healthy BMI band. The lower bound is a hard stop on target weight: an
 *  app that helps someone aim below it is causing harm, not tracking it. */
export const MIN_HEALTHY_BMI = 18.5;
export const MAX_HEALTHY_BMI = 25;

/** Above this BMI, protein and fat are scaled from a reference weight rather
 *  than actual weight, so we do not prescribe 300 g of protein a day. */
export const HIGH_BMI_THRESHOLD = 30;

/** Maximum acceptable difference between the macro energy sum and the calorie
 *  target, in kcal. Carbohydrate is computed as the remainder after protein
 *  and fat are rounded, so only the final carb rounding contributes. */
export const MACRO_SUM_TOLERANCE_KCAL = 3;
