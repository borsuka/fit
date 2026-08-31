import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { listPrograms, type ProgramRow } from '@/services/workouts/programService';
import { Card, Screen, ScreenHeader, Text, useTheme } from '@/ui';

/**
 * The programme catalogue.
 *
 * Every one of these is someone else's work and is credited to them. The app
 * reproduces the structure - which lifts, how many sets, how many reps - and
 * says who wrote it, because a programme presented as ours would be both a
 * lie and a discourtesy.
 */
export function ProgramsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const toMessage = useErrorMessage();

  const programsQuery = useQuery<ProgramRow[], AppError>({
    queryKey: ['programs'],
    // Reference data. It changes when we ship a migration, not while someone
    // is browsing it.
    staleTime: 60 * 60_000,
    queryFn: listPrograms,
  });

  return (
    <Screen scroll header={<ScreenHeader title={t('programs.title')} fallbackHref="/workouts" />}>
      <Text variant="body" tone="muted">
        {t('programs.body')}
      </Text>

      {programsQuery.isError ? (
        <Card>
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {toMessage(programsQuery.error)}
          </Text>
        </Card>
      ) : null}

      {(programsQuery.data ?? []).map((program) => (
        <Pressable
          key={program.id}
          accessibilityRole="button"
          accessibilityLabel={program.name}
          onPress={() => router.push({ pathname: '/programs/[id]', params: { id: program.id } })}
        >
          <Card>
            <Text variant="heading">{program.name}</Text>
            {program.author === null ? null : (
              <Text variant="caption" tone="muted">
                {t('programs.by', { author: program.author })}
              </Text>
            )}
            <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
              {program.description}
            </Text>
            <View
              style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}
            >
              <Text variant="caption" tone="primary">
                {t('programs.daysPerWeek', { count: program.days_per_week })}
              </Text>
              <Text variant="caption" tone="muted">
                · {t(`programs.focus_${program.focus}`)} ·{' '}
                {t(`programs.level_${program.experience}`)}
              </Text>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
