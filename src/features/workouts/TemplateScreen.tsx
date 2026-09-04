import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useRequireUserId } from '@/features/auth/SessionProvider';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { useLocale } from '@/lib/i18n/useLocale';
import { queryKeys } from '@/lib/queryClient';
import {
  addTemplateExercise,
  getTemplate,
  removeTemplateExercise,
  startSessionFromTemplate,
  suggestAlternatives,
  swapTemplateExercise,
  type AlternativeExercise,
  type TemplateView,
} from '@/services/workouts/programService';
import { searchExercises, type ExerciseRow } from '@/services/workouts/workoutService';
import { Button, Card, Screen, ScreenHeader, Text, TextField, useTheme } from '@/ui';

/**
 * One of the user's own plans: reorderable in intent, swappable in practice.
 *
 * Swapping is the point of this screen. A programme that prescribes a barbell
 * back squat is useless to someone whose gym has no rack and worse than useless
 * to someone whose knee will not allow it - and the usual outcome is that they
 * abandon the programme rather than the exercise.
 */
export function TemplateScreen({ workoutId }: { workoutId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const locale = useLocale();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const [swapping, setSwapping] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const templateQuery = useQuery<TemplateView | null, AppError>({
    queryKey: ['template', workoutId, locale],
    queryFn: () => getTemplate(workoutId, locale),
  });

  const template = templateQuery.data;

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['template', workoutId] });
    void queryClient.invalidateQueries({ queryKey: ['templates', userId] });
  };

  const swap = useMutation<void, AppError, { rowId: string; exerciseId: string }>({
    mutationFn: ({ rowId, exerciseId }) => swapTemplateExercise(rowId, exerciseId),
    onSuccess: () => {
      setSwapping(null);
      invalidate();
    },
  });

  const remove = useMutation<void, AppError, string>({
    mutationFn: removeTemplateExercise,
    onSuccess: invalidate,
  });

  const add = useMutation<void, AppError, string>({
    mutationFn: (exerciseId) =>
      addTemplateExercise({
        workoutId,
        exerciseId,
        sortOrder: template?.exercises.length ?? 0,
      }),
    onSuccess: () => {
      setQuery('');
      invalidate();
    },
  });

  const start = useMutation<string, AppError, void>({
    mutationFn: () => startSessionFromTemplate(workoutId),
    onSuccess: (sessionId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions(userId) });
      router.replace({ pathname: '/workout/[id]', params: { id: sessionId } });
    },
  });

  const header = <ScreenHeader fallbackHref="/workouts" />;

  if (template === null || template === undefined) {
    return (
      <Screen header={header}>
        <Text variant="body" tone="muted">
          {templateQuery.isError ? toMessage(templateQuery.error) : t('common.loading')}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      header={header}
      footer={
        <>
          {start.isError ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {toMessage(start.error)}
            </Text>
          ) : null}
          <Button
            label={t('templates.start')}
            onPress={() => start.mutate()}
            loading={start.isPending}
            disabled={template.exercises.length === 0}
            fullWidth
            size="lg"
          />
        </>
      }
    >
      <Text variant="title">{template.name}</Text>

      {swap.isError ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {toMessage(swap.error)}
        </Text>
      ) : null}

      {template.exercises.length === 0 ? (
        <Card>
          <Text variant="body" tone="muted">
            {t('templates.empty')}
          </Text>
        </Card>
      ) : null}

      {template.exercises.map((exercise) => (
        <Card key={exercise.id}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text variant="heading">{exercise.name}</Text>
              <Text variant="caption" tone="muted">
                {exercise.targetSets ?? 3} × {exercise.targetReps ?? 8} · {exercise.primaryMuscle} ·{' '}
                {exercise.equipment}
              </Text>
            </View>
          </View>

          <View
            style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md }}
          >
            <Button
              label={swapping === exercise.id ? t('common.cancel') : t('templates.swap')}
              variant="secondary"
              onPress={() => setSwapping(swapping === exercise.id ? null : exercise.id)}
            />
            <Button
              label={t('common.delete')}
              variant="secondary"
              onPress={() => remove.mutate(exercise.id)}
            />
          </View>

          {swapping === exercise.id ? (
            <AlternativeList
              exerciseId={exercise.exerciseId}
              onPick={(alternativeId) =>
                swap.mutate({ rowId: exercise.id, exerciseId: alternativeId })
              }
            />
          ) : null}
        </Card>
      ))}

      {adding ? (
        <Card>
          <TextField
            label={t('common.search')}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ExerciseSearchResults query={query} onPick={(id) => add.mutate(id)} />
        </Card>
      ) : null}

      <Button
        label={adding ? t('common.done') : t('templates.addExercise')}
        variant="secondary"
        fullWidth
        onPress={() => setAdding(!adding)}
      />
    </Screen>
  );
}

/**
 * Ranked replacements for one exercise.
 *
 * The rank is shown, not hidden behind ordering alone: "same movement" and
 * "same muscle" are different promises, and a lifter deciding whether a swap
 * keeps their programme intact needs to know which one they are getting.
 */
function AlternativeList({
  exerciseId,
  onPick,
}: {
  exerciseId: string;
  onPick: (exerciseId: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();

  const alternativesQuery = useQuery<AlternativeExercise[], AppError>({
    queryKey: ['alternatives', exerciseId, locale],
    staleTime: 60 * 60_000,
    queryFn: () => suggestAlternatives(exerciseId, locale),
  });

  const alternatives = alternativesQuery.data ?? [];

  if (alternativesQuery.isLoading) {
    return (
      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {t('common.loading')}
      </Text>
    );
  }

  if (alternatives.length === 0) {
    return (
      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {/* Nothing, rather than an unrelated exercise. See suggest_alternatives. */}
        {t('templates.noAlternatives')}
      </Text>
    );
  }

  return (
    <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
      <Text variant="label" tone="muted">
        {t('templates.swapTo')}
      </Text>
      {alternatives.map((alternative) => (
        <Pressable
          key={alternative.id}
          accessibilityRole="button"
          accessibilityLabel={alternative.name}
          onPress={() => onPick(alternative.id)}
          style={({ pressed }) => ({
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
            minHeight: 44,
            justifyContent: 'center',
          })}
        >
          <Text variant="body">{alternative.name}</Text>
          <Text variant="caption" tone="muted">
            {t(`templates.match_${alternative.matchRank}`)} · {alternative.equipment}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ExerciseSearchResults({
  query,
  onPick,
}: {
  query: string;
  onPick: (exerciseId: string) => void;
}) {
  const theme = useTheme();
  const locale = useLocale();

  const exercisesQuery = useQuery<ExerciseRow[], AppError>({
    queryKey: ['exercises', query.trim(), locale],
    queryFn: () => searchExercises(query, locale),
  });

  return (
    <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
      {(exercisesQuery.data ?? []).map((exercise) => (
        <Pressable
          key={exercise.id}
          accessibilityRole="button"
          accessibilityLabel={exercise.name}
          onPress={() => onPick(exercise.id)}
          style={({ pressed }) => ({
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
            minHeight: 44,
            justifyContent: 'center',
          })}
        >
          <Text variant="body">{exercise.name}</Text>
          <Text variant="caption" tone="muted">
            {exercise.primary_muscle} · {exercise.equipment}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
