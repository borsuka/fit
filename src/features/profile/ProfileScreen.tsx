import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';

import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useSignOut } from '@/features/auth/hooks';
import { useActiveGoal, useProfile } from '@/features/profile/hooks';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { requestAccountDeletion, requestDataExport } from '@/services/profile/gdprService';
import { Button, Card, Screen, Text, useTheme } from '@/ui';

/**
 * Profile, and the two rights that are not optional.
 *
 * Export and deletion must both exist before launch: the App Store requires a
 * deletion path in-app, and GDPR requires both. Neither is a settings-screen
 * nicety - they are the difference between shipping and not.
 */
export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();

  const profileQuery = useProfile(userId);
  const goalQuery = useActiveGoal(userId);
  const signOut = useSignOut();

  const [exported, setExported] = useState(false);

  const exportData = useMutation<void, AppError, void>({
    mutationFn: () => requestDataExport(userId),
    onSuccess: () => setExported(true),
  });

  const deleteAccount = useMutation<void, AppError, void>({
    mutationFn: () => requestAccountDeletion(userId),
    onSuccess: () => signOut.mutate(),
  });

  const confirmDelete = (): void => {
    // Two steps, and the destructive option is not the default. Deletion
    // cascades through every meal, weight and photo, and there is no undo.
    Alert.alert(t('profile.deleteTitle'), t('profile.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.deleteConfirm'),
        style: 'destructive',
        onPress: () => deleteAccount.mutate(),
      },
    ]);
  };

  const profile = profileQuery.data;
  const goal = goalQuery.data;

  return (
    <Screen scroll>
      <Text variant="title">{t('profile.title')}</Text>

      <Card>
        <Text variant="label" tone="muted">
          {t('profile.account')}
        </Text>
        <Text variant="body">{profile?.display_name ?? t('profile.noName')}</Text>
        <Text variant="caption" tone="muted">
          {profile?.timezone} · {profile?.locale}
        </Text>
      </Card>

      <Card>
        <Text variant="label" tone="muted">
          {t('profile.currentGoal')}
        </Text>
        {goal === null || goal === undefined ? (
          <Text variant="body" tone="muted">
            {t('goal.previewUnavailable')}
          </Text>
        ) : (
          <>
            <Text variant="body">
              {t(`onboarding.goal_${goal.goal}`)} · {goal.calorie_target} kcal
            </Text>
            <Text variant="caption" tone="muted">
              {/* Which engine version produced these numbers. A formula change
                  must be auditable rather than invisible. */}
              {goal.computed_by}
            </Text>
          </>
        )}
        <View style={{ marginTop: theme.spacing.md }}>
          <Button label={t('goal.edit')} variant="secondary" onPress={() => router.push('/goal')} />
        </View>
      </Card>

      <Card>
        <Text variant="label" tone="muted">
          {t('profile.language')}
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          <Button
            label="English"
            variant={i18n.language === 'en' ? 'primary' : 'secondary'}
            onPress={() => void i18n.changeLanguage('en')}
          />
          <Button
            label="Български"
            variant={i18n.language === 'bg' ? 'primary' : 'secondary'}
            onPress={() => void i18n.changeLanguage('bg')}
          />
        </View>
      </Card>

      <Card>
        <Text variant="label" tone="muted">
          {t('profile.yourData')}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
          {t('profile.dataBody')}
        </Text>

        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <Button
            label={t('profile.exportData')}
            variant="secondary"
            fullWidth
            loading={exportData.isPending}
            onPress={() => exportData.mutate()}
          />
          {exported ? (
            <Text variant="caption" tone="success" accessibilityLiveRegion="polite">
              {t('profile.exportQueued')}
            </Text>
          ) : null}

          <Button
            label={t('profile.deleteAccount')}
            variant="danger"
            fullWidth
            loading={deleteAccount.isPending}
            onPress={confirmDelete}
          />
        </View>

        {exportData.isError || deleteAccount.isError ? (
          <Text variant="caption" tone="danger" accessibilityRole="alert">
            {toMessage(exportData.error ?? deleteAccount.error)}
          </Text>
        ) : null}
      </Card>

      <Button
        label={t('profile.signOut')}
        variant="secondary"
        fullWidth
        loading={signOut.isPending}
        onPress={() => signOut.mutate()}
      />

      <Text variant="caption" tone="muted">
        {t('nutrition.estimateNotice')}
      </Text>
    </Screen>
  );
}
