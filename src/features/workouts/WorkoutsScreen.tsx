import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useRequireUserId } from '@/features/auth/SessionProvider';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { queryKeys } from '@/lib/queryClient';
import {
  createTemplate,
  listTemplates,
  type TemplateSummary,
} from '@/services/workouts/programService';
import { getRecentSessions, startSession } from '@/services/workouts/workoutService';
import { Button, Card, Screen, Text, useTheme } from '@/ui';

/**
 * Three ways in, in the order most people want them.
 *
 * Your own plans first, because someone opening this screen at the gym has
 * already decided what they are training today. Programmes second, for the
 * person who has not. A blank session last: it is the most flexible option and
 * the least useful one to lead with.
 */
export function WorkoutsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery<TemplateSummary[], AppError>({
    queryKey: ['templates', userId],
    queryFn: () => listTemplates(userId),
  });

  const sessionsQuery = useQuery({
    queryKey: queryKeys.workoutSessions(userId),
    queryFn: () => getRecentSessions(userId),
  });

  const createBlank = useMutation<string, AppError, void>({
    mutationFn: () => createTemplate(userId, t('templates.newName')),
    onSuccess: (workoutId) => {
      void queryClient.invalidateQueries({ queryKey: ['templates', userId] });
      router.push({ pathname: '/template/[id]', params: { id: workoutId } });
    },
  });

  const startBlank = useMutation<string, AppError, void>({
    mutationFn: () => startSession(userId, t('workouts.defaultName')),
    onSuccess: (sessionId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions(userId) });
      router.push({ pathname: '/workout/[id]', params: { id: sessionId } });
    },
  });

  const templates = templatesQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];

  return (
    <Screen scroll>
      <Text variant="title">{t('workouts.title')}</Text>

      {createBlank.isError ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {toMessage(createBlank.error)}
        </Text>
      ) : null}

      <Text variant="label" tone="muted">
        {t('templates.mine')}
      </Text>

      {templates.length === 0 ? (
        <Card>
          <Text variant="body" tone="muted">
            {t('templates.noneYet')}
          </Text>
        </Card>
      ) : (
        templates.map((template) => (
          <Pressable
            key={template.id}
            accessibilityRole="button"
            accessibilityLabel={template.name}
            onPress={() => router.push({ pathname: '/template/[id]', params: { id: template.id } })}
          >
            <Card>
              <Text variant="heading">{template.name}</Text>
              <Text variant="caption" tone="muted">
                {t('templates.exerciseCount', { count: template.exerciseCount })}
              </Text>
            </Card>
          </Pressable>
        ))
      )}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            label={t('programs.browse')}
            variant="secondary"
            fullWidth
            onPress={() => router.push('/programs')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t('templates.build')}
            variant="secondary"
            fullWidth
            onPress={() => createBlank.mutate()}
            loading={createBlank.isPending}
          />
        </View>
      </View>

      <Button
        label={t('workouts.start')}
        variant="secondary"
        fullWidth
        onPress={() => startBlank.mutate()}
        loading={startBlank.isPending}
      />

      <Text variant="label" tone="muted">
        {t('workouts.history')}
      </Text>

      {sessions.length === 0 ? (
        <Card>
          <Text variant="body" tone="muted">
            {t('workouts.noHistory')}
          </Text>
        </Card>
      ) : (
        sessions.map((session) => (
          <Pressable
            key={session.id}
            accessibilityRole="button"
            accessibilityLabel={session.name}
            onPress={() => router.push({ pathname: '/workout/[id]', params: { id: session.id } })}
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
    </Screen>
  );
}
