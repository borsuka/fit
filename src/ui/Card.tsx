import { View, type ViewProps } from 'react-native';

import { useTheme } from './ThemeProvider';

export interface CardProps extends ViewProps {
  padded?: boolean;
}

/**
 * A surface. Uses a border rather than a shadow: shadows render differently on
 * iOS and Android and disappear entirely against a dark background, while a
 * 1 px border reads the same everywhere.
 */
export function Card({ padded = true, style, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.lg,
          padding: padded ? theme.spacing.lg : 0,
        },
        style,
      ]}
      {...rest}
    />
  );
}
