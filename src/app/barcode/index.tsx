import { useLocalSearchParams } from 'expo-router';

import { BarcodeScanScreen } from '@/features/barcode/BarcodeScanScreen';
import { MEAL_TYPES, type MealType } from '@/services/diary/diaryService';

export default function BarcodeRoute() {
  const params = useLocalSearchParams<{ mealType?: string }>();

  const mealType: MealType = MEAL_TYPES.includes(params.mealType as MealType)
    ? (params.mealType as MealType)
    : 'breakfast';

  return <BarcodeScanScreen mealType={mealType} />;
}
