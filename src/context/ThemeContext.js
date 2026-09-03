import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { storageService } from '../services/storageService';

// Dark theme palette
export const darkTheme = {
  mode: 'dark',
  background: '#07090C',
  surface: '#12161E',
  surfaceSubtle: '#181E29',
  border: '#1F2633',
  borderSubtle: '#151A24',
  textPrimary: '#FFFFFF',
  textSecondary: '#8B97A8',
  textMuted: '#576273',
  primary: '#00A3FF',
  tabBarBackground: '#0B0E14',
  tabBarBorder: '#161B24',
  tabBarActive: '#00A3FF',
  tabBarInactive: '#667488',
};

// Light theme palette
export const lightTheme = {
  mode: 'light',
  background: '#F0F3F7',
  surface: '#FFFFFF',
  surfaceSubtle: '#E8ECF2',
  border: '#DDE2EC',
  borderSubtle: '#EAEFF7',
  textPrimary: '#0C1017',
  textSecondary: '#5C6A7E',
  textMuted: '#8E9BAE',
  primary: '#0087D6',
  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#E2E7F0',
  tabBarActive: '#0087D6',
  tabBarInactive: '#8E9BAE',
};

// Default to dark theme upon first startup
const ThemeContext = createContext({
  theme: darkTheme,
  isDark: true,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    let isMounted = true;
    storageService.getStoredTheme().then((savedIsDark) => {
      if (isMounted && typeof savedIsDark === 'boolean') {
        setIsDark(savedIsDark);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      storageService.setStoredTheme(next);
      return next;
    });
  }, []);

  const theme = isDark ? darkTheme : lightTheme;

  const value = useMemo(
    () => ({ theme, isDark, toggleTheme }),
    [theme, isDark, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  // Hook to consume theme state
  return useContext(ThemeContext);
}
