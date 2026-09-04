import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { LocalDate } from '@/domain/dates/localDate';
import type { AppError } from '@/lib/errors';
import { useLocale } from '@/lib/i18n/useLocale';
import { queryKeys } from '@/lib/queryClient';
import {
  addFoodToMeal,
  deleteMealItem,
  getDiaryDay,
  setWater,
  type AddFoodInput,
  type DiaryDay,
} from '@/services/diary/diaryService';

export const useDiaryDay = (
  userId: string | null,
  localDate: LocalDate,
): UseQueryResult<DiaryDay, AppError> => {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.diaryDay(userId ?? 'anonymous', localDate, locale),
    queryFn: () => getDiaryDay(userId as string, localDate, locale),
    enabled: userId !== null,
  });
};

/**
 * Mutations invalidate the day they touched, by key, rather than clearing
 * broadly. A blanket invalidate would refetch every cached day the user has
 * scrolled through, on mobile data, to update one number.
 */
export const useAddFood = () => {
  const queryClient = useQueryClient();

  return useMutation<void, AppError, AddFoodInput>({
    mutationFn: addFoodToMeal,
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.diaryDayPrefix(input.userId, input.localDate),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.recentFoodsPrefix(input.userId) });
    },
  });
};

export const useDeleteMealItem = (userId: string, localDate: LocalDate) => {
  const queryClient = useQueryClient();

  return useMutation<void, AppError, string>({
    mutationFn: deleteMealItem,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.diaryDayPrefix(userId, localDate),
      });
    },
  });
};

export const useSetWater = (userId: string, localDate: LocalDate) => {
  const queryClient = useQueryClient();
  // The EXACT key the day query registered under. An optimistic write to a key
  // that differs by one element updates nothing and fails silently.
  const locale = useLocale();

  return useMutation<void, AppError, number>({
    mutationFn: (waterMl) => setWater(userId, localDate, waterMl),
    // Water is a plus-button people tap repeatedly. Optimistic so the number
    // moves on the tap rather than after a round trip; on failure the previous
    // value is restored and the refetch below settles the truth.
    onMutate: async (waterMl) => {
      const key = queryKeys.diaryDay(userId, localDate, locale);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DiaryDay>(key);
      if (previous !== undefined) {
        queryClient.setQueryData<DiaryDay>(key, { ...previous, waterMl });
      }
      return { previous };
    },
    onError: (_error, _waterMl, context) => {
      const previous = (context as { previous?: DiaryDay } | undefined)?.previous;
      if (previous !== undefined) {
        queryClient.setQueryData(queryKeys.diaryDay(userId, localDate, locale), previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.diaryDayPrefix(userId, localDate),
      });
    },
  });
};
