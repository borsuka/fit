import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toLocalDate } from '@/domain/dates/localDate';
import type { PlanResult } from '@/domain/mealplan';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useActiveGoal, useProfile } from '@/features/profile/hooks';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import {
  buildPlan,
  getDietSettings,
  savePlan,
  type DietSettings,
} from '@/services/mealplan/mealPlanService';
import { toTargets } from '@/services/profile/profileService';
import { Button, Card, Screen, Text, useTheme } from '@/ui';

const GENERATOR_VERSION = 'mealplan-solver-v1';

export function MealPlanScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();

  const profileQuery = useProfile(userId);
  const goalQuery = useActiveGoal(userId);
  const settingsQuery = useQuery<DietSettings, AppError>({
    queryKey: ['dietSettings', userId],
    queryFn: () => getDietSettings(userId),
  });

  const [plan, setPlan] = useState<PlanResult | null>(null);

  const goal = goalQuery.data;
  const settings = settingsQuery.data;
  const today = toLocalDate(profileQuery.data?.timezone ?? 'UTC');

  const generate = useMutation<PlanResult, AppError, void>({
    mutationFn: () => {
      if (goal === null || goal === undefined || settings === undefined) {
        throw new Error('not ready');
      }
      const targets = toTargets(goal);
      return buildPlan({
        userId,
        startDate: today,
        settings,
        targets: {
          calories: targets.calories,
          proteinG: targets.proteinG,
          carbsG: targets.carbsG,
          fatG: targets.fatG,
        },
      });
    },
    onSuccess: setPlan,
  });

  const save = useMutation<string, AppError, PlanResult>({
    mutationFn: (result) => {
      const targets = toTargets(goal!);
      return savePlan(
        userId,
        t('mealplan.planName'),
        today,
        {
          calories: targets.calories,
          proteinG: targets.proteinG,
          carbsG: targets.carbsG,
          fatG: targets.fatG,
        },
        result,
        GENERATOR_VERSION,
      );
    },
  });

  const targets = goal === null || goal === undefined ? null : toTargets(goal);
  const notReady = targets === null || settings === undefined;

  return (
    <Screen
      scroll
      footer={
        <>
          {generate.isError ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {toMessage(generate.error)}
            </Text>
          ) : null}
          {save.isSuccess ? (
            <Text variant="caption" tone="success" accessibilityLiveRegion="polite">
              {t('mealplan.saved')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button
                label={plan === null ? t('mealplan.generate') : t('mealplan.regenerate')}
                onPress={() => generate.mutate()}
                loading={generate.isPending}
                disabled={notReady}
                fullWidth
                size="lg"
              />
            </View>
            {plan === null ? null : (
              <Button
                label={t('common.save')}
                variant="secondary"
                onPress={() => save.mutate(plan)}
                loading={save.isPending}
              />
            )}
          </View>
        </>
      }
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{t('mealplan.title')}</Text>
        <Text variant="body" tone="muted">
          {t('mealplan.body')}
        </Text>
      </View>

      {plan === null ? (
        <Card>
          <Text variant="body" tone="muted">
            {notReady ? t('common.loading') : t('mealplan.empty')}
          </Text>
        </Card>
      ) : (
        <>
          {plan.meals.map((meal) => (
            <Card key={`${meal.slot}-${meal.recipeId}`}>
              <Text variant="caption" tone="muted">
                {meal.slot}
              </Text>
              <Text variant="heading">{meal.name}</Text>
              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
                {meal.servings}x · {Math.round(meal.kcal)} kcal · {Math.round(meal.proteinG)}P /{' '}
                {Math.round(meal.carbsG)}C / {Math.round(meal.fatG)}F
              </Text>
            </Card>
          ))}

          <Card>
            <Text variant="label" tone="muted">
              {t('mealplan.dayTotal')}
            </Text>
            <Text variant="metric">{Math.round(plan.totals.calories)}</Text>
            {targets === null ? null : (
              <Text variant="caption" tone="muted">
                {/* The gap is shown rather than hidden. A plan that misses by
                    200 kcal is still useful, and pretending it landed exactly
                    is the kind of small dishonesty this app cannot afford. */}
                {t('mealplan.versusTarget', {
                  diff: Math.round(plan.totals.calories - targets.calories),
                  target: targets.calories,
                })}
              </Text>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
