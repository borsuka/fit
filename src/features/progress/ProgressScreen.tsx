import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toLocalDate } from '@/domain/dates/localDate';
import {
  chartRange,
  MIN_DAYS_FOR_RATE,
  normalise,
  smoothed,
  summariseTrend,
  type WeightEntry,
} from '@/domain/progress/weightTrend';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useProfile } from '@/features/profile/hooks';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { queryKeys } from '@/lib/queryClient';
import { getWeightLogs, logWeight } from '@/services/progress/progressService';
import { Button, Card, Screen, Text, TextField, useTheme } from '@/ui';

export function ProgressScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const profileQuery = useProfile(userId);
  const today = toLocalDate(profileQuery.data?.timezone ?? 'UTC');

  const logsQuery = useQuery<WeightEntry[], AppError>({
    queryKey: queryKeys.weightLogs(userId),
    queryFn: () => getWeightLogs(userId),
  });

  const [weight, setWeight] = useState('');

  const save = useMutation<void, AppError, number>({
    mutationFn: (kg) => logWeight(userId, today, kg),
    onSuccess: () => {
      setWeight('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.weightLogs(userId) });
    },
  });

  const entries = logsQuery.data ?? [];
  const summary = summariseTrend(entries);
  const range = chartRange(entries);
  const smooth = smoothed([...entries].sort((a, b) => a.loggedOn.localeCompare(b.loggedOn)));

  const parsed = Number(weight.replace(',', '.'));
  const canSave = Number.isFinite(parsed) && parsed >= 20 && parsed <= 400;

  return (
    <Screen scroll>
      <Text variant="title">{t('progress.title')}</Text>

      <Card>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={t('progress.todayWeight')}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              suffix="kg"
            />
          </View>
          <Button
            label={t('common.save')}
            disabled={!canSave}
            loading={save.isPending}
            onPress={() => save.mutate(parsed)}
          />
        </View>
        {save.isError ? (
          <Text variant="caption" tone="danger" accessibilityRole="alert">
            {toMessage(save.error)}
          </Text>
        ) : null}
      </Card>

      {summary === null ? (
        <Card>
          <Text variant="body" tone="muted">
            {t('progress.noData')}
          </Text>
        </Card>
      ) : (
        <>
          <Card>
            <Text variant="label" tone="muted">
              {t('progress.current')}
            </Text>
            <Text variant="metric">{summary.latestKg.toFixed(1)} kg</Text>

            {summary.isReliable ? (
              <Text
                variant="body"
                tone={summary.perWeekKg < 0 ? 'success' : 'default'}
                style={{ marginTop: theme.spacing.sm }}
              >
                {t('progress.rate', {
                  rate: summary.perWeekKg.toFixed(2),
                  days: summary.dayCount,
                })}
              </Text>
            ) : (
              // Saying "not enough data yet" beats printing a rate derived from
              // three days, which a user would reasonably act on.
              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                {t('progress.needMoreData', { days: MIN_DAYS_FOR_RATE })}
              </Text>
            )}
          </Card>

          {range === null ? null : (
            <Card>
              <Text variant="label" tone="muted">
                {t('progress.trend')}
              </Text>

              {/* The axis is LABELLED. A weight chart with a zero baseline
                  hides a real 3 kg change; a tightly truncated one turns water
                  noise into a cliff. We truncate - and say so - rather than
                  letting the reader infer a scale that is not there. */}
              <View
                accessible
                accessibilityLabel={t('progress.chartLabel', {
                  from: entries[0]?.weightKg.toFixed(1) ?? '',
                  to: summary.latestKg.toFixed(1),
                  days: summary.dayCount,
                })}
                style={{
                  height: 120,
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  gap: 2,
                  marginTop: theme.spacing.md,
                }}
              >
                {smooth.map((point) => (
                  <View
                    key={point.loggedOn}
                    style={{
                      flex: 1,
                      height: `${Math.max(normalise(point.weightKg, range) * 100, 2)}%`,
                      backgroundColor: theme.colors.primary,
                      borderRadius: 2,
                      minWidth: 2,
                    }}
                  />
                ))}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: theme.spacing.xs,
                }}
              >
                <Text variant="caption" tone="muted">
                  {range.min.toFixed(1)} kg
                </Text>
                <Text variant="caption" tone="muted">
                  {t('progress.smoothed')}
                </Text>
                <Text variant="caption" tone="muted">
                  {range.max.toFixed(1)} kg
                </Text>
              </View>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
