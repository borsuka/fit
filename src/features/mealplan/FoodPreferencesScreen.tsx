import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useFoodSearch } from '@/features/foods/hooks';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import {
  getFoodPreferences,
  setFoodPreference,
  type FoodPreferences,
} from '@/services/mealplan/mealPlanService';
import { getFoodsByIds, type FoodSearchResult } from '@/services/foods/foodService';
import { Card, Screen, ScreenHeader, Text, TextField, useTheme } from '@/ui';

type Preference = 'liked' | 'disliked' | null;

/**
 * Tell the planner what you actually eat.
 *
 * Two different strengths, and the screen says which is which: a dislike is a
 * hard exclusion the solver will never override, a like only breaks ties. That
 * distinction matters - a user who marks twenty things "liked" expecting a menu
 * of favourites and gets a plan that ignores half of them has been misled by
 * the interface, not by the solver.
 */
export function FoodPreferencesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const searchQuery = useFoodSearch(query);

  const preferencesQuery = useQuery<FoodPreferences, AppError>({
    queryKey: ['foodPreferences', userId],
    queryFn: () => getFoodPreferences(userId),
  });

  const marked = preferencesQuery.data;
  const markedIds = [...(marked?.likedFoodIds ?? []), ...(marked?.dislikedFoodIds ?? [])];

  // The preference rows store ids only, so the names have to be fetched. Keyed
  // by the id list: adding a preference changes the key and refetches, which is
  // what makes a newly marked food appear in the list below.
  const markedFoodsQuery = useQuery<FoodSearchResult[], AppError>({
    queryKey: ['foodsByIds', [...markedIds].sort()],
    queryFn: () => getFoodsByIds(markedIds),
    enabled: markedIds.length > 0,
  });

  const setPreference = useMutation<void, AppError, { foodId: string; preference: Preference }>({
    mutationFn: ({ foodId, preference }) => setFoodPreference(userId, foodId, preference),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['foodPreferences', userId] });
    },
  });

  const preferenceFor = (foodId: string): Preference => {
    if (marked?.likedFoodIds.includes(foodId) === true) return 'liked';
    if (marked?.dislikedFoodIds.includes(foodId) === true) return 'disliked';
    return null;
  };

  const renderRow = ({ item }: { item: FoodSearchResult }) => {
    const current = preferenceFor(item.id);

    // Tapping the state you are already in clears it. "No opinion" is a real
    // answer and has to be reachable without a third button.
    const choose = (next: Exclude<Preference, null>): void => {
      setPreference.mutate({ foodId: item.id, preference: current === next ? null : next });
    };

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="caption" tone="muted">
            {Math.round(item.kcal100g)} kcal / 100 g
          </Text>
        </View>

        <PreferenceButton
          label={t('preferences.like')}
          active={current === 'liked'}
          tone={theme.colors.success}
          accessibilityLabel={t('preferences.likeA11y', { food: item.name })}
          onPress={() => choose('liked')}
        />
        <PreferenceButton
          label={t('preferences.dislike')}
          active={current === 'disliked'}
          tone={theme.colors.danger}
          accessibilityLabel={t('preferences.dislikeA11y', { food: item.name })}
          onPress={() => choose('disliked')}
        />
      </View>
    );
  };

  const searching = query.trim().length >= 2;
  const rows: readonly FoodSearchResult[] = searching
    ? (searchQuery.data ?? [])
    : (markedFoodsQuery.data ?? []);

  return (
    <Screen header={<ScreenHeader title={t('preferences.title')} fallbackHref="/mealplan" />}>
      <Text variant="body" tone="muted">
        {t('preferences.body')}
      </Text>

      <TextField
        label={t('common.search')}
        placeholder={t('portion.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      {setPreference.isError ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {toMessage(setPreference.error)}
        </Text>
      ) : null}

      {!searching ? (
        <Text variant="label" tone="muted">
          {t('preferences.marked')}
        </Text>
      ) : null}

      {searchQuery.isLoading && searching ? (
        <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <Card>
          <Text variant="body" tone="muted">
            {searching ? t('portion.noResults') : t('preferences.empty')}
          </Text>
        </Card>
      ) : (
        <FlatList
          data={[...rows]}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          )}
        />
      )}
    </Screen>
  );
}

function PreferenceButton({
  label,
  active,
  tone,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  active: boolean;
  tone: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      // Announced as a toggle, because it is one: pressing it again clears it.
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 48,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: active ? 2 : 1,
        borderColor: active ? tone : theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
      })}
    >
      <Text variant="caption" style={{ color: active ? tone : theme.colors.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}
