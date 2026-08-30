import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  bestOneRepMax,
  nextSessionAdvice,
  totalVolumeKg,
  type ProgressionTarget,
  type WorkSet,
} from '@/domain/workouts';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import {
  deleteSet,
  finishSession,
  getLastSetsForExercise,
  getSession,
  logSet,
  type SessionView,
} from '@/services/workouts/workoutService';
import { Button, Card, Screen, Text, TextField, useTheme } from '@/ui';

/** Smallest plate step in a typical gym. A suggestion the user cannot load is
 *  not a suggestion; this becomes a per-exercise setting later. */
const DEFAULT_TARGET: ProgressionTarget = { targetReps: 8, targetSets: 3, incrementKg: 2.5 };

export function WorkoutSessionScreen({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery<SessionView | null, AppError>({
    queryKey: ['workoutSession', sessionId],
    queryFn: () => getSession(sessionId),
  });

  const [drafts, setDrafts] = useState<Record<string, { reps: string; weight: string }>>({});

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
  };

  const addSet = useMutation<
    void,
    AppError,
    { sessionExerciseId: string; setNumber: number; set: WorkSet }
  >({
    mutationFn: ({ sessionExerciseId, setNumber, set }) =>
      logSet(userId, sessionExerciseId, setNumber, set),
    onSuccess: invalidate,
  });

  const removeSet = useMutation<void, AppError, string>({
    mutationFn: deleteSet,
    onSuccess: invalidate,
  });

  const finish = useMutation<void, AppError, void>({
    mutationFn: () => finishSession(sessionId, session?.startedAt ?? new Date().toISOString()),
    onSuccess: invalidate,
  });

  const session = sessionQuery.data ?? null;

  if (sessionQuery.isLoading) {
    return (
      <Screen>
        <Text variant="body" tone="muted">
          {t('common.loading')}
        </Text>
      </Screen>
    );
  }

  if (session === null) {
    return (
      <Screen>
        <Card>
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {sessionQuery.isError ? toMessage(sessionQuery.error) : t('errors.not_found')}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={
        session.endedAt === null ? (
          <Button
            label={t('workouts.finish')}
            onPress={() => finish.mutate()}
            loading={finish.isPending}
            fullWidth
            size="lg"
          />
        ) : (
          <Text variant="label" tone="success">
            {t('workouts.finished')}
          </Text>
        )
      }
    >
      <Text variant="title">{session.name}</Text>

      {session.exercises.length === 0 ? (
        <Card>
          <Text variant="body" tone="muted">
            {t('workouts.noExercises')}
          </Text>
        </Card>
      ) : null}

      {session.exercises.map((exercise) => {
        const draft = drafts[exercise.id] ?? { reps: '', weight: '' };
        const volume = totalVolumeKg(exercise.sets);
        const oneRm = bestOneRepMax(exercise.sets);
        const nextSetNumber = (exercise.sets.at(-1)?.setNumber ?? 0) + 1;

        const reps = Number(draft.reps.replace(',', '.'));
        const weight = Number(draft.weight.replace(',', '.'));
        const canLog = Number.isFinite(reps) && reps > 0 && Number.isFinite(weight) && weight >= 0;

        return (
          <Card key={exercise.id}>
            <Text variant="heading">{exercise.name}</Text>

            {exercise.sets.length === 0 ? (
              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                {t('workouts.noSets')}
              </Text>
            ) : (
              <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
                {exercise.sets.map((set) => (
                  <View
                    key={set.id}
                    style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                  >
                    {/* The format people actually speak: 60kg x 8. */}
                    <Text variant="body">
                      {set.weightKg} kg × {set.reps}
                      {set.isWarmup ? ` · ${t('workouts.warmup')}` : ''}
                    </Text>
                    <Text
                      variant="caption"
                      tone="danger"
                      onPress={() => removeSet.mutate(set.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.delete')}
                    >
                      {t('common.delete')}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.sm,
                marginTop: theme.spacing.md,
                alignItems: 'flex-end',
              }}
            >
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('workouts.weight')}
                  value={draft.weight}
                  onChangeText={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [exercise.id]: { ...draft, weight: value },
                    }))
                  }
                  keyboardType="decimal-pad"
                  suffix="kg"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('workouts.reps')}
                  value={draft.reps}
                  onChangeText={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [exercise.id]: { ...draft, reps: value },
                    }))
                  }
                  keyboardType="number-pad"
                />
              </View>
              <Button
                label={t('workouts.logSet')}
                disabled={!canLog || session.endedAt !== null}
                loading={addSet.isPending}
                onPress={() =>
                  addSet.mutate({
                    sessionExerciseId: exercise.id,
                    // Taken from what is on screen, not counted server-side:
                    // two quick taps would both read the same count and both
                    // write the same set number, which the unique index
                    // rejects.
                    setNumber: nextSetNumber,
                    set: { reps, weightKg: weight, isWarmup: false },
                  })
                }
              />
            </View>

            {exercise.sets.length > 0 ? (
              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                {t('workouts.volume')}: {Math.round(volume)} kg
                {oneRm === null ? '' : ` · ${t('workouts.estimated1rm')} ${Math.round(oneRm)} kg`}
              </Text>
            ) : null}

            <ProgressionHint userId={userId} exerciseId={exercise.exerciseId} />
          </Card>
        );
      })}

      {addSet.isError ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {toMessage(addSet.error)}
        </Text>
      ) : null}
    </Screen>
  );
}

/**
 * What to aim for this session, based on the last completed one.
 *
 * Silent when there is no history. A suggestion invented from nothing is worse
 * than no suggestion - it teaches people the number is noise.
 */
function ProgressionHint({ userId, exerciseId }: { userId: string; exerciseId: string }) {
  const { t } = useTranslation();

  const lastQuery = useQuery<readonly WorkSet[], AppError>({
    queryKey: ['lastSets', userId, exerciseId],
    queryFn: () => getLastSetsForExercise(userId, exerciseId),
    staleTime: 5 * 60_000,
  });

  const advice =
    lastQuery.data === undefined ? null : nextSessionAdvice(lastQuery.data, DEFAULT_TARGET);

  if (advice === null) return null;

  return (
    <Text variant="caption" tone="primary" style={{ marginTop: 4 }}>
      {t(`workouts.advice_${advice.kind}`, { weight: advice.weightKg, reps: advice.reps })}
    </Text>
  );
}
