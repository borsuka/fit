import { Pressable, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { MIN_TOUCH_TARGET } from './tokens';

export interface OptionRowProps {
  label: string;
  hint?: string | undefined;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * A selectable row in a single-choice list.
 *
 * Selection is signalled three ways - border, a filled indicator, and
 * `accessibilityState.selected` - because colour alone fails for a
 * colour-blind user, and a visual-only cue fails for a screen reader.
 */
export function OptionRow({ label, hint, selected, onPress, disabled = false }: OptionRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: MIN_TOUCH_TARGET + 8,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: theme.colors.primary,
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <Text variant="label">{label}</Text>
        {hint === undefined ? null : (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
