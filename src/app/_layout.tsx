import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { SessionProvider } from '@/features/auth/SessionProvider';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { initI18n } from '@/lib/i18n';
import { createQueryClient } from '@/lib/queryClient';
import { ThemeProvider, useTheme } from '@/ui';

initI18n();

/**
 * Holds the navigator back until the session and profile have settled.
 *
 * The group layouts under (auth), (onboarding) and (tabs) each decide whether
 * they may render - during render, via <Redirect/>. This only prevents the
 * flash: without it a returning user watches a sign-in screen appear before
 * their own data does.
 */
function Root() {
  const theme = useTheme();
  const { isResolving } = useAuthGate();

  if (isResolving) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Created once. A client rebuilt on every render throws away the cache, so
  // each render becomes a full refetch.
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        {/* Two theme providers on purpose: react-navigation styles the chrome
            it owns, ours styles everything we draw. Both follow the OS. */}
        <NavigationThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
          <ThemeProvider>
            <Root />
            <StatusBar style="auto" />
          </ThemeProvider>
        </NavigationThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
