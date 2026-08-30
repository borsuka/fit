import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { ThemeProvider } from '@/ui';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    // Two providers on purpose: react-navigation styles the chrome it owns
    // (headers, tab bars) from its own theme object, while everything we draw
    // reads our tokens. Both follow the same OS setting.
    <NavigationThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <ThemeProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </ThemeProvider>
    </NavigationThemeProvider>
  );
}
