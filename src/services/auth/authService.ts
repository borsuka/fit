import type { Session, User } from '@supabase/supabase-js';

import { AppError } from '@/lib/errors';
import { supabase } from '@/services/supabase/client';
import { mapAuthError, mapUnknownError } from '@/services/supabase/errors';

/**
 * Authentication. The only place the app talks to Supabase Auth.
 *
 * Every method either resolves with a value or rejects with an AppError, so
 * callers have one error shape to handle and no Supabase types leak upward
 * into features.
 */

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export const signUp = async ({ email, password }: Credentials): Promise<User | null> => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw mapAuthError(error);

    // With email confirmation enabled, `session` is null and `user` is
    // pending. That is a success, not a failure - the UI shows "check your
    // inbox" rather than an error.
    return data.user;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const signIn = async ({ email, password }: Credentials): Promise<Session> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw mapAuthError(error);
    if (data.session === null) {
      throw new AppError({
        code: 'unauthorized',
        userMessage: 'Please sign in to continue.',
        retryable: false,
      });
    }
    return data.session;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const signOut = async (): Promise<void> => {
  try {
    // 'local' clears this device only. Signing out every device by default
    // would be a surprise - a user quitting on their phone does not expect
    // their tablet to log out too.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw mapAuthError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) throw mapAuthError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const getSession = async (): Promise<Session | null> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw mapAuthError(error);
    return data.session;
  } catch (e) {
    throw mapUnknownError(e);
  }
};

/**
 * Subscribes to sign-in, sign-out and token refresh.
 *
 * Returns an unsubscribe function. Callers must call it on unmount, or a
 * remounted provider stacks listeners and every auth event fires N times.
 */
export const onAuthStateChange = (handler: (session: Session | null) => void): (() => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    handler(session);
  });
  return () => data.subscription.unsubscribe();
};
