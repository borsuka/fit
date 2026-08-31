import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { useRequireUserId } from '@/features/auth/SessionProvider';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { queryKeys } from '@/lib/queryClient';
import {
  addExerciseToSession,
  getRecentSessions,
  searchExercises,
  startSession,
  type ExerciseRow,
} from '@/services/workouts/workoutService';
import { Button, Card, Screen, Text, TextField, useTheme } from '@/ui';

/**
 * Start a session, or open a past one.
 *
 * Starting is one tap with a default name. Asking someone to name a workout
 * before they have done any of it is friction at exactly the moment they are
 * standing in a gym wanting to lift.
 */
export function WorkoutsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.workoutSessions(userId),
    queryFn: () => getRecentSessions(userId),
  });

  const exercisesQuery = useQuery<ExerciseRow[], AppError>({
    queryKey: ['exercises', query.trim()],
    queryFn: () => searchExercises(query),
    enabled: pendingSessionId !== null,
  });

  const create = useMutation<string, AppError, void>({
    mutationFn: () => startSession(userId, t('workouts.defaultName')),
    onSuccess: (id) => {
      setPendingSessionId(id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions(userId) });
    },
  });

  const addExercise = useMutation<string, AppError, { exerciseId: string; sortOrder: number }>({
    mutationFn: ({ exerciseId, sortOrder }) =>
      addExerciseToSession(userId, pendingSessionId as string, exerciseId, sortOrder),
  });

  const [added, setAdded] = useState(0);

  return (
    <Screen
      scroll
      footer={
        pendingSessionId === null ? (
          <Button
            label={t('workouts.start')}
            onPress={() => create.mutate()}
            loading={create.isPending}
            fullWidth
            size="lg"
          />
        ) : (
          <Button
            label={t('workouts.go')}
            onPress={() =>
              router.push({ pathname: '/workout/[id]', params: { id: pendingSessionId } })
            }
            disabled={added === 0}
            fullWidth
            size="lg"
          />
        )
      }
    >
      <Text variant="title">{t('workouts.title')}</Text>

      {create.isError ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {toMessage(create.error)}
        </Text>
      ) : null}

      {pendingSessionId !== null ? (
        <>
          <Text variant="label" tone="muted">
            {t('workouts.pickExercises', { count: added })}
          </Text>
          <TextField
            label={t('common.search')}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {(exercisesQuery.data ?? []).map((exercise) => (
            <Pressable
              key={exercise.id}
              accessibilityRole="button"
              accessibilityLabel={exercise.name}
              onPress={() => {
                addExercise.mutate({ exerciseId: exercise.id, sortOrder: added });
                setAdded((n) => n + 1);
              }}
              style={({ pressed }) => ({
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.md,
                backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                minHeight: 56,
                justifyContent: 'center',
              })}
            >
              <Text variant="body">{exercise.name}</Text>
              <Text variant="caption" tone="muted">
                {exercise.primary_muscle} · {exercise.equipment}
              </Text>
            </Pressable>
          ))}
        </>
      ) : (
        <>
          <Text variant="label" tone="muted">
            {t('workouts.history')}
          </Text>
          {(sessionsQuery.data ?? []).length === 0 ? (
            <Card>
              <Text variant="body" tone="muted">
                {t('workouts.noHistory')}
              </Text>
            </Card>
          ) : (
            (sessionsQuery.data ?? []).map((session) => (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/workout/[id]', params: { id: session.id } })
                }
              >
                <Card>
                  <Text variant="heading">{session.name}</Text>
                  <Text variant="caption" tone="muted">
                    {new Date(session.started_at).toLocaleDateString()}
                    {session.duration_seconds === null
                      ? ''
                      : ` · ${Math.round(session.duration_seconds / 60)} min`}
                  </Text>
                </Card>
              </Pressable>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
