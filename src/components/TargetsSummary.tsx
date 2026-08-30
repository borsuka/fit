import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { NutritionTargets } from '@/domain/nutrition';
import { Card, Text, useTheme } from '@/ui';

/**
 * Shows a computed target set, including every safety adjustment applied.
 *
 * The adjustments are not a footnote. If the app quietly raised someone's
 * target to a floor, or capped the rate they asked for, saying so is the
 * difference between a tool they can reason about and one that seems to
 * ignore them.
 */
export function TargetsSummary({ targets }: { targets: NutritionTargets }) {
  const { t } = useTranslation();
  const theme = useTheme();

  const macros = [
    { label: t('nutrition.protein'), value: targets.proteinG, color: theme.colors.protein },
    { label: t('nutrition.carbs'), value: targets.carbsG, color: theme.colors.carbs },
    { label: t('nutrition.fat'), value: targets.fatG, color: theme.colors.fat },
  ];

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Card>
        <Text variant="label" tone="muted">
          {t('nutrition.calories')}
        </Text>
        <Text variant="metric">{targets.calories.toLocaleString()}</Text>

        <View
          style={{
            flexDirection: 'row',
            marginTop: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          {macros.map((macro) => (
            <View key={macro.label} style={{ flex: 1, gap: theme.spacing.xs }}>
              {/* A colour swatch plus the name. The colour alone would be
                  meaningless to a colour-blind user, so it never carries the
                  identity on its own. */}
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: macro.color,
                }}
              />
              <Text variant="caption" tone="muted">
                {macro.label}
              </Text>
              <Text variant="heading">{macro.value} g</Text>
            </View>
          ))}
        </View>
      </Card>

      {targets.adjustments.length > 0 ? (
        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            {targets.adjustments.map((adjustment) => (
              <Text key={adjustment.code} variant="caption" tone="warning">
                {t(`adjustments.${adjustment.code}`)}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}

      <Text variant="caption" tone="muted">
        {t('nutrition.estimateNotice')}
      </Text>
    </View>
  );
}
