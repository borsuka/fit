import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(lightTheme);

/**
 * Follows the OS appearance setting. A per-user override can be layered on
 * later by passing `forced`; the components below never need to know.
 */
export function ThemeProvider({
  children,
  forced,
}: {
  children: ReactNode;
  forced?: 'light' | 'dark';
}) {
  const scheme = useColorScheme();
  const resolved = forced ?? scheme;

  const theme = useMemo(() => (resolved === 'dark' ? darkTheme : lightTheme), [resolved]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext);
