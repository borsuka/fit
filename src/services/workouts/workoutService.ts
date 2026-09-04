import type { WorkSet } from '@/domain/workouts/strength';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';
import { supabase, type Tables } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

/**
 * An exercise as a picker shows it: the name already in the user's language.
 *
 * Not `Tables<'exercises'>` any more. That row carries the English name, and a
 * type that lets a screen render `.name` without thinking is how the English
 * leaked into a Bulgarian interface in the first place.
 */
export interface ExerciseRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly primary_muscle: string;
  readonly equipment: string;
  readonly difficulty: number;
}

export interface SessionExerciseView {
  readonly id: string;
  readonly exerciseId: string;
  readonly name: string;
  readonly sets: readonly (WorkSet & { id: string; setNumber: number })[];
}

export interface SessionView {
  readonly id: string;
  readonly name: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly exercises: readonly SessionExerciseView[];
}

/**
 * Exercise search, in either language.
 *
 * Was an ILIKE over the English name, which meant "клек" found nothing while
 * the Bulgarian row for it sat unused in exercise_translations. The RPC
 * matches name and translations in every language and returns the name in the
 * one asked for. An empty query browses the whole library rather than
 * returning nothing - the picker has to be usable before anyone types.
 */
export const searchExercises = async (
  query: string,
  locale: Locale = DEFAULT_LOCALE,
  limit = 30,
): Promise<ExerciseRow[]> => {
  try {
    const term = query.trim();
    const { data, error } = await supabase.rpc('search_exercises', {
      // Omitted rather than passed as null, so the function's own default
      // applies. exactOptionalPropertyTypes forbids assigning undefined, and a
      // literal null is not what the generated type accepts either.
      ...(term.length === 0 ? {} : { p_query: term }),
      p_limit: limit,
      p_locale: locale,
    });

    if (error !== null) throw mapPostgrestError(error);

    return (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      primary_muscle: row.primary_muscle,
      equipment: row.equipment,
      difficulty: row.difficulty,
    }));
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const startSession = async (userId: string, name: string): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from('workout_sessions')
      .insert({ user_id: userId, name })
      .select('id')
      .single();

    if (error !== null) throw mapPostgrestError(error);
    return data.id;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const addExerciseToSession = async (
  userId: string,
  sessionId: string,
  exerciseId: string,
  sortOrder: number,
): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from('session_exercises')
      .insert({
        session_id: sessionId,
        user_id: userId,
        exercise_id: exerciseId,
        sort_order: sortOrder,
      })
      .select('id')
      .single();

    if (error !== null) throw mapPostgrestError(error);
    return data.id;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Logs one set.
 *
 * `set_number` is supplied by the caller from what is already on screen rather
 * than counted server-side. Two taps a second apart would otherwise both read
 * "three sets logged" and both write set 4, which the unique index rejects -
 * losing the second set with an error the user cannot interpret.
 */
export const logSet = async (
  userId: string,
  sessionExerciseId: string,
  setNumber: number,
  set: WorkSet,
): Promise<void> => {
  try {
    const { error } = await supabase.from('workout_sets').insert({
      session_exercise_id: sessionExerciseId,
      user_id: userId,
      set_number: setNumber,
      reps: set.reps,
      weight_kg: set.weightKg,
      is_warmup: set.isWarmup,
    });

    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const deleteSet = async (setId: string): Promise<void> => {
  try {
    const { error } = await supabase.from('workout_sets').delete().eq('id', setId);
    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const finishSession = async (sessionId: string, startedAt: string): Promise<void> => {
  try {
    const endedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - new Date(startedAt).getTime()) / 1000),
    );

    const { error } = await supabase
      .from('workout_sessions')
      .update({ ended_at: endedAt.toISOString(), duration_seconds: durationSeconds })
      .eq('id', sessionId);

    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getSession = async (
  sessionId: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<SessionView | null> => {
  try {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select(
        `id, name, started_at, ended_at,
         session_exercises ( id, exercise_id, sort_order,
           exercises ( name, exercise_translations ( name ) ),
           workout_sets ( id, set_number, reps, weight_kg, is_warmup ) )`,
      )
      .eq('session_exercises.exercises.exercise_translations.locale', locale)
      .eq('id', sessionId)
      .maybeSingle();

    if (error !== null) throw mapPostgrestError(error);
    if (data === null) return null;

    return {
      id: data.id,
      name: data.name,
      startedAt: data.started_at,
      endedAt: data.ended_at,
      exercises: [...(data.session_exercises ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((exercise) => ({
          id: exercise.id,
          exerciseId: exercise.exercise_id,
          name:
            exercise.exercises?.exercise_translations[0]?.name ??
            exercise.exercises?.name ??
            'Exercise',
          sets: [...(exercise.workout_sets ?? [])]
            .sort((a, b) => a.set_number - b.set_number)
            .map((s) => ({
              id: s.id,
              setNumber: s.set_number,
              reps: s.reps ?? 0,
              weightKg: Number(s.weight_kg ?? 0),
              isWarmup: s.is_warmup,
            })),
        })),
    };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * The most recent completed sets for one exercise.
 *
 * Progression advice is meaningless without it: "add 2.5 kg" needs to know what
 * was lifted last time, and asking the user to remember defeats the point of
 * logging.
 */
export const getLastSetsForExercise = async (
  userId: string,
  exerciseId: string,
): Promise<readonly WorkSet[]> => {
  try {
    const { data, error } = await supabase
      .from('session_exercises')
      .select(
        `id, workout_sets ( reps, weight_kg, is_warmup ),
         workout_sessions!inner ( ended_at )`,
      )
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .not('workout_sessions.ended_at', 'is', null)
      .order('id', { ascending: false })
      .limit(1);

    if (error !== null) throw mapPostgrestError(error);

    const first = data?.[0];
    if (first === undefined) return [];

    return (first.workout_sets ?? []).map((s) => ({
      reps: s.reps ?? 0,
      weightKg: Number(s.weight_kg ?? 0),
      isWarmup: s.is_warmup,
    }));
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getRecentSessions = async (
  userId: string,
  limit = 20,
): Promise<Tables<'workout_sessions'>[]> => {
  try {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error !== null) throw mapPostgrestError(error);
    return data ?? [];
  } catch (e) {
    throw mapUnknownError(e);
  }
};
