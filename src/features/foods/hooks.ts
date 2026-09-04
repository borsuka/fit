import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '@/lib/errors';
import { useLocale } from '@/lib/i18n/useLocale';
import { queryKeys } from '@/lib/queryClient';
import {
  getFood,
  getRecentFoods,
  searchFoods,
  type FoodDetail,
  type FoodSearchResult,
} from '@/services/foods/foodService';

export const useFoodSearch = (query: string): UseQueryResult<FoodSearchResult[], AppError> => {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.foodSearch(query.trim(), locale),
    queryFn: () => searchFoods(query, locale),
    enabled: query.trim().length >= 2,
    // Keeps the previous results on screen while the next query runs. Without
    // it the list blanks on every keystroke, which reads as "no results" and
    // makes a fast search feel broken.
    placeholderData: keepPreviousData,
    // Results for a given term do not change minute to minute, and a user
    // retyping the same word should not pay for it twice.
    staleTime: 5 * 60_000,
  });
};

export const useRecentFoods = (userId: string): UseQueryResult<FoodSearchResult[], AppError> => {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.recentFoods(userId, locale),
    queryFn: () => getRecentFoods(userId, locale),
  });
};

export const useFood = (foodId: string | null): UseQueryResult<FoodDetail | null, AppError> => {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.food(foodId ?? 'none', locale),
    queryFn: () => getFood(foodId as string, locale),
    enabled: foodId !== null,
  });
};
