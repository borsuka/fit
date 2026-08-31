import { useLocalSearchParams } from 'expo-router';

import { ProgramDetailScreen } from '@/features/workouts/ProgramDetailScreen';

export default function ProgramRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProgramDetailScreen programId={id} />;
}
