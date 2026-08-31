import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';

import type { AppError } from '@/lib/errors';
import {
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  type Credentials,
} from '@/services/auth/authService';
import { rememberEmail } from '@/services/auth/rememberedEmail';

/**
 * Auth mutations.
 *
 * Nothing here catches errors: react-query surfaces them as `error`, already
 * an AppError from the service layer, and the screen renders
 * `errors.<code>` through i18n. A try/catch in the component would just be a
 * second, worse error path.
 */

/**
 * The address is remembered AFTER the credentials are accepted, never before.
 * Storing what was typed on every attempt would leave a typo in the field for
 * the next launch, which reads as "we got your account wrong".
 */
export const useSignIn = (): UseMutationResult<Session, AppError, Credentials> =>
  useMutation({
    mutationFn: signIn,
    onSuccess: (_session, { email }) => {
      void rememberEmail(email);
    },
  });

export const useSignUp = (): UseMutationResult<User | null, AppError, Credentials> =>
  useMutation({
    mutationFn: signUp,
    onSuccess: (_user, { email }) => {
      void rememberEmail(email);
    },
  });

export const usePasswordReset = (): UseMutationResult<void, AppError, string> =>
  useMutation({ mutationFn: requestPasswordReset });

export const useSignOut = (): UseMutationResult<void, AppError, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      // Every cached query is scoped to a user id, but clearing outright is
      // the honest move: a signed-out device must hold no diary, no weight
      // history and no photos in memory, whatever the next account is.
      //
      // The remembered address deliberately survives. Signing out is not
      // disowning the device, and making someone retype their address every
      // time is the friction this exists to remove.
      queryClient.clear();
    },
  });
};
