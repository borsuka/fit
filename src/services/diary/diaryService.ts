import { scaleNutrition, type NutritionAmount, type NutritionPer100g } from '@/domain/nutrition';
import type { LocalDate } from '@/domain/dates/localDate';
import { supabase, type Enums, type Tables } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

export type MealType = Enums<'meal_type'>;
export type EntrySource = Enums<'entry_source'>;
export type FoodRow = Tables<'foods'>;

export interface DiaryItem {
  readonly id: string;
  readonly mealType: MealType;
  readonly name: string;
  readonly quantityG: number;
  readonly nutrition: NutritionAmount;
  readonly foodId: string | null;
}

export interface DiaryDay {
  readonly localDate: LocalDate;
  readonly items: readonly DiaryItem[];
  readonly waterMl: number;
}

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * One day of the diary.
 *
 * A single nested select rather than a query per meal section: four round
 * trips from a phone on mobile data is four chances to be slow, and the day's
 * totals cannot render until the last one lands.
 */
export const getDiaryDay = async (userId: string, localDate: LocalDate): Promise<DiaryDay> => {
  try {
    const [mealsResult, logResult] = await Promise.all([
      supabase
        .from('meals')
        .select(
          `id, meal_type,
           meal_items ( id, custom_name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g,
                        food_id, foods ( name, brand ) )`,
        )
        .eq('user_id', userId)
        .eq('local_date', localDate),
      supabase
        .from('daily_logs')
        .select('water_ml')
        .eq('user_id', userId)
        .eq('local_date', localDate)
        .maybeSingle(),
    ]);

    if (mealsResult.error) throw mapPostgrestError(mealsResult.error);
    if (logResult.error) throw mapPostgrestError(logResult.error);

    const items: DiaryItem[] = [];
    for (const meal of mealsResult.data ?? []) {
      for (const item of meal.meal_items ?? []) {
        items.push({
          id: item.id,
          mealType: meal.meal_type,
          // The stored custom_name wins, then the joined food name. The food
          // may have been archived since; the snapshot is what was eaten.
          name: item.custom_name ?? item.foods?.name ?? 'Unknown food',
          quantityG: Number(item.quantity_g),
          foodId: item.food_id,
          nutrition: {
            kcal: Number(item.kcal),
            proteinG: Number(item.protein_g),
            carbsG: Number(item.carbs_g),
            fatG: Number(item.fat_g),
            fiberG: Number(item.fiber_g ?? 0),
          },
        });
      }
    }

    return { localDate, items, waterMl: logResult.data?.water_ml ?? 0 };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export interface AddFoodInput {
  readonly userId: string;
  readonly localDate: LocalDate;
  readonly mealType: MealType;
  readonly food: Pick<
    FoodRow,
    'id' | 'name' | 'kcal_100g' | 'protein_100g' | 'carbs_100g' | 'fat_100g' | 'fiber_100g'
  >;
  readonly quantityG: number;
  readonly source: EntrySource;
}

/**
 * Adds a food to a meal section, creating the section if it does not exist.
 *
 * The nutrition snapshot is computed here and stored on the row. Source data
 * mutates - Open Food Facts updates constantly - and without the snapshot last
 * month's lunch silently changes its calories.
 *
 * The values are computed client-side, which means a user could write numbers
 * that do not match the food. That is acceptable: RLS confines every write to
 * the author's own diary, so the only person they can mislead is themselves.
 * It would not be acceptable for anything shared or billed.
 */
export const addFoodToMeal = async (input: AddFoodInput): Promise<void> => {
  try {
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .upsert(
        {
          user_id: input.userId,
          local_date: input.localDate,
          meal_type: input.mealType,
        },
        // Relies on the unique index from migration 0012. Without the conflict
        // target, two quick taps race and create two sections for one meal.
        { onConflict: 'user_id,local_date,meal_type', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (mealError) throw mapPostgrestError(mealError);

    const per100g: NutritionPer100g = {
      kcal: Number(input.food.kcal_100g),
      proteinG: Number(input.food.protein_100g),
      carbsG: Number(input.food.carbs_100g),
      fatG: Number(input.food.fat_100g),
      ...(input.food.fiber_100g === null ? {} : { fiberG: Number(input.food.fiber_100g) }),
    };
    const snapshot = scaleNutrition(per100g, input.quantityG);

    const { error: itemError } = await supabase.from('meal_items').insert({
      meal_id: meal.id,
      user_id: input.userId,
      source: input.source,
      food_id: input.food.id,
      quantity_g: input.quantityG,
      kcal: snapshot.kcal,
      protein_g: snapshot.proteinG,
      carbs_g: snapshot.carbsG,
      fat_g: snapshot.fatG,
      fiber_g: snapshot.fiberG,
    });

    if (itemError) throw mapPostgrestError(itemError);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const deleteMealItem = async (itemId: string): Promise<void> => {
  try {
    const { error } = await supabase.from('meal_items').delete().eq('id', itemId);
    if (error) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const setWater = async (
  userId: string,
  localDate: LocalDate,
  waterMl: number,
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('daily_logs')
      .upsert(
        { user_id: userId, local_date: localDate, water_ml: Math.max(0, Math.round(waterMl)) },
        { onConflict: 'user_id,local_date' },
      );
    if (error) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};
