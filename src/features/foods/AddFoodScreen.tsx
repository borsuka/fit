import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { toLocalDate } from '@/domain/dates/localDate';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useAddFood } from '@/features/diary/hooks';
import { useProfile } from '@/features/profile/hooks';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import type { MealType } from '@/services/diary/diaryService';
import { Button, Card, Screen, Text, useTheme } from '@/ui';

import { useFood } from './hooks';
import { PortionPicker } from './PortionPicker';

export function AddFoodScreen({ foodId, mealType }: { foodId: string; mealType: MealType }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();

  const foodQuery = useFood(foodId);
  const profileQuery = useProfile(userId);
  const addFood = useAddFood();

  const [grams, setGrams] = useState<number | null>(null);

  // Stable identity, or PortionPicker's effect re-runs on every render of this
  // screen and reports the same value repeatedly.
  const handleQuantityChange = useCallback((next: number | null) => setGrams(next), []);

  const handleAdd = (): void => {
    const food = foodQuery.data;
    if (food === null || food === undefined || grams === null) return;

    addFood.mutate(
      {
        userId,
        localDate: toLocalDate(profileQuery.data?.timezone ?? 'UTC'),
        mealType,
        food: {
          id: food.id,
          name: food.name,
          kcal_100g: food.kcal100g,
          protein_100g: food.protein100g,
          carbs_100g: food.carbs100g,
          fat_100g: food.fat100g,
          fiber_100g: food.fiber100g,
        },
        quantityG: grams,
        source: 'search',
      },
      // Only navigate on success. Dismissing optimistically would hide a
      // failure behind a screen transition, and the user would believe the
      // food was logged when it was not.
      { onSuccess: () => router.back() },
    );
  };

  if (foodQuery.isLoading) {
    return (
      <Screen>
        <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </Screen>
    );
  }

  if (foodQuery.isError || foodQuery.data === null || foodQuery.data === undefined) {
    return (
      <Screen>
        <Card>
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {foodQuery.isError ? toMessage(foodQuery.error) : t('errors.not_found')}
          </Text>
        </Card>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const food = foodQuery.data;

  return (
    <Screen
      scroll
      footer={
        <>
          {addFood.isError ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {toMessage(addFood.error)}
            </Text>
          ) : null}
          <Button
            label={t('portion.addTo', { meal: mealType })}
            onPress={handleAdd}
            disabled={grams === null}
            loading={addFood.isPending}
            fullWidth
            size="lg"
          />
        </>
      }
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{food.name}</Text>
        {food.brand === null ? null : (
          <Text variant="body" tone="muted">
            {food.brand}
          </Text>
        )}
      </View>

      <PortionPicker food={food} onQuantityChange={handleQuantityChange} />
    </Screen>
  );
}
