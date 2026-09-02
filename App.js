// App root: loads fonts, wraps everything in providers + navigation
import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // needs to wrap gesture-driven UI
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context'; // gives notch/safe-area insets
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import TabNavigator from './src/navigation/TabNavigator';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { MarketDataProvider } from './src/context/MarketDataContext';
import { TradingProvider } from './src/context/TradingContext';
import { WatchlistProvider } from './src/context/WatchlistContext';
import { PortfolioProvider } from './src/context/PortfolioContext';

// Inner component: applies theme to navigation chrome (doesn't own providers)
function AppContent() {
  const { theme, isDark } = useTheme();
  // Base on RN's dark/light nav theme, then override colors with our theme
  const baseNavigationTheme = isDark ? DarkTheme : DefaultTheme;

  // Map our theme tokens onto navigation theme colors
  const navigationTheme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
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
  // Load custom TangoSans font family variants on launch
  useFonts({
    'TangoSans': require('./assets/fonts/TangoSans.ttf'),
    'TangoSans-Bold': require('./assets/fonts/TangoSans_Bold.ttf'),
    'TangoSans-Italic': require('./assets/fonts/TangoSans_Italic.ttf'),
    'TangoSans-BoldItalic': require('./assets/fonts/TangoSans_BoldItalic.ttf'),
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Provider stack (order matters): theme -> market -> trading -> portfolio -> watchlist */}
        <ThemeProvider>
          <MarketDataProvider>
            <TradingProvider>
              <PortfolioProvider>
                <WatchlistProvider>
                  <AppContent />
                </WatchlistProvider>
              </PortfolioProvider>
            </TradingProvider>
          </MarketDataProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
