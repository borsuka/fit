import * as ImageManipulator from 'expo-image-manipulator';

import type { LocalDate } from '@/domain/dates/localDate';
import { scaleNutrition, type NutritionPer100g } from '@/domain/nutrition';
import { AppError } from '@/lib/errors';
import { supabase, type Tables } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

export type ScanRow = Tables<'ai_scans'>;

/**
 * Longest edge of the uploaded image, in pixels.
 *
 * Vision models downsample anyway, so sending a 12 MP photo pays for upload
 * bandwidth, storage and input tokens to deliver detail the model discards.
 * 1024 px keeps a plate legible at roughly a tenth the bytes.
 */
const MAX_IMAGE_EDGE = 1024;
const JPEG_QUALITY = 0.7;

export interface ScanItemView {
  readonly id: string;
  readonly label: string;
  readonly normalizedQuery: string;
  readonly estimatedGrams: number;
  readonly confidence: number;
  readonly portionBasis: string | null;
  readonly matchedFoodId: string | null;
  readonly matchedFoodName: string | null;
  readonly matchScore: number | null;
  readonly per100g: NutritionPer100g | null;
}

/**
 * Shrinks and re-encodes before upload.
 *
 * Done on the device on purpose: the alternative is uploading the original and
 * resizing server-side, which moves megabytes over someone's mobile data to
 * throw most of them away.
 */
