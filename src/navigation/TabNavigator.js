import { useEffect } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';

import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import NewsScreen from '../screens/NewsScreen';
import TabIcon from '../components/common/TabIcon';
import { useTheme } from '../context/ThemeContext';
import { spacing, fonts } from '../constants/theme';

const Tab = createBottomTabNavigator();


// Main tab navigator which sits at the bottom of the screen (toggles between home, search, portfolio and news)
export default function TabNavigator() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // On Android: match the NavigationBar background + icon contrast to the theme
  useEffect(() => {
    if (Platform.OS === 'android') {
      if (typeof NavigationBar?.setBackgroundColorAsync === 'function') {
        NavigationBar.setBackgroundColorAsync(theme.tabBarBackground).catch(() => {});
      }
      if (typeof NavigationBar?.setButtonStyleAsync === 'function') {
        NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark').catch(() => {});
      }
    }
  }, [theme.tabBarBackground, isDark]);

  // Platform-adjusted tab bar geometry (accounts for safe-area insets)
  const bottomInset = insets.bottom;
  const tabBarHeight = Platform.select({
    ios: 52 + bottomInset,
    android: 60 + bottomInset,
    default: 64,
  });
  const tabBarPaddingBottom = Platform.select({
    ios: bottomInset > 0 ? bottomInset : spacing.xs,
    android: bottomInset > 0 ? bottomInset + 2 : spacing.xs,
    default: spacing.xs,
  });

  return (
    <Tab.Navigator
      initialRouteName="Home"
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        // Freeze inactive tabs to pause background re-renders from live data
        freezeOnBlur: true,
        // Hide per-screen headers; icons + labels come from TabIcon + tabBarLabelStyle
        headerShown: false,
        tabBarIcon: ({ focused, color }) => (
          <TabIcon routeName={route.name} focused={focused} color={color} size={22} />
        ),
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: theme.tabBarBackground,
            borderTopColor: theme.tabBarBorder,
            height: tabBarHeight,
            paddingBottom: tabBarPaddingBottom,
          },
        ],
        tabBarLabelStyle: styles.tabBarLabel,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="News" component={NewsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  // Thin top divider, no shadow on Android
  tabBar: {
    borderTopWidth: 1,
    paddingTop: spacing.xs,
    elevation: 0,
  },
  tabBarLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
  },
});

