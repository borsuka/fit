import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  calculateNutritionTargets,
  type BodyProfile,
  type GoalInput,
  type NutritionTargets,
} from '@/domain/nutrition';
import { AppError } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';
import {
  getActiveGoal,
  getProfile,
  markOnboarded,
  saveGoal,
  upsertProfile,
  type GoalRow,
  type ProfileDraft,
  type ProfileRow,
} from '@/services/profile/profileService';

export const useProfile = (userId: string | null): UseQueryResult<ProfileRow | null, AppError> =>
  useQuery({
    queryKey: queryKeys.profile(userId ?? 'anonymous'),
    queryFn: () => getProfile(userId as string),
    enabled: userId !== null,
  });

export const useActiveGoal = (userId: string | null): UseQueryResult<GoalRow | null, AppError> =>
  useQuery({
    queryKey: queryKeys.activeGoal(userId ?? 'anonymous'),
    queryFn: () => getActiveGoal(userId as string),
    enabled: userId !== null,
  });

export interface CompleteOnboardingInput {
  readonly userId: string;
  readonly draft: ProfileDraft;
  readonly body: BodyProfile;
  readonly goal: GoalInput;
}

export interface OnboardingResult {
  readonly profile: ProfileRow;
  readonly goal: GoalRow;
  readonly targets: NutritionTargets;
}

/**
 * Finishes onboarding in one mutation.
 *
 * Targets are computed BEFORE anything is written. If the engine rejects the
 * input - a target below a healthy BMI, an age under the policy floor - this
 * fails without having created a profile, rather than leaving a half-onboarded
 * account that the routing guard would bounce straight back into this screen.
 */
export const useCompleteOnboarding = () => {
  const queryClient = useQueryClient();

  return useMutation<OnboardingResult, AppError, CompleteOnboardingInput>({
    mutationFn: async ({ userId, draft, body, goal }) => {
      const computed = calculateNutritionTargets(body, goal);
      if (!computed.ok) {
        const first = computed.errors[0];
        throw new AppError({
          code: 'validation_failed',
          userMessage: first?.detail ?? 'Please check your details.',
          context: { field: first?.field ?? 'unknown', reason: first?.code ?? 'unknown' },
        });
      }

      const profile = await upsertProfile(userId, draft);
      const savedGoal = await saveGoal(computed.value, goal, body.weightKg);
      await markOnboarded(userId);

      return { profile, goal: savedGoal, targets: computed.value };
    },
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activeGoal(userId) });
    },
  });
};
