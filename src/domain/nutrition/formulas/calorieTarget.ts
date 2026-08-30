import {
  CALORIE_CEILING,
  CALORIE_FLOOR,
  DEFAULT_GOAL_ADJUSTMENT,
  KCAL_PER_KG_BODY_FAT,
  MAX_DEFICIT_FRACTION,
  MAX_SURPLUS_FRACTION,
  MAX_WEEKLY_GAIN_FRACTION,
  MAX_WEEKLY_LOSS_FRACTION,
} from '../constants';
import type { Adjustment, BodyProfile, GoalInput } from '../types';

export interface EnergyDeltaResult {
  /** Signed daily kcal delta actually applied, after clamping. */
  readonly delta: number;
  readonly adjustments: readonly Adjustment[];
}

/** Daily kcal delta implied by a weekly rate of body-mass change. */
export const dailyDeltaFromWeeklyRate = (weeklyRateKg: number): number =>
  (weeklyRateKg * KCAL_PER_KG_BODY_FAT) / 7;

export const weeklyRateFromDailyDelta = (dailyDelta: number): number =>
  (dailyDelta * 7) / KCAL_PER_KG_BODY_FAT;

const goalDirection = (goal: GoalInput['goal']): -1 | 0 | 1 => {
  switch (goal) {
    case 'lose':
      return -1;
    case 'maintain':
      return 0;
    case 'gain':
    case 'muscle_gain':
      return 1;
  }
};

/**
 * Energy delta, with every safety rail applied in order.
 *
 *   1. base delta - from an explicit weekly rate, or the goal default
 *   2. rate cap   - no faster than 1%/week down or 0.5%/week up
 *   3. share cap  - deficit <= 25% of TDEE, surplus <= 15%
 *
 * The calorie floor is applied afterwards in `calculateCalorieTarget`, because
 * it constrains the absolute result rather than the delta.
 *
 * The direction always comes from the goal, never from the sign the caller
 * passed. A 'lose' goal with a positive rate is sign confusion somewhere
 * upstream, and honouring it literally would produce a surplus labelled "lose".
 */
export const calculateEnergyDelta = (
  tdee: number,
  profile: BodyProfile,
  goal: GoalInput,
): EnergyDeltaResult => {
  const adjustments: Adjustment[] = [];
  const direction = goalDirection(goal.goal);

  if (direction === 0) {
    return { delta: 0, adjustments };
  }

  let delta =
    goal.weeklyRateKg !== undefined && Number.isFinite(goal.weeklyRateKg)
      ? direction * Math.abs(dailyDeltaFromWeeklyRate(goal.weeklyRateKg))
      : tdee * DEFAULT_GOAL_ADJUSTMENT[goal.goal];

  // 2. Rate cap. Faster loss costs lean mass; faster gain is mostly fat.
  const maxWeeklyKg =
    profile.weightKg * (direction < 0 ? MAX_WEEKLY_LOSS_FRACTION : MAX_WEEKLY_GAIN_FRACTION);
  const maxDeltaByRate = Math.abs(dailyDeltaFromWeeklyRate(maxWeeklyKg));

  if (Math.abs(delta) > maxDeltaByRate) {
    delta = direction * maxDeltaByRate;
    adjustments.push({
      code: 'rate_capped',
      detail: `limited to ${maxWeeklyKg.toFixed(2)} kg/week (${
        direction < 0 ? MAX_WEEKLY_LOSS_FRACTION * 100 : MAX_WEEKLY_GAIN_FRACTION * 100
      }% of body weight)`,
    });
  }

  // 3. Share-of-TDEE cap.
  const maxDeltaByShare = tdee * (direction < 0 ? MAX_DEFICIT_FRACTION : MAX_SURPLUS_FRACTION);

  if (Math.abs(delta) > maxDeltaByShare) {
    delta = direction * maxDeltaByShare;
    adjustments.push({
      code: direction < 0 ? 'deficit_capped' : 'surplus_capped',
      detail: `limited to ${Math.round(
        (direction < 0 ? MAX_DEFICIT_FRACTION : MAX_SURPLUS_FRACTION) * 100,
      )}% of maintenance energy`,
    });
  }

  return { delta, adjustments };
};

export interface CalorieTargetResult {
  readonly calories: number;
  readonly energyDelta: number;
  readonly adjustments: readonly Adjustment[];
}

/**
 * Applies the energy delta to TDEE, then enforces the absolute floor.
 *
 * The floor is the last word: a 25% deficit on a small TDEE can still land
 * below what is safe to eat without supervision, and the percentage being
 * "within policy" does not make the absolute number acceptable.
 */
export const calculateCalorieTarget = (
  tdee: number,
  profile: BodyProfile,
  goal: GoalInput,
): CalorieTargetResult => {
  const { delta, adjustments } = calculateEnergyDelta(tdee, profile, goal);
  const all: Adjustment[] = [...adjustments];

  let calories = tdee + delta;
  const floor = CALORIE_FLOOR[profile.sex];

  if (calories < floor) {
    calories = floor;
    all.push({
      code: 'calorie_floor_applied',
      detail: `raised to the ${floor} kcal minimum for unsupervised use`,
    });
  }

  if (calories > CALORIE_CEILING) {
    calories = CALORIE_CEILING;
  }

  const rounded = Math.round(calories);
  return { calories: rounded, energyDelta: rounded - tdee, adjustments: all };
};
