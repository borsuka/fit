import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MacroProgress } from '@/components/MacroProgress';
import { toLocalDate } from '@/domain/dates/localDate';
import { remainingAgainstTargets, sumNutrition } from '@/domain/nutrition';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useActiveGoal, useProfile } from '@/features/profile/hooks';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { toTargets } from '@/services/profile/profileService';
import { MEAL_TYPES } from '@/services/diary/diaryService';
import { Button, Card, Text, useTheme } from '@/ui';

import { useDiaryDay } from './hooks';

export function HomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();

  const profileQuery = useProfile(userId);
  const goalQuery = useActiveGoal(userId);

  // The diary day is the USER's date, from their stored timezone. UTC would
  // roll the day over at the wrong moment for everyone outside Greenwich.
  const timezone = profileQuery.data?.timezone ?? 'UTC';
  const today = toLocalDate(timezone);
  const dayQuery = useDiaryDay(userId, today);

  const targets =
    goalQuery.data === null || goalQuery.data === undefined ? null : toTargets(goalQuery.data);

  const consumed = sumNutrition((dayQuery.data?.items ?? []).map((i) => i.nutrition));
  const remaining = targets === null ? null : remainingAgainstTargets(targets, consumed);

  const isRefreshing = dayQuery.isFetching && !dayQuery.isLoading;
  const error = dayQuery.error ?? goalQuery.error ?? profileQuery.error;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void dayQuery.refetch()} />
        }
      >
        <Text variant="display">{t('nutrition.calories')}</Text>

        {error != null ? (
          <Card>
            <Text variant="body" tone="danger" accessibilityRole="alert">
              {toMessage(error)}
            </Text>
            <View style={{ marginTop: theme.spacing.md }}>
              <Button
                label={t('common.retry')}
                variant="secondary"
                onPress={() => void dayQuery.refetch()}
              />
            </View>
          </Card>
        ) : null}

        {targets === null ? (
          // No goal yet is a real state, not an error - the routing guard sends
          // a user here only after onboarding, but a failed goal fetch can
          // still land them here with nothing to show.
          <Card>
            <Text variant="body" tone="muted">
              {t('common.loading')}
            </Text>
          </Card>
        ) : (
          <>
            <Card>
              <Text variant="label" tone="muted">
                {t('nutrition.remaining')}
              </Text>
              <Text
                variant="metric"
                tone={remaining?.isOverCalories === true ? 'warning' : 'default'}
              >
                {Math.round(remaining?.kcal ?? 0).toLocaleString()}
              </Text>
              <Text variant="caption" tone="muted">
                {Math.round(consumed.kcal).toLocaleString()} {t('nutrition.eaten')} ·{' '}
                {targets.calories.toLocaleString()} {t('nutrition.calories').toLowerCase()}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  gap: theme.spacing.md,
                  marginTop: theme.spacing.lg,
                }}
              >
                <MacroProgress
                  label={t('nutrition.protein')}
                  consumed={consumed.proteinG}
                  target={targets.proteinG}
                  unit="g"
                  color={theme.colors.protein}
                />
                <MacroProgress
                  label={t('nutrition.carbs')}
                  consumed={consumed.carbsG}
                  target={targets.carbsG}
                  unit="g"
                  color={theme.colors.carbs}
                />
                <MacroProgress
                  label={t('nutrition.fat')}
                  consumed={consumed.fatG}
                  target={targets.fatG}
                  unit="g"
                  color={theme.colors.fat}
                />
              </View>
            </Card>

            {MEAL_TYPES.map((mealType) => {
              const items = (dayQuery.data?.items ?? []).filter((i) => i.mealType === mealType);
              const mealTotal = sumNutrition(items.map((i) => i.nutrition));

              return (
                <Card key={mealType}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text variant="heading">{mealType}</Text>
                    <Text variant="label" tone="muted">
                      {Math.round(mealTotal.kcal)} kcal
                    </Text>
                  </View>

                  {items.length === 0 ? (
                    // An empty section says so rather than rendering nothing,
                    // which is indistinguishable from a failed load.
                    <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                      —
                    </Text>
                  ) : (
                    <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
                      {items.map((item) => (
                        <View
                          key={item.id}
                          style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                        >
                          <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text variant="body" tone="muted">
                            {Math.round(item.nutrition.kcal)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
