import { AppError } from '@/lib/errors';
import { supabase, type Tables } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

/**
 * Programmes, personal templates, and the moves between them.
 *
 * The catalogue is read-only reference data. Adopting a programme COPIES a day
 * into the user's own `workouts`, so swapping an exercise is an edit to their
 * row and not to something shared - and a later change to the catalogue cannot
 * rewrite the plan someone is halfway through.
 */

export type ProgramRow = Tables<'programs'>;

export interface ProgramDayExercise {
  readonly id: string;
  readonly exerciseId: string;
  readonly name: string;
  readonly primaryMuscle: string;
  readonly equipment: string;
  readonly sortOrder: number;
  readonly targetSets: number;
  readonly targetReps: number;
  readonly restSeconds: number | null;
}

export interface ProgramDay {
  readonly id: string;
  readonly dayIndex: number;
  readonly name: string;
  readonly exercises: readonly ProgramDayExercise[];
}

export interface ProgramDetail {
  readonly program: ProgramRow;
  readonly days: readonly ProgramDay[];
}

export const listPrograms = async (): Promise<ProgramRow[]> => {
  try {
    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error !== null) throw mapPostgrestError(error);
    return data ?? [];
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getProgram = async (programId: string): Promise<ProgramDetail | null> => {
  try {
    const { data: program, error: programError } = await supabase
      .from('programs')
      .select('*')
      .eq('id', programId)
      .maybeSingle();

    if (programError !== null) throw mapPostgrestError(programError);
    if (program === null) return null;

    const { data: days, error: daysError } = await supabase
      .from('program_days')
      .select(
        'id, day_index, name, program_exercises(id, exercise_id, sort_order, target_sets, target_reps, rest_seconds, exercises(name, primary_muscle, equipment))',
      )
      .eq('program_id', programId)
      .order('day_index', { ascending: true });

    if (daysError !== null) throw mapPostgrestError(daysError);

    return {
      program,
      days: (days ?? []).map((day) => ({
        id: day.id,
        dayIndex: day.day_index,
        name: day.name,
        exercises: (day.program_exercises ?? [])
          .map((row) => ({
            id: row.id,
            exerciseId: row.exercise_id,
            name: row.exercises?.name ?? '',
            primaryMuscle: row.exercises?.primary_muscle ?? '',
            equipment: row.exercises?.equipment ?? '',
            sortOrder: row.sort_order,
            targetSets: row.target_sets,
            targetReps: row.target_reps,
            restSeconds: row.rest_seconds,
          }))
          // PostgREST does not order embedded rows, and an out-of-order
          // programme reads as a different programme.
          .sort((a, b) => a.sortOrder - b.sortOrder),
      })),
    };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/** Copies one programme day into a template owned by the caller, in one
 *  transaction. See the migration for why this is not two client inserts. */
export const adoptProgramDay = async (programId: string, dayIndex: number): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('adopt_program_day', {
      p_program_id: programId,
      p_day_index: dayIndex,
    });

    if (error !== null) throw mapPostgrestError(error);
    return data as string;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

// ---------------------------------------------------------------------------
// The user's own templates
// ---------------------------------------------------------------------------

export interface TemplateExercise {
  readonly id: string;
  readonly exerciseId: string;
  readonly name: string;
  readonly primaryMuscle: string;
  readonly equipment: string;
  readonly sortOrder: number;
  readonly targetSets: number | null;
  readonly targetReps: number | null;
  readonly restSeconds: number | null;
}

export interface TemplateView {
  readonly id: string;
  readonly name: string;
  readonly sourceProgramId: string | null;
  readonly exercises: readonly TemplateExercise[];
}

export interface TemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly exerciseCount: number;
}

export const listTemplates = async (userId: string): Promise<TemplateSummary[]> => {
  try {
    const { data, error } = await supabase
      .from('workouts')
      .select('id, name, workout_exercises(id)')
      .eq('user_id', userId)
      .eq('is_template', true)
      .order('created_at', { ascending: false });

    if (error !== null) throw mapPostgrestError(error);

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      exerciseCount: (row.workout_exercises ?? []).length,
    }));
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getTemplate = async (workoutId: string): Promise<TemplateView | null> => {
  try {
    const { data, error } = await supabase
      .from('workouts')
      .select(
        'id, name, source_program_id, workout_exercises(id, exercise_id, sort_order, target_sets, target_reps, rest_seconds, exercises(name, primary_muscle, equipment))',
      )
      .eq('id', workoutId)
      .maybeSingle();

    if (error !== null) throw mapPostgrestError(error);
    if (data === null) return null;

    return {
      id: data.id,
      name: data.name,
      sourceProgramId: data.source_program_id,
      exercises: (data.workout_exercises ?? [])
        .map((row) => ({
          id: row.id,
          exerciseId: row.exercise_id,
          name: row.exercises?.name ?? '',
          primaryMuscle: row.exercises?.primary_muscle ?? '',
          equipment: row.exercises?.equipment ?? '',
          sortOrder: row.sort_order,
          targetSets: row.target_sets,
          targetReps: row.target_reps,
          restSeconds: row.rest_seconds,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const createTemplate = async (userId: string, name: string): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from('workouts')
      .insert({ user_id: userId, name, is_template: true })
      .select('id')
      .single();

    if (error !== null) throw mapPostgrestError(error);
    return data.id;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const renameTemplate = async (workoutId: string, name: string): Promise<void> => {
  try {
    const { error } = await supabase.from('workouts').update({ name }).eq('id', workoutId);
    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const deleteTemplate = async (workoutId: string): Promise<void> => {
  try {
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export interface AddTemplateExerciseInput {
  readonly workoutId: string;
  readonly exerciseId: string;
  readonly sortOrder: number;
  readonly targetSets?: number | undefined;
  readonly targetReps?: number | undefined;
}

export const addTemplateExercise = async (input: AddTemplateExerciseInput): Promise<void> => {
  try {
    const { error } = await supabase.from('workout_exercises').insert({
      workout_id: input.workoutId,
      exercise_id: input.exerciseId,
      sort_order: input.sortOrder,
      target_sets: input.targetSets ?? 3,
      target_reps: input.targetReps ?? 8,
    });

    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Replaces the exercise in one template row, keeping its position and targets.
 *
 * An update rather than delete-and-insert: the row's position in the workout is
 * the thing the user is NOT changing, and rebuilding it would put the
 * replacement at the bottom of a plan they carefully ordered.
 */
export const swapTemplateExercise = async (
  templateExerciseId: string,
  exerciseId: string,
): Promise<void> => {
  try {
    const { error, count } = await supabase
      .from('workout_exercises')
      .update({ exercise_id: exerciseId }, { count: 'exact' })
      .eq('id', templateExerciseId);

    if (error !== null) throw mapPostgrestError(error);
    // An UPDATE filtered out by RLS affects zero rows and reports success.
    // Without this check a swap on someone else's template would look like it
    // worked. See SECURITY.md.
    if (count === 0) {
      throw new AppError({
        code: 'not_found',
        userMessage: 'That exercise is no longer in your plan.',
        context: { templateExerciseId },
      });
    }
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const removeTemplateExercise = async (templateExerciseId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('workout_exercises')
      .delete()
      .eq('id', templateExerciseId);
    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export interface AlternativeExercise {
  readonly id: string;
  readonly name: string;
  readonly primaryMuscle: string;
  readonly equipment: string;
  readonly difficulty: number;
  /** 1 = same pattern and muscle, 2 = same pattern, 3 = same muscle. */
  readonly matchRank: number;
}

export const suggestAlternatives = async (
  exerciseId: string,
  limit = 8,
): Promise<AlternativeExercise[]> => {
  try {
    const { data, error } = await supabase.rpc('suggest_alternatives', {
      p_exercise_id: exerciseId,
      p_limit: limit,
    });

    if (error !== null) throw mapPostgrestError(error);

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      primaryMuscle: row.primary_muscle,
      equipment: row.equipment,
      difficulty: row.difficulty,
      matchRank: row.match_rank,
    }));
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const startSessionFromTemplate = async (workoutId: string): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('start_session_from_workout', {
      p_workout_id: workoutId,
    });

    if (error !== null) throw mapPostgrestError(error);
    return data as string;
  } catch (e) {
    throw mapUnknownError(e);
  }
};
