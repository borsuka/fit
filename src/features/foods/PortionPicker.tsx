import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { roundForDisplay, scaleNutrition, type NutritionPer100g } from '@/domain/nutrition';
import type { FoodDetail } from '@/services/foods/foodService';
import { Text, TextField, useTheme } from '@/ui';

/** Gram amounts offered as one-tap choices. Round numbers people actually
 *  think in, not an arbitrary spread. */
const QUICK_GRAMS = [50, 100, 150, 200, 250] as const;

export interface PortionPickerProps {
  food: FoodDetail;
  onQuantityChange: (grams: number | null) => void;
}

/**
 * Choose how much of a food was eaten.
 *
 * Household measures first, grams second. "One medium banana" is a portion
 * someone can actually judge; "118 g" is a number they would have to guess at,
 * and a guess entered as a precise figure is false precision that follows the
 * entry all the way into their weekly average.
 *
 * The nutrition preview updates live, so the consequence of the choice is
 * visible before it is committed.
 */
export function PortionPicker({ food, onQuantityChange }: PortionPickerProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const defaultServing = food.servings.find((s) => s.isDefault) ?? food.servings[0];

  const [servingId, setServingId] = useState<string | null>(defaultServing?.id ?? null);
  const [servingQty, setServingQty] = useState('1');
  const [gramsText, setGramsText] = useState('100');

  const grams = useMemo(() => {
    if (servingId !== null) {
      const serving = food.servings.find((s) => s.id === servingId);
      const qty = Number(servingQty.replace(',', '.'));
      if (serving === undefined || !Number.isFinite(qty) || qty <= 0) return null;
      return serving.grams * qty;
    }
    const parsed = Number(gramsText.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [servingId, servingQty, gramsText, food.servings]);

  // Reported upward rather than held here, so the screen owns whether the
  // confirm button is enabled. In an effect, not a useMemo: React may discard
  // and recompute a memo, and a callback fired from one runs an unpredictable
  // number of times - or not at all.
  useEffect(() => {
    onQuantityChange(grams);
  }, [grams, onQuantityChange]);

  const per100g: NutritionPer100g = {
    kcal: food.kcal100g,
    proteinG: food.protein100g,
    carbsG: food.carbs100g,
    fatG: food.fat100g,
    ...(food.fiber100g === null ? {} : { fiberG: food.fiber100g }),
  };

  const preview = grams === null ? null : roundForDisplay(scaleNutrition(per100g, grams));

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radius.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? theme.colors.surfaceMuted : theme.colors.surface,
        // Chips are small; hitSlop keeps them reachable while walking.
        minHeight: 44,
        justifyContent: 'center',
      }}
      hitSlop={4}
    >
      <Text variant="label" tone={selected ? 'primary' : 'default'}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {food.servings.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {food.servings.map((serving) =>
              chip(
                `1 ${serving.label} (${Math.round(serving.grams)} g)`,
                servingId === serving.id,
                () => setServingId(serving.id),
                serving.id,
              ),
            )}
            {chip(t('portion.grams'), servingId === null, () => setServingId(null), 'grams')}
          </View>
        </View>
      ) : null}

      {servingId !== null ? (
        <TextField
          label={t('portion.quantity')}
          value={servingQty}
          onChangeText={setServingQty}
          keyboardType="decimal-pad"
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {QUICK_GRAMS.map((g) =>
              chip(`${g} g`, gramsText === String(g), () => setGramsText(String(g)), `g${g}`),
            )}
          </View>
          <TextField
            label={t('portion.amount')}
            value={gramsText}
            onChangeText={setGramsText}
            keyboardType="decimal-pad"
            suffix="g"
          />
        </View>
      )}

      {preview === null ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {t('portion.enterAmount')}
        </Text>
      ) : (
        <View
          accessible
          accessibilityLabel={`${preview.kcal} calories, ${preview.proteinG} grams protein, ${preview.carbsG} grams carbohydrate, ${preview.fatG} grams fat`}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            padding: theme.spacing.lg,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceMuted,
          }}
        >
          <View>
            <Text variant="caption" tone="muted">
              {t('nutrition.calories')}
            </Text>
            <Text variant="heading">{preview.kcal}</Text>
          </View>
          <View>
            <Text variant="caption" tone="muted">
              {t('nutrition.protein')}
            </Text>
            <Text variant="heading">{preview.proteinG} g</Text>
          </View>
          <View>
            <Text variant="caption" tone="muted">
              {t('nutrition.carbs')}
            </Text>
            <Text variant="heading">{preview.carbsG} g</Text>
          </View>
          <View>
            <Text variant="caption" tone="muted">
              {t('nutrition.fat')}
            </Text>
            <Text variant="heading">{preview.fatG} g</Text>
          </View>
        </View>
      )}
    </View>
  );
}