export const prepareImage = async (uri: string): Promise<{ uri: string }> => {
  try {
    const context = ImageManipulator.ImageManipulator.manipulate(uri);
    context.resize({ width: MAX_IMAGE_EDGE });
    const image = await context.renderAsync();
    const result = await image.saveAsync({
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: result.uri };
  } catch (e) {
    throw new AppError({
      code: 'storage_failed',
      userMessage: "We couldn't prepare your photo. Please try again.",
      cause: e,
      retryable: true,
    });
  }
};

/**
 * Uploads the photo and records the scan.
 *
 * The storage path is timestamp plus random suffix rather than the scan id,
 * because the row does not exist until the path is known - image_path is NOT
 * NULL by design, so there is no window in which a scan row points at nothing.
 * Cryptographic randomness is not needed: the only collisions that matter are
 * within one user's own folder.
 */
export const createScan = async (userId: string, localUri: string): Promise<ScanRow> => {
  try {
    const prepared = await prepareImage(localUri);

    const response = await fetch(prepared.uri);
    const bytes = await response.arrayBuffer();

    const suffix = Math.random().toString(36).slice(2, 10);
    const path = `${userId}/${Date.now()}-${suffix}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('food-photos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

    if (uploadError !== null) {
      throw new AppError({
        code: 'storage_failed',
        userMessage: "We couldn't upload your photo. Please try again.",
        cause: uploadError,
        retryable: true,
      });
    }

    const { data, error } = await supabase
      .from('ai_scans')
      .insert({ user_id: userId, image_path: path })
      .select()
      .single();

    if (error !== null) throw mapPostgrestError(error);
    return data;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Runs the analysis and matching.
 *
 * The vendor call happens in an edge function - the key must never be in the
 * bundle - and matching runs in Postgres, one statement for the whole plate
 * rather than a search per item.
 */
export const analyzeScan = async (scanId: string, locale: string): Promise<{ isFood: boolean }> => {
  try {
    const { data, error } = await supabase.functions.invoke<{ is_food?: boolean }>('analyze-meal', {
      body: { scan_id: scanId, locale },
    });

    if (error !== null) {
      // The function returns a stable code in the body; the transport error
      // does not carry it, so read the response when we can.
      const code =
        typeof (error as { context?: { body?: unknown } }).context?.body === 'string'
          ? (error as { context: { body: string } }).context.body
          : '';

      const known = ['quota_exceeded', 'premium_required', 'not_food', 'ai_invalid_response'].find(
        (c) => code.includes(c),
      );

      throw new AppError({
        code:
          known === 'quota_exceeded'
            ? 'quota_exceeded'
            : known === 'premium_required'
              ? 'premium_required'
              : known === 'ai_invalid_response'
                ? 'ai_invalid_response'
                : 'ai_unavailable',
        userMessage: "We couldn't analyze your meal. Please try again.",
        cause: error,
        retryable: known === undefined,
      });
    }

    if (data?.is_food === false) {
      throw new AppError({
        code: 'not_food',
        userMessage: "That doesn't look like a meal. Try another photo?",
        retryable: false,
      });
    }

    const { error: matchError } = await supabase.rpc('match_scan_items', { p_scan_id: scanId });
    // A matching failure is not fatal: every item is still editable and
    // searchable by hand, so the scan is degraded rather than lost.
    if (matchError !== null) {
      console.warn('match_scan_items failed', matchError.message);
    }

    return { isFood: true };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getScanItems = async (scanId: string): Promise<ScanItemView[]> => {
  try {
    // The embed names its foreign key: ai_scan_items points at foods twice,
    // through matched_food_id and user_food_id, so an unqualified `foods(...)`
    // is ambiguous. The generated types caught it at compile time rather than
    // leaving it to fail against a real database.
    //
    // No SQL comments in here - this is PostgREST select syntax, not SQL, and
    // a `--` line makes the whole selector unparseable.
    const { data, error } = await supabase
      .from('ai_scan_items')
      .select(
        `id, label, normalized_query, estimated_grams, confidence, portion_basis,
         matched_food_id, match_score,
         matched_food:foods!matched_food_id (
           name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g
         )`,
      )
      .eq('scan_id', scanId)
      .order('sort_order');

    if (error !== null) throw mapPostgrestError(error);

    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      normalizedQuery: row.normalized_query,
      estimatedGrams: Number(row.estimated_grams),
      confidence: Number(row.confidence),
      portionBasis: row.portion_basis,
      matchedFoodId: row.matched_food_id,
      matchedFoodName: row.matched_food?.name ?? null,
      matchScore: row.match_score === null ? null : Number(row.match_score),
      per100g:
        row.matched_food === null
          ? null
          : {
              kcal: Number(row.matched_food.kcal_100g),
              proteinG: Number(row.matched_food.protein_100g),
              carbsG: Number(row.matched_food.carbs_100g),
              fatG: Number(row.matched_food.fat_100g),
              ...(row.matched_food.fiber_100g === null
                ? {}
                : { fiberG: Number(row.matched_food.fiber_100g) }),
            },
    }));
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export interface ConfirmedItem {
  readonly scanItemId: string;
  readonly foodId: string;
  readonly grams: number;
  readonly per100g: NutritionPer100g;
}

export interface ConfirmScanInput {
  readonly userId: string;
  readonly scanId: string;
  readonly localDate: LocalDate;
  readonly mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  readonly items: readonly ConfirmedItem[];
}

/**
 * Writes the reviewed items to the diary.
 *
 * Nothing here comes from the model. Every number is computed from the food the
 * USER confirmed and the grams the USER chose, then snapshotted. The scan
 * record keeps the original estimate beside the correction, which is the
 * dataset that makes portion accuracy measurable.
 */
export const confirmScan = async (input: ConfirmScanInput): Promise<void> => {
  if (input.items.length === 0) {
    throw new AppError({
      code: 'validation_failed',
      userMessage: 'Select at least one item to add.',
      retryable: false,
    });
  }

  try {
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .upsert(
        { user_id: input.userId, local_date: input.localDate, meal_type: input.mealType },
        { onConflict: 'user_id,local_date,meal_type', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (mealError !== null) throw mapPostgrestError(mealError);

    const rows = input.items.map((item) => {
      const snapshot = scaleNutrition(item.per100g, item.grams);
      return {
        meal_id: meal.id,
        user_id: input.userId,
        source: 'ai_scan' as const,
        food_id: item.foodId,
        ai_scan_item_id: item.scanItemId,
        quantity_g: item.grams,
        kcal: snapshot.kcal,
        protein_g: snapshot.proteinG,
        carbs_g: snapshot.carbsG,
        fat_g: snapshot.fatG,
        fiber_g: snapshot.fiberG,
      };
    });

    const { error: itemsError } = await supabase.from('meal_items').insert(rows);
    if (itemsError !== null) throw mapPostgrestError(itemsError);

    // Record what the human actually chose, next to what the model guessed.
    await Promise.all(
      input.items.map((item) =>
        supabase
          .from('ai_scan_items')
          .update({ user_accepted: true, user_food_id: item.foodId, user_grams: item.grams })
          .eq('id', item.scanItemId),
      ),
    );

    const { error: scanError } = await supabase
      .from('ai_scans')
      .update({ status: 'confirmed', meal_id: meal.id })
      .eq('id', input.scanId);

    if (scanError !== null) throw mapPostgrestError(scanError);
  } catch (e) {
    throw mapUnknownError(e);
  }
};
