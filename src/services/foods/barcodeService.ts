import { isValidBarcode } from '@shared/off-contracts/product';
import { AppError } from '@/lib/errors';
import { supabase } from '@/services/supabase/client';
import { mapUnknownError } from '@/services/supabase/errors';

export interface BarcodeResult {
  readonly foodId: string;
  readonly name: string;
  /** Where the answer came from. Surfaced so a stale-cache result can say so
   *  rather than presenting month-old data as fresh. */
  readonly source: 'cache' | 'stale_cache' | 'off';
}

/**
 * Resolve a scanned barcode to a food.
 *
 * Goes through an edge function rather than calling Open Food Facts directly:
 * the write-through cache is a service_role insert, and OFF asks for one
 * identifying User-Agent rather than thousands of app instances.
 */
export const lookupBarcode = async (barcode: string): Promise<BarcodeResult> => {
  // Checked here too, so an obviously bad scan costs no round trip.
  if (!isValidBarcode(barcode)) {
    throw new AppError({
      code: 'validation_failed',
      userMessage: 'That barcode does not look right.',
      retryable: false,
    });
  }

  try {
    const { data, error } = await supabase.functions.invoke<{
      food_id?: string;
      name?: string;
      source?: BarcodeResult['source'];
    }>('lookup-barcode', { body: { barcode: barcode.trim() } });

    if (error !== null) {
      const body = (error as { context?: { body?: unknown } }).context?.body;
      const text = typeof body === 'string' ? body : '';

      // A product OFF has never seen is the single most likely outcome, and it
      // is not a failure - the user adds it by hand.
      if (text.includes('not_found')) {
        throw new AppError({
          code: 'not_found',
          userMessage: "We don't know that product yet. You can add it manually.",
          retryable: false,
        });
      }
      if (text.includes('validation_failed')) {
        throw new AppError({
          code: 'validation_failed',
          userMessage: "That product's nutrition data is incomplete.",
          retryable: false,
        });
      }
      throw new AppError({
        code: 'network_unavailable',
        userMessage: "We couldn't look that up. Please try again.",
        cause: error,
        retryable: true,
      });
    }

    if (data?.food_id === undefined || data.name === undefined) {
      throw new AppError({
        code: 'server_error',
        userMessage: "We couldn't look that up. Please try again.",
        retryable: true,
      });
    }

    return { foodId: data.food_id, name: data.name, source: data.source ?? 'off' };
  } catch (e) {
    throw mapUnknownError(e);
  }
};
