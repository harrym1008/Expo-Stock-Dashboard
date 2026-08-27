import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import TabNavigator from './src/navigation/TabNavigator';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { MarketDataProvider } from './src/context/MarketDataContext';

function AppContent() {
  const { theme, isDark } = useTheme();

  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: theme.primary,
          background: theme.background,
          card: theme.surface,
          text: theme.textPrimary,
          border: theme.border,
          notification: theme.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: theme.primary,
          background: theme.background,
          card: theme.surface,
          text: theme.textPrimary,
          border: theme.border,
          notification: theme.primary,
        },
      };

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
        translucent={false}
      />
      <TabNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  useFonts({
    'TangoSans': require('./assets/fonts/TangoSans.ttf'),
    'TangoSans-Bold': require('./assets/fonts/TangoSans_Bold.ttf'),
    'TangoSans-Italic': require('./assets/fonts/TangoSans_Italic.ttf'),
    'TangoSans-BoldItalic': require('./assets/fonts/TangoSans_BoldItalic.ttf'),
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <MarketDataProvider>
            <AppContent />
          </MarketDataProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
