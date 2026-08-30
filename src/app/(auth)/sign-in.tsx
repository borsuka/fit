import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthForm } from '@/features/auth/AuthForm';
import { useSignIn } from '@/features/auth/hooks';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { Screen, Text, useTheme } from '@/ui';

export default function SignInScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const signIn = useSignIn();
  const toMessage = useErrorMessage();

  // No navigation on success: SessionProvider picks up the new session and the
  // route guard moves the user. Navigating here as well would race the guard
  // and, on a slow device, briefly show the wrong screen.
  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xxl }}>
        <Text variant="display">{t('auth.signInTitle')}</Text>
      </View>

      <AuthForm
        mode="signIn"
        submitting={signIn.isPending}
        errorMessage={toMessage(signIn.error)}
        onSubmit={(values) => signIn.mutate(values)}
      />

      <Link href="/sign-up" accessibilityRole="link">
        <Text variant="label" tone="primary">
          {t('auth.noAccount')}
        </Text>
      </Link>
    </Screen>
  );
}
