import { useLocalSearchParams } from 'expo-router';

import { AddFoodScreen } from '@/features/foods/AddFoodScreen';
import { MEAL_TYPES, type MealType } from '@/services/diary/diaryService';

export default function FoodDetailRoute() {
  const params = useLocalSearchParams<{ id: string; mealType?: string }>();

  // Route params are strings from an untyped URL. Validating against the enum
  // beats casting: a hand-edited deep link should land on breakfast, not send
  // an invalid meal_type to Postgres and surface as a constraint violation.
  const mealType: MealType = MEAL_TYPES.includes(params.mealType as MealType)
    ? (params.mealType as MealType)
    : 'breakfast';

  return <AddFoodScreen foodId={params.id} mealType={mealType} />;
}
