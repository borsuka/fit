import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PLANNABLE_DIETS, type PlannableDiet } from '@/domain/mealplan';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import {
  getDietSettings,
  saveDietSettings,
  type DietSettings,
} from '@/services/mealplan/mealPlanService';
import { Button, Card, OptionRow, Screen, ScreenHeader, Text, ToggleRow, useTheme } from '@/ui';

/**
 * The 14 allergens EU law requires to be declared, in the order the seed
 * assigns their ids. Hard-coded rather than fetched: the list is legislation,
 * not data, and a network failure must not produce an allergen picker with
 * items missing.
 */
const ALLERGENS: readonly { readonly id: number; readonly code: string }[] = [
  { id: 1, code: 'gluten' },
  { id: 2, code: 'crustaceans' },
  { id: 3, code: 'eggs' },
  { id: 4, code: 'fish' },
  { id: 5, code: 'peanuts' },
  { id: 6, code: 'soybeans' },
  { id: 7, code: 'milk' },
  { id: 8, code: 'nuts' },
  { id: 9, code: 'celery' },
  { id: 10, code: 'mustard' },
  { id: 11, code: 'sesame' },
  { id: 12, code: 'sulphites' },
  { id: 13, code: 'lupin' },
  { id: 14, code: 'molluscs' },
];

const MEALS_PER_DAY: readonly number[] = [2, 3, 4];

/** Ceilings a cook actually thinks in. `null` means no limit. */
const PREP_LIMITS: readonly (number | null)[] = [null, 15, 30, 60];

export function DietSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery<DietSettings, AppError>({
    queryKey: ['dietSettings', userId],
    queryFn: () => getDietSettings(userId),
  });

  /**
   * Only what the user has CHANGED, merged over the server value at render.
   *
   * Not a copy seeded from an effect: that fires a second render on every
   * fetch, and it has to guess whether an arriving value should overwrite
   * something the user is halfway through editing. Storing the edits alone
   * removes the question.
   */
  const [patch, setPatch] = useState<Partial<DietSettings>>({});

  const stored = settingsQuery.data;
  const draft: DietSettings | null = stored === undefined ? null : { ...stored, ...patch };
  const setDraft = (next: DietSettings): void => setPatch(next);

  const save = useMutation<DietSettings, AppError, DietSettings>({
    mutationFn: (next) => saveDietSettings(userId, next),
    onSuccess: (next) => {
      queryClient.setQueryData(['dietSettings', userId], next);
      router.back();
    },
  });

  const header = <ScreenHeader title={t('mealplan.settingsTitle')} fallbackHref="/mealplan" />;

  if (draft === null) {
    return (
      <Screen header={header}>
        <Text variant="body" tone="muted">
          {settingsQuery.isError ? toMessage(settingsQuery.error) : t('common.loading')}
        </Text>
      </Screen>
    );
  }

  const toggleAllergen = (id: number): void => {
    const current = draft.excludedAllergenIds;
    setDraft({
      ...draft,
      excludedAllergenIds: current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id].sort((a, b) => a - b),
    });
  };

  return (
    <Screen
      scroll
      header={header}
      footer={
        <>
          {save.isError ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {toMessage(save.error)}
            </Text>
          ) : null}
          <Button
            label={t('common.save')}
            onPress={() => save.mutate(draft)}
            loading={save.isPending}
            fullWidth
            size="lg"
          />
        </>
      }
    >
      <Text variant="body" tone="muted">
        {t('mealplan.settingsBody')}
      </Text>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label">{t('mealplan.diet')}</Text>
        {PLANNABLE_DIETS.map((diet: PlannableDiet) => (
          <OptionRow
            key={diet}
            label={t(`mealplan.diet_${diet}`)}
            selected={draft.diet === diet}
            onPress={() => setDraft({ ...draft, diet })}
          />
        ))}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label">{t('mealplan.mealsPerDay')}</Text>
        {MEALS_PER_DAY.map((count) => (
          <OptionRow
            key={count}
            label={t(`mealplan.meals_${count}`)}
            selected={draft.mealsPerDay === count}
            onPress={() => setDraft({ ...draft, mealsPerDay: count })}
          />
        ))}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label">{t('mealplan.maxPrep')}</Text>
        {PREP_LIMITS.map((limit) => (
          <OptionRow
            key={limit ?? 'none'}
            label={
              limit === null ? t('mealplan.prepAny') : t('mealplan.prepUpTo', { minutes: limit })
            }
            selected={draft.maxPrepMinutes === limit}
            onPress={() => setDraft({ ...draft, maxPrepMinutes: limit })}
          />
        ))}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label">{t('mealplan.allergens')}</Text>
        <Card>
          <Text variant="caption" tone="muted">
            {/* Said plainly, because the consequence of getting this wrong is
                not a bad recommendation. */}
            {t('mealplan.allergensBody')}
          </Text>
        </Card>
        {ALLERGENS.map((allergen) => (
          <ToggleRow
            key={allergen.id}
            label={t(`allergens.${allergen.code}`)}
            checked={draft.excludedAllergenIds.includes(allergen.id)}
            onToggle={() => toggleAllergen(allergen.id)}
          />
        ))}
      </View>
    </Screen>
  );
}
