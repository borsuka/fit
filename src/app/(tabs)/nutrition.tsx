import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MEAL_TYPES } from '@/services/diary/diaryService';
import { Button, Screen, Text, useTheme } from '@/ui';

/**
 * Entry points into logging. Each meal section gets its own button so the
 * destination is chosen before the search, not after - picking the food and
 * then being asked "which meal?" is one question too many at the point where
 * someone is standing over their lunch.
 */
export default function NutritionTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen scroll>
      <Text variant="title">{t('common.search')}</Text>
      <View style={{ gap: theme.spacing.md }}>
        {MEAL_TYPES.map((mealType) => (
          <Button
            key={mealType}
            label={t('portion.addTo', { meal: mealType })}
            variant="secondary"
            fullWidth
            size="lg"
            onPress={() => router.push({ pathname: '/search', params: { mealType } })}
          />
        ))}
      </View>
    </Screen>
  );
}
