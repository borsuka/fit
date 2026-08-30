import { useLocalSearchParams } from 'expo-router';

import { FoodSearchScreen } from '@/features/foods/FoodSearchScreen';
import { MEAL_TYPES, type MealType } from '@/services/diary/diaryService';

export default function SearchRoute() {
  const params = useLocalSearchParams<{ mealType?: string }>();

  const mealType: MealType = MEAL_TYPES.includes(params.mealType as MealType)
    ? (params.mealType as MealType)
    : 'breakfast';

  return <FoodSearchScreen mealType={mealType} />;
}
