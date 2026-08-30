import {
  generatePlan,
  type DayTargets,
  type MealCandidate,
  type MealSlot,
  type PlanResult,
} from '@/domain/mealplan';
import type { LocalDate } from '@/domain/dates/localDate';
import { AppError } from '@/lib/errors';
import { supabase } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

/**
 * Meal planning. The solver is pure and lives in the domain; this fetches what
 * it needs and persists what it produced.
 *
 * The candidate query applies the allergen filter in SQL as well - the solver
 * enforces it too, and both are deliberate. An allergen miss is a safety
 * incident, and one filter is one place to get it wrong.
 */

export interface DietSettings {
  readonly excludedAllergenIds: readonly number[];
  readonly mealsPerDay: number;
  readonly maxPrepMinutes: number | null;
}

export const getDietSettings = async (userId: string): Promise<DietSettings> => {
  try {
    const { data, error } = await supabase
      .from('user_diet_settings')
      .select('excluded_allergens, meals_per_day, max_prep_minutes')
      .eq('user_id', userId)
      .maybeSingle();

    if (error !== null) throw mapPostgrestError(error);

    return {
      excludedAllergenIds: data?.excluded_allergens ?? [],
      mealsPerDay: data?.meals_per_day ?? 4,
      maxPrepMinutes: data?.max_prep_minutes ?? null,
    };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getCandidates = async (
  excludedAllergenIds: readonly number[],
): Promise<MealCandidate[]> => {
  try {
    let query = supabase
      .from('meal_plan_candidates')
      .select(
        'recipe_id, name, kcal, protein_g, carbs_g, fat_g, meal_slots, allergen_ids, food_ids, prep_minutes',
      );

    if (excludedAllergenIds.length > 0) {
      // `not overlaps` in PostgREST: keep rows whose allergen array shares
      // nothing with the exclusion list.
      query = query.not('allergen_ids', 'ov', `{${excludedAllergenIds.join(',')}}`);
    }

    const { data, error } = await query;
    if (error !== null) throw mapPostgrestError(error);

    return (data ?? []).map((row) => ({
      recipeId: row.recipe_id as string,
      name: row.name as string,
      kcal: Number(row.kcal),
      proteinG: Number(row.protein_g),
      carbsG: Number(row.carbs_g),
      fatG: Number(row.fat_g),
      allergenIds: (row.allergen_ids ?? []) as number[],
      foodIds: (row.food_ids ?? []) as string[],
      slots: (row.meal_slots ?? []) as MealSlot[],
      prepMinutes: row.prep_minutes === null ? null : Number(row.prep_minutes),
    }));
  } catch (e) {
    throw mapUnknownError(e);
  }
};

const SLOT_ORDER: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const slotsForCount = (mealsPerDay: number): MealSlot[] => {
  const count = Math.min(Math.max(mealsPerDay, 2), 4);
  // Two meals means lunch and dinner, not breakfast and lunch: someone eating
  // twice a day is far more likely to be skipping breakfast.
  if (count === 2) return ['lunch', 'dinner'];
  if (count === 3) return ['breakfast', 'lunch', 'dinner'];
  return [...SLOT_ORDER];
};

export interface BuildPlanInput {
  readonly userId: string;
  readonly targets: DayTargets;
  readonly startDate: LocalDate;
  readonly settings: DietSettings;
}

export const buildPlan = async (input: BuildPlanInput): Promise<PlanResult> => {
  const candidates = await getCandidates(input.settings.excludedAllergenIds);

  const outcome = generatePlan({
    targets: input.targets,
    slots: slotsForCount(input.settings.mealsPerDay),
    candidates,
    constraints: {
      excludedAllergenIds: input.settings.excludedAllergenIds,
      dislikedFoodIds: [],
      maxPrepMinutes: input.settings.maxPrepMinutes,
    },
  });

  if (!outcome.ok) {
    throw new AppError({
      code: outcome.reason === 'targets_invalid' ? 'validation_failed' : 'not_found',
      userMessage:
        outcome.reason === 'no_candidates' || outcome.reason === 'no_candidate_for_slot'
          ? 'There are not enough recipes to build a plan with your restrictions yet.'
          : 'We could not build a plan from those targets.',
      context: { reason: outcome.reason },
    });
  }

  return outcome.value;
};

/**
 * Saves a generated plan.
 *
 * `target_snapshot` freezes the targets it was built against, so a plan stays
 * self-consistent even after the user changes their goal mid-week. Without it,
 * last Tuesday's plan silently starts looking wrong against today's numbers.
 */
export const savePlan = async (
  userId: string,
  name: string,
  startDate: LocalDate,
  targets: DayTargets,
  plan: PlanResult,
  generatorVersion: string,
): Promise<string> => {
  try {
    const { data: planRow, error: planError } = await supabase
      .from('meal_plans')
      .insert({
        user_id: userId,
        name,
        start_date: startDate,
        end_date: startDate,
        meals_per_day: plan.meals.length,
        target_snapshot: targets as unknown as Record<string, number>,
        generator_version: generatorVersion,
      })
      .select('id')
      .single();

    if (planError !== null) throw mapPostgrestError(planError);

    const { data: dayRow, error: dayError } = await supabase
      .from('meal_plan_days')
      .insert({ plan_id: planRow.id, day_index: 0, local_date: startDate })
      .select('id')
      .single();

    if (dayError !== null) throw mapPostgrestError(dayError);

    const { error: mealsError } = await supabase.from('meal_plan_meals').insert(
      plan.meals.map((meal, index) => ({
        plan_day_id: dayRow.id,
        meal_type: meal.slot,
        recipe_id: meal.recipeId,
        servings: meal.servings,
        // Frozen from the solver's arithmetic, which came from the recipe's
        // ingredients. Nothing here originated with a model.
        kcal: meal.kcal,
        protein_g: meal.proteinG,
        carbs_g: meal.carbsG,
        fat_g: meal.fatG,
        locked: meal.locked,
        sort_order: index,
      })),
    );

    if (mealsError !== null) throw mapPostgrestError(mealsError);
    return planRow.id;
  } catch (e) {
    throw mapUnknownError(e);
  }
};
