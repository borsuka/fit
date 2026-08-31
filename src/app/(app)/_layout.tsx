import { Redirect, Stack } from 'expo-router';

import { useAuthGate } from '@/features/auth/useAuthGate';

/**
 * Everything signed-in that is not a tab.
 *
 * These screens used to sit at the route root, which meant nothing guarded
 * them: only (tabs) checked the session, so /scan or /food/[id] opened for a
 * signed-out visitor and useRequireUserId threw on the first render. A route
 * group costs nothing in the URL - /search is still /search - and puts one
 * guard in front of all of them, so adding a screen here cannot forget it.
 *
 * Guarded during RENDER for the same reason as the tabs layout: an effect runs
 * after the render that scheduled it, and the protected screen would mount once
 * before navigating away.
 */
export default function AppLayout() {
  const { isResolving, isSignedIn, isOnboarded } = useAuthGate();

  if (isResolving) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!isOnboarded) return <Redirect href="/onboarding" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
