import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { SessionProvider, useSession } from '@/features/auth/SessionProvider';
import { useProfile } from '@/features/profile/hooks';
import { initI18n } from '@/lib/i18n';
import { createQueryClient } from '@/lib/queryClient';
import { ThemeProvider, useTheme } from '@/ui';

initI18n();

/**
 * Decides which route group the user belongs in.
 *
 * Three states, and the order matters:
 *   no session                        -> (auth)
 *   session but onboarding unfinished -> (onboarding)
 *   otherwise                         -> (tabs)
 *
 * Nothing is decided while the session or profile is still loading. Guessing
 * during that window is what makes a returning user watch a sign-in screen
 * flash before their own data appears.
 */
function RouteGuard() {
  const { userId, isLoading: sessionLoading } = useSession();
  const profileQuery = useProfile(userId);
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();

  // A failed profile fetch must not strand a signed-in user on a spinner. They
  // go to onboarding, where the error is visible and recoverable, rather than
  // staring at nothing.
  const profileSettled = userId === null || profileQuery.isSuccess || profileQuery.isError;
  const isResolving = sessionLoading || !profileSettled;

  const target = useMemo<'(auth)' | '(onboarding)' | '(tabs)' | null>(() => {
    if (isResolving) return null;
    if (userId === null) return '(auth)';
    if (profileQuery.data?.onboarded_at == null) return '(onboarding)';
    return '(tabs)';
  }, [isResolving, userId, profileQuery.data]);

  const current = segments[0];

  useEffect(() => {
    if (target === null || current === target) return;

    // replace, not push: a back gesture out of the app shell into a stale
    // sign-in screen is not a navigation anyone asked for.
    router.replace(
      target === '(auth)' ? '/sign-in' : target === '(onboarding)' ? '/onboarding' : '/',
    );
  }, [target, current, router]);

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
            <RouteGuard />
            <StatusBar style="auto" />
          </ThemeProvider>
        </NavigationThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
