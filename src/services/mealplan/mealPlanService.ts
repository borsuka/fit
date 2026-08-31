import {
  excludedCategoriesForDiet,
  generatePlan,
  type DayTargets,
  type MealCandidate,
  type MealSlot,
  type PlannableDiet,
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

/** The column accepts keto and mediterranean too; the app does not offer them.
 *  See src/domain/mealplan/diets.ts for why. */
export type DietType = PlannableDiet;

export interface DietSettings {
  readonly diet: DietType;
  readonly excludedAllergenIds: readonly number[];
  readonly mealsPerDay: number;
  readonly maxPrepMinutes: number | null;
}

/** What a user gets before they have opened the settings screen. Written down
 *  once so the screen, the planner and the row default cannot drift apart. */
export const DEFAULT_DIET_SETTINGS: DietSettings = {
  diet: 'omnivore',
  excludedAllergenIds: [],
  mealsPerDay: 4,
  maxPrepMinutes: null,
};

export interface FoodPreferences {
  readonly likedFoodIds: readonly string[];
  readonly dislikedFoodIds: readonly string[];
}

export const getDietSettings = async (userId: string): Promise<DietSettings> => {
  try {
    const { data, error } = await supabase
      .from('user_diet_settings')
      .select('diet, excluded_allergens, meals_per_day, max_prep_minutes')
      .eq('user_id', userId)
      .maybeSingle();

    if (error !== null) throw mapPostgrestError(error);
    if (data === null) return DEFAULT_DIET_SETTINGS;

    return {
      diet: data.diet as DietType,
      excludedAllergenIds: data.excluded_allergens ?? [],
      mealsPerDay: data.meals_per_day,
      maxPrepMinutes: data.max_prep_minutes,
    };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Writes the whole settings row.
 *
 * An upsert rather than an update: a user who has never opened this screen has
 * no row, and an update would report success while changing nothing - the
 * silent-no-op failure mode that RLS-shaped UPDATEs are prone to.
 */
export const saveDietSettings = async (
  userId: string,
  settings: DietSettings,
): Promise<DietSettings> => {
  try {
    const { error } = await supabase.from('user_diet_settings').upsert({
      user_id: userId,
      diet: settings.diet,
      excluded_allergens: [...settings.excludedAllergenIds],
      meals_per_day: settings.mealsPerDay,
      max_prep_minutes: settings.maxPrepMinutes,
    });

    if (error !== null) throw mapPostgrestError(error);
    return settings;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Liked and disliked foods.
 *
 * 'excluded' is folded in with 'disliked' for planning: both mean "do not put
 * this in front of me". They stay separate in the database because only one of
 * them is a statement about taste.
 */
export const getFoodPreferences = async (userId: string): Promise<FoodPreferences> => {
  try {
    const { data, error } = await supabase
      .from('user_food_preferences')
      .select('food_id, preference')
      .eq('user_id', userId);

    if (error !== null) throw mapPostgrestError(error);

    const liked: string[] = [];
    const disliked: string[] = [];
    for (const row of data ?? []) {
      if (row.preference === 'liked') liked.push(row.food_id);
      else disliked.push(row.food_id);
    }
    return { likedFoodIds: liked, dislikedFoodIds: disliked };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/** Passing null clears the preference entirely - "no opinion" is a real state
 *  and is not the same as a dislike. */
export const setFoodPreference = async (
  userId: string,
  foodId: string,
  preference: 'liked' | 'disliked' | null,
): Promise<void> => {
  try {
    if (preference === null) {
      const { error } = await supabase
        .from('user_food_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('food_id', foodId);
      if (error !== null) throw mapPostgrestError(error);
      return;
    }

    const { error } = await supabase
      .from('user_food_preferences')
      .upsert({ user_id: userId, food_id: foodId, preference });
    if (error !== null) throw mapPostgrestError(error);
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
        'recipe_id, name, kcal, protein_g, carbs_g, fat_g, meal_slots, allergen_ids, food_ids, category_slugs, prep_minutes',
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
      categorySlugs: (row.category_slugs ?? []) as string[],
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
  const [candidates, preferences] = await Promise.all([
    getCandidates(input.settings.excludedAllergenIds),
    getFoodPreferences(input.userId),
  ]);

  const outcome = generatePlan({
    targets: input.targets,
    slots: slotsForCount(input.settings.mealsPerDay),
    candidates,
    constraints: {
      excludedAllergenIds: input.settings.excludedAllergenIds,
      dislikedFoodIds: preferences.dislikedFoodIds,
      likedFoodIds: preferences.likedFoodIds,
      excludedCategorySlugs: excludedCategoriesForDiet(input.settings.diet),
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
