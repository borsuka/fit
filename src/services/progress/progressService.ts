import type { LocalDate } from '@/domain/dates/localDate';
import type { WeightEntry } from '@/domain/progress/weightTrend';
import { supabase } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

export const getWeightLogs = async (userId: string, limit = 180): Promise<WeightEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('weight_logs')
      .select('logged_on, weight_kg')
      .eq('user_id', userId)
      .order('logged_on', { ascending: false })
      .limit(limit);

    if (error !== null) throw mapPostgrestError(error);

    // Fetched newest-first so the limit keeps the RECENT window, then reversed:
    // the trend maths and the chart both read left to right in time.
    return (data ?? [])
      .map((row) => ({ loggedOn: row.logged_on, weightKg: Number(row.weight_kg) }))
      .reverse();
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Records today's weight.
 *
 * Upsert, not insert: weight_logs is unique per user per day, and someone who
 * weighs themselves twice means the second reading, not an error.
 */
export const logWeight = async (
  userId: string,
  loggedOn: LocalDate,
  weightKg: number,
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('weight_logs')
      .upsert(
        { user_id: userId, logged_on: loggedOn, weight_kg: weightKg, source: 'manual' },
        { onConflict: 'user_id,logged_on' },
      );

    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};
