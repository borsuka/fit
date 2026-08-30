import { Redirect, Stack } from 'expo-router';

import { useAuthGate } from '@/features/auth/useAuthGate';

export default function AuthLayout() {
  const { isResolving, isSignedIn, isOnboarded } = useAuthGate();

  if (isResolving) return null;
  // Signed in already: a sign-in screen reachable from a live session is a way
  // to end up with two accounts on one device.
  if (isSignedIn) return <Redirect href={isOnboarded ? '/' : '/onboarding'} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
