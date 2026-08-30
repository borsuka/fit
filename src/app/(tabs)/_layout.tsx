import { Redirect, Tabs } from 'expo-router';

import { useAuthGate } from '@/features/auth/useAuthGate';
import { useTheme } from '@/ui';

/**
 * Guarded during RENDER, not in an effect.
 *
 * An effect runs after the render that scheduled it, so a guard written that
 * way lets the protected screen mount once before navigating away - and
 * useRequireUserId throws on that first pass. Returning <Redirect/> means the
 * screen never renders at all.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { isResolving, isSignedIn, isOnboarded } = useAuthGate();

  if (isResolving) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!isOnboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="mealplan" options={{ title: 'Plan' }} />
      <Tabs.Screen name="workouts" options={{ title: 'Workouts' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
