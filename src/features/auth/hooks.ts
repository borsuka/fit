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

/**
 * Auth mutations.
 *
 * Nothing here catches errors: react-query surfaces them as `error`, already
 * an AppError from the service layer, and the screen renders
 * `errors.<code>` through i18n. A try/catch in the component would just be a
 * second, worse error path.
 */

export const useSignIn = (): UseMutationResult<Session, AppError, Credentials> =>
  useMutation({ mutationFn: signIn });

export const useSignUp = (): UseMutationResult<User | null, AppError, Credentials> =>
  useMutation({ mutationFn: signUp });

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
      queryClient.clear();
    },
  });
};
