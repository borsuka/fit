import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthForm } from '@/features/auth/AuthForm';
import { useSignIn } from '@/features/auth/hooks';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { getRememberedEmail } from '@/services/auth/rememberedEmail';
import { Screen, Text, useTheme } from '@/ui';

export default function SignInScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const signIn = useSignIn();
  const toMessage = useErrorMessage();

  // A query rather than an effect: reading the keychain is asynchronous, and
  // this way the arriving value flows into the form as a prop instead of being
  // copied into state by an effect that then has to decide whether it is
  // allowed to overwrite what the user has typed.
  const remembered = useQuery<string | null>({
    queryKey: ['rememberedEmail'],
    queryFn: getRememberedEmail,
    staleTime: Infinity,
  });

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
        initialEmail={remembered.data ?? undefined}
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
