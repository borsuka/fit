import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Text, useTheme } from '@/ui';

/**
 * Placeholder shell. Phase 3 delivers auth, onboarding and the diary; this
 * screen exists so the design system is exercised rather than sitting unused.
 */
export default function HomeScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.container, { padding: theme.spacing.lg, gap: theme.spacing.lg }]}>
        <Text variant="display">fit</Text>
        <Card>
          <Text variant="heading">Nutrition engine ready</Text>
          <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            Targets, safety rails and diary totals are implemented and tested. Auth and onboarding
            are next.
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, justifyContent: 'center' },
});
