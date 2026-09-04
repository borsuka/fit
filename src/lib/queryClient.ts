import { QueryClient } from '@tanstack/react-query';

import { isAppError } from './errors';

/**
 * Server-state configuration.
 *
 * Defaults are chosen for a phone in a gym or a restaurant basement, not for a
 * desktop on office wifi.
 */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Diary data changes only when this user changes it, and every mutation
        // invalidates explicitly. A minute of staleness costs nothing and saves
        // a refetch every time someone switches tabs.
        staleTime: 60_000,
        gcTime: 24 * 60 * 60 * 1000,

        // Retry only what can succeed on a second attempt. Retrying a 403 or a
        // validation failure spends battery to fail identically.
        retry: (failureCount, error) => {
          if (isAppError(error) && !error.retryable) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),

        // On by default in react-query, and wrong here: React Native fires
        // focus events on every app foreground, so this refetches the whole
        // screen each time someone checks a notification.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Never retry a write blindly. A retried "add food" that actually
        // succeeded the first time logs the meal twice, and the user sees
        // their calories double for no reason they can explain.
        retry: false,
      },
    },
  });

/**
 * Query keys in one place.
 *
 * Scattered key arrays are how a mutation ends up invalidating a key that no
 * query uses, leaving stale numbers on screen with nothing in the code to
 * point at. Every key is user-scoped so a sign-out cannot leak the previous
 * account's cached diary into the next one.
 */
export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  activeGoal: (userId: string) => ['goal', userId, 'active'] as const,

  // Locale is part of the key wherever a food NAME is in the result. Without
  // it, switching language serves the English names react-query already cached
  // and nothing looks broken until the user reads them.
  //
  // No default: an omitted locale would silently build a DIFFERENT key from the
  // one the query registered under, which for setQueryData means an optimistic
  // update that writes to nothing. The `*Prefix` forms are the deliberate way
  // to address every locale at once, which is what invalidation wants.
  diaryDay: (userId: string, localDate: string, locale: string) =>
    ['diary', userId, localDate, locale] as const,
  diaryDayPrefix: (userId: string, localDate: string) => ['diary', userId, localDate] as const,
  recentFoods: (userId: string, locale: string) => ['foods', userId, 'recent', locale] as const,
  recentFoodsPrefix: (userId: string) => ['foods', userId, 'recent'] as const,
  favoriteFoods: (userId: string) => ['foods', userId, 'favorites'] as const,
  foodSearch: (query: string, locale: string) => ['foods', 'search', query, locale] as const,
  food: (foodId: string, locale: string) => ['foods', 'detail', foodId, locale] as const,

  weightLogs: (userId: string) => ['weight', userId] as const,
  workoutSessions: (userId: string) => ['workouts', userId, 'sessions'] as const,
  subscription: (userId: string) => ['subscription', userId] as const,
} as const;
