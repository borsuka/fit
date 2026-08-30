import {
  ENGINE_VERSION,
  ageFromDateOfBirth,
  type BodyProfile,
  type GoalInput,
  type NutritionTargets,
} from '@/domain/nutrition';
import { AppError } from '@/lib/errors';
import { supabase, type Enums, type Tables } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

/**
 * Profile and goal persistence.
 *
 * This is the seam between the database and the nutrition engine. The engine
 * knows nothing about rows and the rows know nothing about formulas; the
 * mapping lives here and nowhere else.
 */

export type ProfileRow = Tables<'profiles'>;
export type GoalRow = Tables<'goals'>;

export interface ProfileDraft {
  readonly displayName: string | null;
  readonly dateOfBirth: string; // ISO date, yyyy-mm-dd
  readonly sex: Enums<'sex_at_birth'>;
  readonly heightCm: number;
  readonly timezone: string;
  readonly locale: 'en' | 'bg';
  readonly unitSystem: 'metric' | 'imperial';
}

export const getProfile = async (userId: string): Promise<ProfileRow | null> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      // maybeSingle, not single: "no profile yet" is the normal state between
      // signing up and finishing onboarding, not an error to be caught.
      .maybeSingle();

    if (error) throw mapPostgrestError(error);
    return data;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const upsertProfile = async (userId: string, draft: ProfileDraft): Promise<ProfileRow> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        display_name: draft.displayName,
        date_of_birth: draft.dateOfBirth,
        sex: draft.sex,
        height_cm: draft.heightCm,
        timezone: draft.timezone,
        locale: draft.locale,
        unit_system: draft.unitSystem,
      })
      .select()
      .single();

    if (error) throw mapPostgrestError(error);
    return data;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const markOnboarded = async (userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getActiveGoal = async (userId: string): Promise<GoalRow | null> => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw mapPostgrestError(error);
    return data;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Persists computed targets as the user's active goal.
 *
 * Goes through the `set_active_goal` RPC rather than two statements, because
 * deactivating the old goal and inserting the new one must be atomic - see
 * migration 0011. Two round trips from a phone on a flaky connection is
 * exactly where a user ends up with no active goal and a Home screen that
 * cannot render.
 */
export const saveGoal = async (
  targets: NutritionTargets,
  input: GoalInput,
  currentWeightKg: number,
): Promise<GoalRow> => {
  try {
    const { data, error } = await supabase
      .rpc('set_active_goal', {
        p_goal: input.goal,
        p_activity: input.activity,
        p_start_weight_kg: currentWeightKg,
        p_calorie_target: targets.calories,
        p_protein_g: targets.proteinG,
        p_carbs_g: targets.carbsG,
        p_fat_g: targets.fatG,
        p_fiber_g: targets.fiberG,
        // Records which engine version produced these numbers, so a formula
        // change is auditable rather than invisible.
        p_computed_by: ENGINE_VERSION,
        ...(input.targetWeightKg === undefined ? {} : { p_target_weight_kg: input.targetWeightKg }),
        ...(input.weeklyRateKg === undefined ? {} : { p_weekly_rate_kg: input.weeklyRateKg }),
      })
      .single();

    if (error) throw mapPostgrestError(error);
    return data;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Turns a stored profile plus a current weight into the engine's input.
 *
 * Weight is passed in rather than read from the profile because it does not
 * live there: it belongs to `weight_logs`, which is a time series. A profile
 * row carrying a weight column would be a second, always-stale copy of the
 * latest entry.
 */
export const toBodyProfile = (
  profile: ProfileRow,
  currentWeightKg: number,
  now: Date = new Date(),
): BodyProfile => {
  const dob = new Date(profile.date_of_birth);
  if (Number.isNaN(dob.getTime())) {
    throw new AppError({
      code: 'validation_failed',
      userMessage: 'Your date of birth looks invalid. Please update it in your profile.',
      context: { profileId: profile.id },
    });
  }

  return {
    sex: profile.sex,
    ageYears: ageFromDateOfBirth(dob, now),
    heightCm: Number(profile.height_cm),
    weightKg: currentWeightKg,
  };
};

/** Reconstructs the stored targets, so screens read one shape whether the
 *  numbers were just computed or loaded from the database. */
export const toTargets = (
  goal: GoalRow,
): Pick<NutritionTargets, 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG'> => ({
  calories: goal.calorie_target,
  proteinG: goal.protein_g,
  carbsG: goal.carbs_g,
  fatG: goal.fat_g,
  fiberG: goal.fiber_g ?? 0,
});
