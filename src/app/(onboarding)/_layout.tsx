import { Redirect, Stack } from 'expo-router';

import { useAuthGate } from '@/features/auth/useAuthGate';

export default function OnboardingLayout() {
  const { isResolving, isSignedIn, isOnboarded } = useAuthGate();

  if (isResolving) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  // Finished already: onboarding has nothing to ask, and leaving it reachable
  // means a stray link can overwrite a goal the user already set.
  if (isOnboarded) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
