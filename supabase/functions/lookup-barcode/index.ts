import {
  isValidBarcode,
  toFoodPayload,
  type OffProduct,
} from '../../../shared/off-contracts/product.ts';
import { buildContext, errorResponse, HttpError, jsonResponse } from '../_shared/context.ts';

/**
 * POST /functions/v1/lookup-barcode   { barcode: string }
 *
 * Decision D-2, the write-through half: look in our own `foods` first, and on a
 * miss fetch from Open Food Facts and cache the result.
 *
 * Why an edge function rather than a direct client call:
 *
 *   - `foods` rows with source 'off' are service_role writes. A client that
 *     could insert them could poison the shared corpus for every user.
 *   - OFF asks for an identifying User-Agent. One server-side identity is
 *     honest and rate-limitable; thousands of app instances are neither.
 *   - OFF data is user-contributed and frequently wrong or incomplete. It gets
 *     validated here, once, rather than in every caller.
 */

interface OffResponse {
  readonly status?: number;
  readonly product?: OffProduct;
}

const OFF_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS =
  'code,product_name,product_name_en,brands,quantity,nutriments,allergens_tags,serving_quantity';
const TIMEOUT_MS = 8_000;

/** Refetch a cached product after this long. OFF corrects entries continually,
 *  and a wrong calorie figure cached forever is the failure this app cannot
 *  absorb. */
const STALE_AFTER_DAYS = 90;

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'server_error', 'method not allowed');

    const ctx = await buildContext(request);
    const body = (await request.json().catch(() => ({}))) as { barcode?: string };
    const barcode = (body.barcode ?? '').trim();

    if (!isValidBarcode(barcode)) {
      throw new HttpError(400, 'validation_failed', 'barcode must be 6-14 digits');
    }

    // --- our own corpus first ------------------------------------------------
    const { data: cached, error: cacheError } = await ctx.userClient
      .from('foods')
      .select('id, name, brand, fetched_at, source')
      .eq('barcode', barcode)
      .is('archived_at', null)
      .maybeSingle();

    if (cacheError !== null) throw new HttpError(500, 'server_error', cacheError.message);

    if (cached !== null) {
      const staleAt = cached.fetched_at
        ? new Date(cached.fetched_at).getTime() + STALE_AFTER_DAYS * 86_400_000
        : Number.POSITIVE_INFINITY;

      // A curated or USDA row is ours and never goes stale from OFF's clock.
      if (cached.source !== 'off' || Date.now() < staleAt) {
        return jsonResponse({ food_id: cached.id, name: cached.name, source: 'cache' });
      }
    }

    // --- Open Food Facts -----------------------------------------------------
    const userAgent =
      Deno.env.get('OPEN_FOOD_FACTS_USER_AGENT') ?? 'fit-app/0.1 (contact unset)';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let offResponse: Response;
    try {
      offResponse = await fetch(`${OFF_ENDPOINT}/${barcode}.json?fields=${OFF_FIELDS}`, {
        headers: { 'User-Agent': userAgent },
        signal: controller.signal,
      });
    } catch (e) {
      // A cached row we decided was stale still beats nothing when the lookup
      // fails. Slightly old data is far better than "we lost your food".
      if (cached !== null) {
        return jsonResponse({ food_id: cached.id, name: cached.name, source: 'stale_cache' });
      }
      throw new HttpError(503, 'network_unavailable', `off unreachable: ${String(e)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!offResponse.ok) {
      if (cached !== null) {
        return jsonResponse({ food_id: cached.id, name: cached.name, source: 'stale_cache' });
      }
      throw new HttpError(503, 'server_error', `off ${offResponse.status}`);
    }

    const off = (await offResponse.json()) as OffResponse;

    // status 0 means OFF simply does not have it. That is a normal outcome, not
    // an error - the app offers manual entry.
    if (off.status !== 1 || off.product === undefined) {
      throw new HttpError(404, 'not_found', 'not in Open Food Facts');
    }

    const mapped = toFoodPayload(off.product);
    if (!mapped.ok) {
      // OFF entries are crowd-sourced and often partial. Saying which field is
      // missing beats a generic failure the user cannot act on.
      throw new HttpError(422, 'validation_failed', mapped.reason);
    }
    const payload = mapped.value;

    // --- write through -------------------------------------------------------
    const { data: saved, error: saveError } = await ctx.serviceClient
      .from('foods')
      .upsert(
        {
          source: 'off',
          source_id: barcode,
          barcode,
          name: payload.name,
          brand: payload.brand,
          kcal_100g: payload.kcal_100g,
          protein_100g: payload.protein_100g,
          carbs_100g: payload.carbs_100g,
          fat_100g: payload.fat_100g,
          fiber_100g: payload.fiber_100g,
          sugar_100g: payload.sugar_100g,
          sat_fat_100g: payload.sat_fat_100g,
          sodium_mg_100g: payload.sodium_mg_100g,
          is_public: true,
          // 2, not higher: crowd-sourced and unverified. Search ranks curated
          // and USDA entries above it for exactly this reason.
          data_quality: 2,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'barcode' },
      )
      .select('id, name')
      .single();

    if (saveError !== null) throw new HttpError(500, 'server_error', saveError.message);

    if (payload.allergenIds.length > 0) {
      // Replaced wholesale: an allergen removed upstream must disappear here
      // too, and a stale allergen row is a filter that silently stops matching.
      await ctx.serviceClient.from('food_allergens').delete().eq('food_id', saved.id);
      await ctx.serviceClient
        .from('food_allergens')
        .insert(payload.allergenIds.map((allergen_id) => ({ food_id: saved.id, allergen_id })));
    }

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'barcode_resolved',
        user_id: ctx.userId,
        barcode,
        source: 'off',
        allergen_count: payload.allergenIds.length,
      }),
    );

    return jsonResponse({ food_id: saved.id, name: saved.name, source: 'off' });
  } catch (error) {
    return errorResponse(error);
  }
});
