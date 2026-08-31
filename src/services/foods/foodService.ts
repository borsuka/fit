import { supabase, type Enums, type Tables } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

export type FoodSource = Enums<'food_source'>;
export type ServingRow = Tables<'food_servings'>;

/** The shape search returns. Deliberately narrow: a results list needs a name
 *  and four numbers, not forty micronutrients. */
export interface FoodSearchResult {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly kcal100g: number;
  readonly protein100g: number;
  readonly carbs100g: number;
  readonly fat100g: number;
  readonly fiber100g: number | null;
  readonly source: FoodSource;
  readonly score: number;
}

export interface FoodDetail extends FoodSearchResult {
  readonly servings: readonly { id: string; label: string; grams: number; isDefault: boolean }[];
  readonly densityGPerMl: number | null;
}

/**
 * Ranked search over full-text, trigram similarity and curated aliases.
 *
 * Goes through the `search_foods` RPC rather than composing filters in the
 * client: ranking three signals is SQL's job, and doing it here would mean
 * fetching candidates over the network to sort them on a phone.
 */
export const searchFoods = async (query: string, limit = 25): Promise<FoodSearchResult[]> => {
  const term = query.trim();
  // Saves a round trip on every keystroke that clears the box.
  if (term.length === 0) return [];

  try {
    const { data, error } = await supabase.rpc('search_foods', {
      p_query: term,
      p_limit: limit,
    });
    if (error) throw mapPostgrestError(error);

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      kcal100g: Number(row.kcal_100g),
      protein100g: Number(row.protein_100g),
      carbs100g: Number(row.carbs_100g),
      fat100g: Number(row.fat_100g),
      fiber100g: row.fiber_100g === null ? null : Number(row.fiber_100g),
      source: row.source,
      score: Number(row.score),
    }));
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Names for a set of ids.
 *
 * The preferences table stores ids alone, so a screen listing what someone has
 * marked has nothing to show without this. Ordered by name rather than by the
 * id order passed in: the caller's order is arbitrary, and alphabetical is the
 * only order a reader can predict.
 */
export const getFoodsByIds = async (foodIds: readonly string[]): Promise<FoodSearchResult[]> => {
  if (foodIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('foods')
      .select('id, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, source')
      .in('id', [...foodIds])
      .order('name');

    if (error) throw mapPostgrestError(error);

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      kcal100g: Number(row.kcal_100g),
      protein100g: Number(row.protein_100g),
      carbs100g: Number(row.carbs_100g),
      fat100g: Number(row.fat_100g),
      fiber100g: row.fiber_100g === null ? null : Number(row.fiber_100g),
      source: row.source,
      score: 0,
    }));
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getFood = async (foodId: string): Promise<FoodDetail | null> => {
  try {
    const { data, error } = await supabase
      .from('foods')
      .select(
        `id, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g,
         source, density_g_ml, food_servings ( id, label, grams, is_default )`,
      )
      .eq('id', foodId)
      .maybeSingle();

    if (error) throw mapPostgrestError(error);
    if (data === null) return null;

    return {
      id: data.id,
      name: data.name,
      brand: data.brand,
      kcal100g: Number(data.kcal_100g),
      protein100g: Number(data.protein_100g),
      carbs100g: Number(data.carbs_100g),
      fat100g: Number(data.fat_100g),
      fiber100g: data.fiber_100g === null ? null : Number(data.fiber_100g),
      source: data.source,
      score: 1,
      densityGPerMl: data.density_g_ml === null ? null : Number(data.density_g_ml),
      servings: (data.food_servings ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        grams: Number(s.grams),
        isDefault: s.is_default,
      })),
    };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Foods this user logged recently, most recent first.
 *
 * A query over `meal_items`, not a table. "Recent" is a fact about the diary,
 * and a separate list would be one more thing to keep in sync - and to get
 * wrong when an entry is deleted.
 */
export const getRecentFoods = async (userId: string, limit = 20): Promise<FoodSearchResult[]> => {
  try {
    const { data, error } = await supabase
      .from('meal_items')
      .select(
        `food_id, created_at,
         foods!inner ( id, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g,
                       fiber_100g, source, archived_at )`,
      )
      .eq('user_id', userId)
      .not('food_id', 'is', null)
      .order('created_at', { ascending: false })
      // Over-fetches because the same food appears once per logging. Dedup
      // happens below rather than in SQL, where DISTINCT ON would fight the
      // ordering.
      .limit(limit * 5);

    if (error) throw mapPostgrestError(error);

    const seen = new Set<string>();
    const results: FoodSearchResult[] = [];

    for (const row of data ?? []) {
      const food = row.foods;
      if (food === null || food.archived_at !== null) continue;
      if (seen.has(food.id)) continue;
      seen.add(food.id);

      results.push({
        id: food.id,
        name: food.name,
        brand: food.brand,
        kcal100g: Number(food.kcal_100g),
        protein100g: Number(food.protein_100g),
        carbs100g: Number(food.carbs_100g),
        fat100g: Number(food.fat_100g),
        fiber100g: food.fiber_100g === null ? null : Number(food.fiber_100g),
        source: food.source,
        score: 1,
      });

      if (results.length >= limit) break;
    }

    return results;
  } catch (e) {
    throw mapUnknownError(e);
  }
};
