import { createContext, useContext, useState } from 'react';

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

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  // Hook to consume theme state
  return useContext(ThemeContext);
}
