import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { MIN_TOUCH_TARGET } from './tokens';

export interface ScreenHeaderProps {
  title?: string | undefined;
  /** Where to go when there is nothing to go back to - a deep link, a reload,
   *  or a screen reached by `replace`. Without it the user is stranded. */
  fallbackHref?: '/' | '/nutrition' | '/workouts' | '/mealplan' | '/progress' | undefined;
  onBack?: (() => void) | undefined;
  /** Right-hand slot: a save action, a counter, anything screen-specific. */
  trailing?: React.ReactNode;
}

/**
 * The way out of a screen.
 *
 * Every pushed screen needs one. The stack is configured with `headerShown:
 * false` so the chrome matches our design system, which also means there is no
 * platform back button on web and no title anywhere - a user who opens the
 * camera or a form has no way out but the browser's back arrow, and on a phone
 * only an edge-swipe most people never discover.
 *
 * `router.back()` is not enough on its own: a screen reached by `replace`, a
 * reload, or a deep link has no history to pop, and back() silently does
 * nothing. So this falls forward to a known destination instead.
 */
export function ScreenHeader({ title, fallbackHref, onBack, trailing }: ScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  const handleBack = (): void => {
    if (onBack !== undefined) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref ?? '/');
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: MIN_TOUCH_TARGET,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={handleBack}
        hitSlop={12}
        style={({ pressed }) => ({
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
        })}
      >
        {/* A chevron drawn from two rotated bars rather than an icon font: one
            less dependency, and it scales with the type colour. */}
        <View style={{ width: 12, height: 12 }}>
          <View
            style={{
              position: 'absolute',
              top: 1,
              left: 3,
              width: 9,
              height: 2,
              borderRadius: 1,
              backgroundColor: theme.colors.text,
              transform: [{ rotate: '-45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 3,
              width: 9,
              height: 2,
              borderRadius: 1,
              backgroundColor: theme.colors.text,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      </Pressable>

      <View style={{ flex: 1 }}>
        {title === undefined ? null : (
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>

      {trailing}
    </View>
  );
}
