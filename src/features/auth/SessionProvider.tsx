import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getSession, onAuthStateChange } from '@/services/auth/authService';

interface SessionState {
  readonly session: Session | null;
  readonly userId: string | null;
  /** True until the stored session has been read from the keychain. */
  readonly isLoading: boolean;
}

const SessionContext = createContext<SessionState>({
  session: null,
  userId: null,
  isLoading: true,
});

/**
 * Holds the auth session for the app.
 *
 * `isLoading` exists so routing can wait rather than guess. Reading the
 * session out of the keychain is asynchronous, so for the first frames after
 * launch we do not yet know whether the user is signed in - and rendering the
 * sign-in screen during that gap makes a returning user see a login form flash
 * before their own data appears.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void getSession()
      .then((initial) => {
        if (!cancelled) setSession(initial);
      })
      .catch(() => {
        // A keychain read failure means signed out, which is recoverable by
        // signing in. Throwing here would crash the app before its first
        // screen - the worst possible place to surface a storage problem.
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    // Covers token refresh and sign-out from anywhere in the app, so no screen
    // has to push session changes back up by hand.
    const unsubscribe = onAuthStateChange((next) => {
      if (!cancelled) setSession(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<SessionState>(
    () => ({ session, userId: session?.user.id ?? null, isLoading }),
    [session, isLoading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = (): SessionState => useContext(SessionContext);

/**
 * For code that runs only behind the authenticated route group, where a null
 * user id would be a routing bug rather than a normal state. Throwing beats
 * threading `string | null` through every query key and service call.
 */
export const useRequireUserId = (): string => {
  const { userId } = useSession();
  if (userId === null) {
    throw new Error('useRequireUserId called outside an authenticated route');
  }
  return userId;
};
