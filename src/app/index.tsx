import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Placeholder shell. Phase 2 delivers the database, RLS and project
 * scaffolding; the real Home screen arrives in Phase 3 together with the
 * nutrition engine that supplies its numbers.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>fit</Text>
        <Text style={styles.subtitle}>Phase 2 — schema and scaffolding in place.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 34, fontWeight: '700' },
  subtitle: { fontSize: 15, opacity: 0.6 },
});
