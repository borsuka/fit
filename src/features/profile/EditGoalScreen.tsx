import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { WeightEntry } from '@/domain/progress/weightTrend';
import {
  calculateNutritionTargets,
  type ActivityLevel,
  type GoalInput,
  type GoalType,
  type NutritionTargets,
} from '@/domain/nutrition';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import {
  ACTIVITY_LEVELS,
  GOALS_WITH_TARGET,
  GOAL_TYPES,
  parseDecimal,
} from '@/features/onboarding/model';
import { useActiveGoal, useProfile } from '@/features/profile/hooks';
import { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { queryKeys } from '@/lib/queryClient';
import { getWeightLogs } from '@/services/progress/progressService';
import { saveGoal, toBodyProfile, type GoalRow } from '@/services/profile/profileService';
import { Button, Card, OptionRow, Screen, ScreenHeader, Text, TextField, useTheme } from '@/ui';

/**
 * Change what you are training for.
 *
 * The numbers are recomputed by the same engine that produced them at
 * onboarding, from the same inputs, and only then written. Editing a calorie
 * target directly is deliberately not offered: the whole point of the engine is
 * that the target is derived, and a hand-typed number would have no formula
 * behind it and no way to stay right when the user's weight changes.
 */
export function EditGoalScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const profileQuery = useProfile(userId);
  const goalQuery = useActiveGoal(userId);
  const weightQuery = useQuery<WeightEntry[], AppError>({
    queryKey: ['weightLogs', userId],
    queryFn: () => getWeightLogs(userId),
  });

  const current = goalQuery.data;
  const profile = profileQuery.data;

  const [goal, setGoal] = useState<GoalType | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [targetWeight, setTargetWeight] = useState<string | null>(null);

  // The stored goal is the starting point; local state only exists once the
  // user has touched a control, so a slow query cannot overwrite their choice.
  const selectedGoal = goal ?? current?.goal ?? null;
  const selectedActivity = activity ?? current?.activity ?? null;
  const targetWeightText =
    targetWeight ??
    (current?.target_weight_kg === null || current?.target_weight_kg === undefined
      ? ''
      : String(current.target_weight_kg));

  /** The last logged weight, or the weight the current goal started from.
   *  Someone who has never logged a weight still has one on file from
   *  onboarding, and refusing to let them change goal because of that would be
   *  a dead end. */
  const currentWeightKg =
    weightQuery.data?.at(-1)?.weightKg ??
    (current === null || current === undefined ? null : Number(current.start_weight_kg));

  const save = useMutation<GoalRow, AppError, void>({
    mutationFn: () => {
      if (profile === null || profile === undefined) {
        throw new AppError({ code: 'not_found', userMessage: t('errors.not_found') });
      }
      if (selectedGoal === null || selectedActivity === null || currentWeightKg === null) {
        throw new AppError({
          code: 'validation_failed',
          userMessage: t('errors.validation_failed'),
        });
      }

      const body = toBodyProfile(profile, currentWeightKg);
      const parsedTarget = parseDecimal(targetWeightText);
      const input: GoalInput = {
        goal: selectedGoal,
        activity: selectedActivity,
        ...(GOALS_WITH_TARGET.has(selectedGoal) && parsedTarget !== null
          ? { targetWeightKg: parsedTarget }
          : {}),
      };

      // Computed before anything is written. If the engine refuses - a target
      // below a healthy BMI, a rate the safety policy will not allow - the
      // stored goal is left exactly as it was.
      const computed = calculateNutritionTargets(body, input);
      if (!computed.ok) {
        const first = computed.errors[0];
        throw new AppError({
          code: 'validation_failed',
          userMessage: first?.detail ?? t('errors.validation_failed'),
          context: { field: first?.field ?? 'unknown', reason: first?.code ?? 'unknown' },
        });
      }

      return saveGoal(computed.value, input, currentWeightKg);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activeGoal(userId) });
      router.back();
    },
  });

  const header = <ScreenHeader title={t('goal.title')} fallbackHref="/" />;

  if (profile === null || profile === undefined) {
    return (
      <Screen header={header}>
        <Text variant="body" tone="muted">
          {profileQuery.isError ? toMessage(profileQuery.error) : t('common.loading')}
        </Text>
      </Screen>
    );
  }

  const preview: NutritionTargets | null = (() => {
    if (selectedGoal === null || selectedActivity === null || currentWeightKg === null) return null;
    const parsedTarget = parseDecimal(targetWeightText);
    const computed = calculateNutritionTargets(toBodyProfile(profile, currentWeightKg), {
      goal: selectedGoal,
      activity: selectedActivity,
      ...(GOALS_WITH_TARGET.has(selectedGoal) && parsedTarget !== null
        ? { targetWeightKg: parsedTarget }
        : {}),
    });
    return computed.ok ? computed.value : null;
  })();

  return (
    <Screen
      scroll
      header={header}
      footer={
        <>
          {save.isError ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {toMessage(save.error)}
            </Text>
          ) : null}
          <Button
            label={t('goal.save')}
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={selectedGoal === null || selectedActivity === null}
            fullWidth
            size="lg"
          />
        </>
      }
    >
      <Text variant="body" tone="muted">
        {t('goal.body')}
      </Text>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label">{t('onboarding.goal')}</Text>
        {GOAL_TYPES.map((option: GoalType) => (
          <OptionRow
            key={option}
            label={t(`onboarding.goal_${option}`)}
            selected={selectedGoal === option}
            onPress={() => setGoal(option)}
          />
        ))}
      </View>

      {selectedGoal !== null && GOALS_WITH_TARGET.has(selectedGoal) ? (
        <TextField
          label={t('onboarding.targetWeight')}
          helper={t('onboarding.targetWeightOptional')}
          value={targetWeightText}
          onChangeText={setTargetWeight}
          keyboardType="decimal-pad"
          suffix="kg"
        />
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label">{t('onboarding.activity')}</Text>
        {ACTIVITY_LEVELS.map((option: ActivityLevel) => (
          <OptionRow
            key={option}
            label={t(`onboarding.activity_${option}`)}
            selected={selectedActivity === option}
            onPress={() => setActivity(option)}
          />
        ))}
      </View>

      <Card>
        <Text variant="label" tone="muted">
          {t('goal.newTargets')}
        </Text>
        {preview === null ? (
          <Text variant="body" tone="muted">
            {t('goal.previewUnavailable')}
          </Text>
        ) : (
          <>
            <Text variant="metric">{preview.calories}</Text>
            <Text variant="caption" tone="muted">
              {preview.proteinG} P / {preview.carbsG} C / {preview.fatG} F
            </Text>
          </>
        )}
      </Card>
    </Screen>
  );
}
