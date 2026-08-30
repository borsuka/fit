import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from './ThemeProvider';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Sticks to the bottom above the keyboard - primary actions live here. */
  footer?: ReactNode;
  contentStyle?: ViewStyle;
}

/**
 * Standard screen frame: safe area, keyboard handling, consistent padding.
 *
 * Keyboard avoidance is here rather than per-screen because getting it wrong
 * is invisible on a large phone and hides the submit button on a small one -
 * the exact device most likely to be someone's only device.
 */
export function Screen({ children, scroll = false, footer, contentStyle }: ScreenProps) {
  const theme = useTheme();

  const padding = {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      // Without this, the first tap after typing only dismisses the keyboard
      // and the button appears not to work.
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padding, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {body}
        {footer === undefined ? null : (
          <View
            style={{
              padding: theme.spacing.lg,
              gap: theme.spacing.sm,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
