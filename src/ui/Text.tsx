import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from './ThemeProvider';
import type { typography } from './tokens';

type Variant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'inverted' | 'primary' | 'success' | 'warning' | 'danger';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

/**
 * The only way text is styled in this app. Every size and colour comes from a
 * token, so a screen cannot quietly invent a fourteenth font size.
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  const theme = useTheme();

  const toneColor: Record<Tone, string> = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    inverted: theme.colors.textInverted,
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
  };

  const base = theme.typography[variant];
  const resolved: TextStyle = {
    fontSize: base.fontSize,
    lineHeight: base.lineHeight,
    fontWeight: base.fontWeight,
    color: toneColor[tone],
    // Numerals must not jitter as a counter ticks up.
    ...(variant === 'metric' ? { fontVariant: ['tabular-nums' as const] } : {}),
  };

  return <RNText style={[resolved, style]} {...rest} />;
}
