import { useLocalSearchParams } from 'expo-router';

import { WorkoutSessionScreen } from '@/features/workouts/WorkoutSessionScreen';

export default function WorkoutSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkoutSessionScreen sessionId={id} />;
}
