import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import NewsScreen from '../screens/NewsScreen';
import TabIcon from '../components/common/TabIcon';
import { useTheme } from '../context/ThemeContext';
import { spacing, fonts } from '../constants/theme';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
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
  tabBar: {
    borderTopWidth: 1,
    height: Platform.OS === 'android' ? 68 : 88,
    paddingTop: spacing.xs,
    paddingBottom: Platform.OS === 'android' ? spacing.sm : spacing.lg,
    elevation: 0,
  },
  tabBarLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
  },
});
