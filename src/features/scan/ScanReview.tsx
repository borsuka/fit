import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import {
  confidenceBand,
  isPreselected,
  type ConfidenceBand,
} from '@shared/ai-contracts/foodAnalysis';
import { roundForDisplay, scaleNutrition } from '@/domain/nutrition';
import type { ConfirmedItem, ScanItemView } from '@/services/ai/scanService';
import { Card, Text, TextField, useTheme } from '@/ui';

export interface ScanReviewProps {
  items: readonly ScanItemView[];
  onSelectionChange: (items: readonly ConfirmedItem[]) => void;
}

interface Draft {
  readonly accepted: boolean;
  readonly grams: string;
}

const BAND_TONE: Record<ConfidenceBand, 'success' | 'warning' | 'danger'> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
};

/**
 * The confirmation step. Nothing reaches the diary without passing through it.
 *
 * Two rules shape this screen:
 *
 *   Low-confidence items start UNCHECKED. They are questions, not answers, and
 *   pre-selecting one is how a wrong guess gets committed by someone tapping
 *   through a flow.
 *
 *   An unmatched item cannot be added at all. We have a name but no food, so
 *   there is no honest number to log - the user searches for it instead. That
 *   is better than attaching the nearest row and calling it dinner.
 */
export function ScanReview({ items, onSelectionChange }: ScanReviewProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      items.map((item) => [
        item.id,
        {
          accepted: item.per100g !== null && isPreselected(item.confidence),
          grams: String(Math.round(item.estimatedGrams)),
        },
      ]),
    ),
  );

  const confirmed = useMemo<ConfirmedItem[]>(() => {
    const result: ConfirmedItem[] = [];
    for (const item of items) {
      const draft = drafts[item.id];
      if (draft === undefined || !draft.accepted) continue;
      if (item.per100g === null || item.matchedFoodId === null) continue;

      const grams = Number(draft.grams.replace(',', '.'));
      if (!Number.isFinite(grams) || grams <= 0) continue;

      result.push({
        scanItemId: item.id,
        foodId: item.matchedFoodId,
        grams,
        per100g: item.per100g,
      });
    }
    return result;
  }, [items, drafts]);

  // Calling the parent during render would be a side effect in the render
  // phase: React may render speculatively or discard the pass, so the parent
  // would see updates it should not, or miss ones it should.
  useEffect(() => {
    onSelectionChange(confirmed);
  }, [confirmed, onSelectionChange]);

  const update = (id: string, patch: Partial<Draft>): void =>
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { accepted: false, grams: '0' }), ...patch },
    }));

  return (
    <View style={{ gap: theme.spacing.md }}>
      {items.map((item) => {
        const draft = drafts[item.id] ?? { accepted: false, grams: '0' };
        const band = confidenceBand(item.confidence);
        const grams = Number(draft.grams.replace(',', '.'));
        const preview =
          item.per100g === null || !Number.isFinite(grams) || grams <= 0
            ? null
            : roundForDisplay(scaleNutrition(item.per100g, grams));

        const unmatched = item.matchedFoodId === null;

        return (
          <Card key={item.id}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.accepted, disabled: unmatched }}
              accessibilityLabel={item.label}
              accessibilityHint={unmatched ? t('scan.unmatchedHint') : t(`scan.confidence_${band}`)}
              disabled={unmatched}
              onPress={() => update(item.id, { accepted: !draft.accepted })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: draft.accepted ? theme.colors.primary : theme.colors.border,
                  backgroundColor: draft.accepted ? theme.colors.primary : 'transparent',
                  opacity: unmatched ? 0.4 : 1,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text variant="heading" numberOfLines={1}>
                  {item.label}
                </Text>
                <Text variant="caption" tone={unmatched ? 'muted' : BAND_TONE[band]}>
                  {unmatched
                    ? t('scan.noMatch')
                    : `${t(`scan.confidence_${band}`)} · ${item.matchedFoodName ?? ''}`}
                </Text>
              </View>
            </Pressable>

            {band === 'low' && !unmatched ? (
              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                {t('scan.lowConfidenceHint')}
              </Text>
            ) : null}

            {unmatched ? null : (
              <View style={{ marginTop: theme.spacing.md }}>
                <TextField
                  label={t('portion.amount')}
                  value={draft.grams}
                  onChangeText={(grams) => update(item.id, { grams })}
                  keyboardType="decimal-pad"
                  suffix="g"
                  helper={t('scan.estimateHint')}
                />
              </View>
            )}

            {preview === null ? null : (
              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                {preview.kcal} kcal · {preview.proteinG}P / {preview.carbsG}C / {preview.fatG}F
              </Text>
            )}
          </Card>
        );
      })}
    </View>
  );
}
