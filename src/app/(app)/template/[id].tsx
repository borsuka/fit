import { useLocalSearchParams } from 'expo-router';

import { TemplateScreen } from '@/features/workouts/TemplateScreen';

export default function TemplateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TemplateScreen workoutId={id} />;
}
