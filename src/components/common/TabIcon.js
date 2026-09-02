import { Ionicons } from '@expo/vector-icons';

// Map a route to its focused and outline icon names for the tab bar
const iconMap = {
  Home: { focused: 'home', outline: 'home-outline' },
  Search: { focused: 'search', outline: 'search-outline' },
  Portfolio: { focused: 'stats-chart', outline: 'stats-chart-outline' },
  News: { focused: 'newspaper', outline: 'newspaper-outline' },
};

// Icon in the bottom tab bar
export default function TabIcon({ routeName, focused, color, size = 22 }) {
  const iconConfig = iconMap[routeName] || { focused: 'apps', outline: 'apps-outline' };
  const iconName = focused ? iconConfig.focused : iconConfig.outline;
  return <Ionicons name={iconName} size={size} color={color} />;
}
