import type { WorkSet } from '@/domain/workouts/strength';
import { supabase, type Tables } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

export type ExerciseRow = Tables<'exercises'>;

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

export const searchExercises = async (query: string, limit = 30): Promise<ExerciseRow[]> => {
  try {
    const term = query.trim();
    let request = supabase.from('exercises').select('*').order('name').limit(limit);
    if (term.length > 0) request = request.ilike('name', `%${term}%`);

    const { data, error } = await request;
    if (error !== null) throw mapPostgrestError(error);
    return data ?? [];
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

export const getSession = async (sessionId: string): Promise<SessionView | null> => {
  try {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select(
        `id, name, started_at, ended_at,
         session_exercises ( id, exercise_id, sort_order,
           exercises ( name ),
           workout_sets ( id, set_number, reps, weight_kg, is_warmup ) )`,
      )
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
          name: exercise.exercises?.name ?? 'Exercise',
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
