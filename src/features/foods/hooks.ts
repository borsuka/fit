import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';
import {
  getFood,
  getRecentFoods,
  searchFoods,
  type FoodDetail,
  type FoodSearchResult,
} from '@/services/foods/foodService';

export const useFoodSearch = (query: string): UseQueryResult<FoodSearchResult[], AppError> =>
  useQuery({
    queryKey: queryKeys.foodSearch(query.trim()),
    queryFn: () => searchFoods(query),
    enabled: query.trim().length >= 2,
    // Keeps the previous results on screen while the next query runs. Without
    // it the list blanks on every keystroke, which reads as "no results" and
    // makes a fast search feel broken.
    placeholderData: keepPreviousData,
    // Results for a given term do not change minute to minute, and a user
    // retyping the same word should not pay for it twice.
    staleTime: 5 * 60_000,
  });

export const useRecentFoods = (userId: string): UseQueryResult<FoodSearchResult[], AppError> =>
  useQuery({
    queryKey: queryKeys.recentFoods(userId),
    queryFn: () => getRecentFoods(userId),
  });

export const useFood = (foodId: string | null): UseQueryResult<FoodDetail | null, AppError> =>
  useQuery({
    queryKey: queryKeys.food(foodId ?? 'none'),
    queryFn: () => getFood(foodId as string),
    enabled: foodId !== null,
  });
