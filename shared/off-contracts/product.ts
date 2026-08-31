/**
 * Open Food Facts product mapping.
 *
 * Imported by the Deno edge function AND by the app's tests. Dependency-free
 * for the same reason as ai-contracts: the edge runtime does not apply an
 * import map to a file outside `supabase/functions/`, and Metro rejects the
 * explicit `.ts` extension Deno needs for a sibling import.
 *
 * OFF data is contributed by the public. It is enormously useful and it is
 * frequently wrong, so nothing here trusts a field just because it is present.
 * The database CHECK constraints would catch the worst of it anyway, but a
 * constraint violation reaches the user as an opaque failure - rejecting here
 * means we can say which field was the problem.
 */

/** EU 1169/2011 Annex II, matching the ids seeded in seed.sql. */
export const OFF_ALLERGEN_TAGS: Readonly<Record<string, number>> = {
  'en:gluten': 1,
  'en:crustaceans': 2,
  'en:eggs': 3,
  'en:fish': 4,
  'en:peanuts': 5,
  'en:soybeans': 6,
  'en:milk': 7,
  'en:nuts': 8,
  'en:celery': 9,
  'en:mustard': 10,
  'en:sesame-seeds': 11,
  'en:sulphur-dioxide-and-sulphites': 12,
  'en:lupin': 13,
  'en:molluscs': 14,
};

/** Nothing edible exceeds this. Pure fat is 900 kcal/100 g, so a higher figure
 *  means the entry is wrong - and importing it puts a wrong number in a diary. */
export const MAX_PLAUSIBLE_KCAL_100G = 900;

/** Macro mass cannot exceed the mass of the food. A few points of slack absorb
 *  rounding and water-of-hydration reporting; beyond that it is a unit mix-up,
 *  which is common in crowd-sourced entries. */
export const MAX_MACRO_MASS_100G = 105;

export interface OffNutriments {
  readonly 'energy-kcal_100g'?: unknown;
  readonly proteins_100g?: unknown;
  readonly carbohydrates_100g?: unknown;
  readonly fat_100g?: unknown;
  readonly fiber_100g?: unknown;
  readonly sugars_100g?: unknown;
  readonly 'saturated-fat_100g'?: unknown;
  readonly sodium_100g?: unknown;
}

export interface OffProduct {
  readonly product_name?: unknown;
  readonly product_name_en?: unknown;
  readonly brands?: unknown;
  readonly nutriments?: OffNutriments;
  readonly allergens_tags?: unknown;
}

export interface FoodPayload {
  readonly name: string;
  readonly brand: string | null;
  readonly kcal_100g: number;
  readonly protein_100g: number;
  readonly carbs_100g: number;
  readonly fat_100g: number;
  readonly fiber_100g: number | null;
  readonly sugar_100g: number | null;
  readonly sat_fat_100g: number | null;
  readonly sodium_mg_100g: number | null;
  readonly allergenIds: readonly number[];
}

export type MappingResult =
  | { readonly ok: true; readonly value: FoodPayload }
  | { readonly ok: false; readonly reason: string };

/** A non-negative finite number, or null. Rejects strings, NaN and Infinity -
 *  OFF returns all three in the wild. */
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const toFoodPayload = (product: OffProduct): MappingResult => {
  const name = str(product.product_name_en) || str(product.product_name);
  if (name.length === 0) return { ok: false, reason: 'the product has no name' };

  const n = product.nutriments ?? {};

  const kcal = num(n['energy-kcal_100g']);
  if (kcal === null) return { ok: false, reason: 'the product has no energy value' };
  if (kcal > MAX_PLAUSIBLE_KCAL_100G) {
    return { ok: false, reason: 'the energy value is not plausible' };
  }

  const protein = num(n.proteins_100g) ?? 0;
  const carbs = num(n.carbohydrates_100g) ?? 0;
  const fat = num(n.fat_100g) ?? 0;

  if (protein + carbs + fat > MAX_MACRO_MASS_100G) {
    return { ok: false, reason: 'the macronutrients do not add up' };
  }

  // OFF reports sodium in GRAMS per 100 g; we store milligrams. Missing this
  // conversion would understate sodium a thousandfold, which for anyone
  // watching blood pressure is the difference between a useful number and a
  // dangerous one.
  const sodiumGrams = num(n.sodium_100g);

  const brandRaw = str(product.brands).split(',')[0]?.trim() ?? '';

  const tags = Array.isArray(product.allergens_tags) ? product.allergens_tags : [];

  return {
    ok: true,
    value: {
      name: name.slice(0, 200),
      brand: brandRaw.length > 0 ? brandRaw.slice(0, 120) : null,
      kcal_100g: kcal,
      protein_100g: protein,
      carbs_100g: carbs,
      fat_100g: fat,
      fiber_100g: num(n.fiber_100g),
      sugar_100g: num(n.sugars_100g),
      sat_fat_100g: num(n['saturated-fat_100g']),
      sodium_mg_100g: sodiumGrams === null ? null : Math.round(sodiumGrams * 1000),
      allergenIds: tags
        .map((tag) => (typeof tag === 'string' ? OFF_ALLERGEN_TAGS[tag] : undefined))
        .filter((id): id is number => id !== undefined),
    },
  };
};

/** Matches the CHECK constraint on foods.barcode. Validating before the network
 *  call keeps a malformed scan out of a request we would pay latency for. */
export const isValidBarcode = (barcode: string): boolean => /^[0-9]{6,14}$/.test(barcode.trim());
