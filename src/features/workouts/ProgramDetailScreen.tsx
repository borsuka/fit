import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useRequireUserId } from '@/features/auth/SessionProvider';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import {
  adoptProgramDay,
  getProgram,
  type ProgramDetail,
} from '@/services/workouts/programService';
import { Button, Card, Screen, ScreenHeader, Text, useTheme } from '@/ui';

/**
 * One programme, day by day, with the option to take a day into your own plans.
 *
 * Adopting copies rather than subscribes. That is what makes the next screen -
 * swapping an exercise you cannot or will not do - an edit to your plan instead
 * of a fork of someone else's programme.
 */
export function ProgramDetailScreen({ programId }: { programId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const programQuery = useQuery<ProgramDetail | null, AppError>({
    queryKey: ['program', programId],
    staleTime: 60 * 60_000,
    queryFn: () => getProgram(programId),
  });

  const adopt = useMutation<string, AppError, number>({
    mutationFn: (dayIndex) => adoptProgramDay(programId, dayIndex),
    onSuccess: (workoutId) => {
      void queryClient.invalidateQueries({ queryKey: ['templates', userId] });
      router.push({ pathname: '/template/[id]', params: { id: workoutId } });
    },
  });

  const header = <ScreenHeader fallbackHref="/workouts" />;
  const detail = programQuery.data;

  if (detail === null || detail === undefined) {
    return (
      <Screen header={header}>
        <Text variant="body" tone="muted">
          {programQuery.isError ? toMessage(programQuery.error) : t('common.loading')}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen scroll header={header}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{detail.program.name}</Text>
        {detail.program.author === null ? null : (
          <Text variant="caption" tone="muted">
            {t('programs.by', { author: detail.program.author })}
          </Text>
        )}
        <Text variant="body" tone="muted">
          {detail.program.description}
        </Text>
      </View>

      {adopt.isError ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {toMessage(adopt.error)}
        </Text>
      ) : null}

      <Card>
        <Text variant="caption" tone="muted">
          {/* Said once, here, rather than implied by an empty weight column on
              every row. These programmes set load from the lifter's own
              performance; a seeded kilo figure would be invented. */}
          {t('programs.loadingNote')}
        </Text>
      </Card>

      {detail.days.map((day) => (
        <Card key={day.id}>
          <Text variant="heading">{day.name}</Text>

          <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
            {day.exercises.map((exercise) => (
              <View
                key={exercise.id}
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}
              >
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                  {exercise.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {exercise.targetSets} × {exercise.targetReps}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: theme.spacing.md }}>
            <Button
              label={t('programs.addDay')}
              variant="secondary"
              fullWidth
              onPress={() => adopt.mutate(day.dayIndex)}
              loading={adopt.isPending && adopt.variables === day.dayIndex}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
