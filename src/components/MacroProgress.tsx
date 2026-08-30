import { View } from 'react-native';

import { progressFraction } from '@/domain/nutrition';
import { Text, useTheme } from '@/ui';

export interface MacroProgressProps {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
}

/**
 * One macro's progress toward its target.
 *
 * The bar is capped at 100% width so the layout cannot break, but the NUMBERS
 * are not. "180 / 160 g" with a full bar is honest; clamping the figure to the
 * target would hide the overshoot, which is the one thing the user most needs
 * to see.
 */
export function MacroProgress({ label, consumed, target, unit, color }: MacroProgressProps) {
  const theme = useTheme();

  const fraction = progressFraction(consumed, target);
  const isOver = fraction > 1;
  const width = `${Math.min(fraction, 1) * 100}%` as const;

  return (
    <View
      style={{ flex: 1, gap: theme.spacing.xs }}
      accessible
      // Read as one phrase instead of four disconnected fragments.
      accessibilityLabel={`${label}: ${Math.round(consumed)} of ${target} ${unit}${
        isOver ? ', over target' : ''
      }`}
    >
      <Text variant="caption" tone="muted">
        {label}
      </Text>

      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.surfaceMuted,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width,
            height: '100%',
            borderRadius: 3,
            // Over target switches colour AND the text below says so - colour
            // alone would be invisible to a colour-blind user.
            backgroundColor: isOver ? theme.colors.warning : color,
          }}
        />
      </View>

      <Text variant="caption" tone={isOver ? 'warning' : 'default'}>
        {Math.round(consumed)} / {target} {unit}
      </Text>
    </View>
  );
}
