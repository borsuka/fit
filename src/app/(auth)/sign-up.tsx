import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthForm } from '@/features/auth/AuthForm';
import { useSignUp } from '@/features/auth/hooks';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { Card, Screen, Text, useTheme } from '@/ui';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const signUp = useSignUp();
  const toMessage = useErrorMessage();

  // With email confirmation enabled the sign-up succeeds with no session, so
  // the guard will not move anyone. That is a success state, not a failure,
  // and it needs saying out loud - otherwise the screen just sits there.
  const awaitingConfirmation = signUp.isSuccess;

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xxl }}>
        <Text variant="display">{t('auth.signUpTitle')}</Text>
      </View>

      {awaitingConfirmation ? (
        <Card>
          <Text variant="body" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {t('auth.checkInbox')}
          </Text>
        </Card>
      ) : (
        <AuthForm
          mode="signUp"
          submitting={signUp.isPending}
          errorMessage={toMessage(signUp.error)}
          onSubmit={(values) => signUp.mutate(values)}
        />
      )}

      <Link href="/sign-in" accessibilityRole="link">
        <Text variant="label" tone="primary">
          {t('auth.haveAccount')}
        </Text>
      </Link>
    </Screen>
  );
}
