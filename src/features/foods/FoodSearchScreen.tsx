import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import type { MealType } from '@/services/diary/diaryService';
import type { FoodSearchResult } from '@/services/foods/foodService';
import { Button, Card, Screen, ScreenHeader, Text, TextField, useTheme } from '@/ui';

import { useFoodSearch, useRecentFoods } from './hooks';

/**
 * Search, or pick from what was logged recently.
 *
 * Recent foods carry the list when the box is empty, because most logging is
 * repeat logging - people eat the same breakfast. Making them search for it
 * every morning is the difference between a tool used daily and one abandoned
 * in a week.
 */
export function FoodSearchScreen({ mealType }: { mealType: MealType }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();

  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const searchQuery = useFoodSearch(query);
  const recentQuery = useRecentFoods(userId);

  const isSearching = trimmed.length >= 2;
  const active = isSearching ? searchQuery : recentQuery;
  const results = active.data ?? [];

  const renderRow = ({ item }: { item: FoodSearchResult }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('portion.resultA11y', {
        name: item.name,
        kcal: Math.round(item.kcal100g),
      })}
      onPress={() =>
        router.push({
          pathname: '/food/[id]',
          params: { id: item.id, mealType },
        })
      }
      style={({ pressed }) => ({
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
        minHeight: 56,
        justifyContent: 'center',
      })}
    >
      <Text variant="body" numberOfLines={1}>
        {item.name}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {/* The catalogue name is English. When a Bulgarian alias is what
            matched, showing it is the difference between a list that looks
            wrong and one that explains itself. */}
        {item.matchedAlias === null ? '' : `${item.matchedAlias} · `}
        {item.brand === null ? '' : `${item.brand} · `}
        {Math.round(item.kcal100g)} kcal / 100 g
      </Text>
    </Pressable>
  );

  return (
    <Screen header={<ScreenHeader title={t('common.search')} fallbackHref="/nutrition" />}>
      <TextField
        label={t('common.search')}
        placeholder={t('portion.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {!isSearching ? (
        <Text variant="label" tone="muted">
          {t('portion.recent')}
        </Text>
      ) : null}

      {active.isError ? (
        <Card>
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {toMessage(active.error)}
          </Text>
          <View style={{ marginTop: theme.spacing.md }}>
            <Button
              label={t('common.retry')}
              variant="secondary"
              onPress={() => void active.refetch()}
            />
          </View>
        </Card>
      ) : active.isLoading ? (
        <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : results.length === 0 ? (
        // Three different empty states, because they mean three different
        // things and a single "nothing here" would leave the user guessing
        // which one they are in.
        <Card>
          <Text variant="body" tone="muted">
            {trimmed.length === 0
              ? t('portion.typeToSearch')
              : trimmed.length < 2
                ? t('portion.typeToSearch')
                : t('portion.noResults')}
          </Text>
        </Card>
      ) : (
        <FlatList
          data={results}
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
