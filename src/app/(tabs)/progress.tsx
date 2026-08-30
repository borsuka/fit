import { Screen, Text } from '@/ui';

/**
 * Placeholder. Progress arrives in Phase 6; the tab exists now so the shell is
 * navigable and the route names are settled.
 */
export default function ProgressTab() {
  return (
    <Screen>
      <Text variant="title">Progress</Text>
      <Text variant="body" tone="muted">
        Coming in Phase 6.
      </Text>
    </Screen>
  );
}
