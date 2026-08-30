import { ACTIVITY_MULTIPLIER, BMR_SEX_CONSTANT } from '../constants';
import type { ActivityLevel, BodyProfile } from '../types';

/**
 * Basal metabolic rate, Mifflin-St Jeor (1990):
 *
 *   male:   BMR = 10w + 6.25h - 5a + 5
 *   female: BMR = 10w + 6.25h - 5a - 161
 *
 * where w is kg, h is cm, a is years.
 *
 * Chosen over Harris-Benedict, which overestimates for modern populations, and
 * over Katch-McArdle, which is more accurate but needs a body-fat percentage
 * most users cannot supply. Katch-McArdle can be added later behind an optional
 * input without changing this function's callers.
 *
 * Accurate to roughly +/-10% for the population it was derived from. It is an
 * estimate; the app says so, and measured weight change is what actually
 * calibrates a user's intake over time.
 *
 * Returns an unrounded value - rounding belongs at the end of the pipeline, not
 * in the middle of it.
 */
export const calculateBmr = (profile: BodyProfile): number => {
  const { sex, ageYears, heightCm, weightKg } = profile;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + BMR_SEX_CONSTANT[sex];
};

/**
 * Total daily energy expenditure: BMR scaled by an activity multiplier.
 *
 * The multiplier is the crudest part of the whole estimate - it compresses
 * occupation, training and non-exercise activity into five buckets. Users
 * routinely over-report activity, which is one more reason the app treats the
 * result as a starting point to be corrected against real weight data.
 */
export const calculateTdee = (bmr: number, activity: ActivityLevel): number =>
  bmr * ACTIVITY_MULTIPLIER[activity];
