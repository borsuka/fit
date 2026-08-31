import { Pressable, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { MIN_TOUCH_TARGET } from './tokens';

export interface ToggleRowProps {
  label: string;
  hint?: string | undefined;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Shown on the right - a preference marker, a count, a unit. */
  trailing?: string | undefined;
}

/**
 * A row in a multiple-choice list.
 *
 * The sibling of OptionRow, and deliberately a different shape: a square with a
 * tick rather than a circle with a dot. Someone scanning a settings screen
 * should be able to tell "pick one" from "pick any" without reading a word, and
 * `accessibilityRole="checkbox"` tells a screen reader the same thing.
 */
export function ToggleRow({
  label,
  hint,
  checked,
  onToggle,
  disabled = false,
  trailing,
}: ToggleRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: checked ? 2 : 1,
        borderColor: checked ? theme.colors.primary : theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: theme.radius.sm,
          borderWidth: 2,
          borderColor: checked ? theme.colors.primary : theme.colors.border,
          backgroundColor: checked ? theme.colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* A tick drawn from two rotated bars: no icon font, no asset, and it
            scales with the box rather than blurring. */}
        {checked ? (
          <View style={{ width: 12, height: 12 }}>
            <View
              style={{
                position: 'absolute',
                left: 1,
                top: 6,
                width: 5,
                height: 2,
                backgroundColor: theme.colors.onPrimary,
                transform: [{ rotate: '45deg' }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 3,
                top: 5,
                width: 9,
                height: 2,
                backgroundColor: theme.colors.onPrimary,
                transform: [{ rotate: '-50deg' }],
              }}
            />
          </View>
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

      {trailing === undefined ? null : (
        <Text variant="caption" tone="muted">
          {trailing}
        </Text>
      )}
    </Pressable>
  );
}
