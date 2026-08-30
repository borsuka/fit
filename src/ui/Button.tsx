import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { MIN_TOUCH_TARGET } from './tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();

  // A button doing work is not pressable. Without this, a double tap submits
  // an onboarding form twice and creates two goals.
  const isDisabled = disabled === true || loading;

  const height = size === 'sm' ? MIN_TOUCH_TARGET : size === 'md' ? 48 : 56;

  const surface: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: theme.colors.primary },
    secondary: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: theme.colors.danger },
  };

  const tone = variant === 'primary' || variant === 'danger' ? 'inverted' : 'default';

  return (
    <Pressable
      accessibilityRole="button"
      // Screen readers must announce that a control is unavailable, and why it
      // looks different. `busy` is what distinguishes "loading" from "broken".
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      // Enlarges the touch area without changing the visual size, so a small
      // button is still hittable while walking.
      hitSlop={size === 'sm' ? 8 : 0}
      style={({ pressed }) => [
        {
          height,
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.5 : 1,
        },
        surface[variant],
        pressed && !isDisabled
          ? { backgroundColor: variant === 'primary' ? theme.colors.primaryPressed : undefined }
          : null,
        style,
      ]}
      {...rest}
    >
      {/* The spinner replaces the label in place rather than resizing the
          button, so a row of buttons does not reflow mid-tap. */}
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'danger'
              ? theme.colors.onPrimary
              : theme.colors.text
          }
        />
      ) : (
        <View>
          <Text variant="label" tone={tone}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
