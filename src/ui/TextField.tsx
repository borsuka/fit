import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { MIN_TOUCH_TARGET } from './tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Present means invalid. The string is shown and announced. */
  error?: string | undefined;
  helper?: string | undefined;
  suffix?: string | undefined;
}

/**
 * A labelled text input.
 *
 * The label is a real `<Text>` above the field, not a placeholder. Placeholder
 * labels vanish the moment someone starts typing, which leaves a half-filled
 * form with no way to tell what each box was for - and screen readers get
 * nothing at all.
 */
export function TextField({
  label,
  error,
  helper,
  suffix,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor =
    error !== undefined
      ? theme.colors.danger
      : focused
        ? theme.colors.primary
        : theme.colors.border;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          // Two pixels on error, so the state does not rely on colour alone -
          // and the message below says it in words regardless.
          borderColor,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: theme.spacing.md,
          minHeight: MIN_TOUCH_TARGET,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={helper}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            color: theme.colors.text,
            fontSize: theme.typography.body.fontSize,
            paddingVertical: theme.spacing.md,
          }}
          {...rest}
        />
        {suffix === undefined ? null : (
          <Text variant="label" tone="muted">
            {suffix}
          </Text>
        )}
      </View>

      {error !== undefined ? (
        // `alert` role plus a live region, so a screen reader announces the
        // problem when it appears rather than only when the field is next
        // focused.
        <Text
          variant="caption"
          tone="danger"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : helper !== undefined ? (
        <Text variant="caption" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
