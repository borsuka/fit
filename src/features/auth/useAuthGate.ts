import { useSession } from '@/features/auth/SessionProvider';
import { useProfile } from '@/features/profile/hooks';

export interface AuthGate {
  /** True until both the session and the profile have settled. Route guards
   *  must not decide anything while this is true. */
  readonly isResolving: boolean;
  readonly isSignedIn: boolean;
  readonly isOnboarded: boolean;
}

/**
 * The state every route guard needs.
 *
 * A failed profile fetch counts as settled rather than leaving a signed-in user
 * on a spinner forever: they land in onboarding, where the error is visible and
 * recoverable.
 */
export const useAuthGate = (): AuthGate => {
  const { userId, isLoading } = useSession();
  const profileQuery = useProfile(userId);

  const profileSettled = userId === null || profileQuery.isSuccess || profileQuery.isError;

  return {
    isResolving: isLoading || !profileSettled,
    isSignedIn: userId !== null,
    isOnboarded: profileQuery.data?.onboarded_at != null,
  };
};
