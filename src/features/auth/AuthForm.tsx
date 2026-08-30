import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isPasswordAcceptable, MIN_PASSWORD_LENGTH } from '@/services/auth/authService';
import { Button, Text, TextField, useTheme } from '@/ui';

export interface AuthFormValues {
  readonly email: string;
  readonly password: string;
}

export interface AuthFormProps {
  mode: 'signIn' | 'signUp';
  submitting: boolean;
  /** Already translated. Rendered above the form. */
  errorMessage?: string | undefined;
  onSubmit: (values: AuthFormValues) => void;
}

/**
 * Deliberately loose. A pattern that insists on a TLD or rejects a plus sign
 * turns away real addresses, and the only authority on whether an email works
 * is whether the confirmation arrives. This catches typing the password into
 * the email box, and nothing more.
 */
const looksLikeEmail = (value: string): boolean => /^\S+@\S+\.\S+$/.test(value.trim());

export function AuthForm({ mode, submitting, errorMessage, onSubmit }: AuthFormProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Errors appear on submit, not while typing. Validating on every keystroke
  // means the field turns red halfway through an address someone is still
  // entering, which reads as failure rather than progress.
  const [touched, setTouched] = useState(false);

  const emailError = !touched
    ? undefined
    : email.trim().length === 0
      ? t('auth.emailRequired')
      : !looksLikeEmail(email)
        ? t('auth.emailInvalid')
        : undefined;

  const passwordError =
    !touched || isPasswordAcceptable(password)
      ? undefined
      : t('auth.passwordTooShort', { count: MIN_PASSWORD_LENGTH });

  const handleSubmit = (): void => {
    setTouched(true);
    if (!looksLikeEmail(email) || !isPasswordAcceptable(password)) return;
    onSubmit({ email, password });
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {errorMessage === undefined ? null : (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceMuted,
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.danger,
          }}
        >
          <Text variant="body" tone="danger">
            {errorMessage}
          </Text>
        </View>
      )}

      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={emailError}
        placeholder={t('auth.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        editable={!submitting}
      />

      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        helper={mode === 'signUp' ? t('auth.passwordHelper') : undefined}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        // Tells the OS keychain to offer a strong password on sign-up and an
        // existing one on sign-in. Getting this wrong makes password managers
        // silently useless.
        autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        editable={!submitting}
      />

      <Button
        label={mode === 'signUp' ? t('auth.signUp') : t('auth.signIn')}
        onPress={handleSubmit}
        loading={submitting}
        fullWidth
        size="lg"
      />
    </View>
  );
}
