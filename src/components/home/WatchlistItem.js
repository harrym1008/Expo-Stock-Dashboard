import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import AppText from '../common/AppText';
import Sparkline from './Sparkline';

export default function WatchlistItem({ item, onPress }) {
  const { theme } = useTheme();
  const isPositive = item.changePercent >= 0;
  const trendColor = isPositive ? '#00D084' : '#FF4D4F';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      {/* Left: Logo & Company Info */}
      <View style={styles.leftSection}>
        <View style={[styles.logoContainer, { backgroundColor: '#FFFFFF' }]}>
          {item.symbol === 'NVDA' ? (
            <Ionicons name="hardware-chip" size={22} color="#76B900" />
          ) : item.symbol === 'AAPL' ? (
            <Ionicons name="logo-apple" size={22} color="#000000" />
          ) : item.symbol === 'MSFT' ? (
            <Ionicons name="logo-windows" size={20} color="#00A4EF" />
          ) : item.symbol === 'TSLA' ? (
            <Ionicons name="car-sport" size={20} color="#E82127" />
          ) : (
            <AppText bold style={[styles.logoFallbackText, { color: '#000000' }]}>
              {item.symbol.substring(0, 2)}
            </AppText>
          )}
        </View>

        <View style={styles.titleWrapper}>
          <AppText bold style={styles.symbolText}>
            {item.symbol}
          </AppText>
          <AppText
            style={[styles.nameText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {item.name}
          </AppText>
        </View>
      </View>

      {/* Middle: Sparkline Chart */}
      <View style={styles.chartSection}>
        <Sparkline
          data={item.sparkline}
          color={trendColor}
          strokeWidth={2}
        />
      </View>

      {/* Right: Price & Percent Change */}
      <View style={styles.rightSection}>
        <AppText bold style={styles.priceText}>
          {item.currency || '$'}{item.price.toFixed(2)}
        </AppText>
        <AppText bold style={[styles.changeText, { color: trendColor }]}>
          {isPositive ? '+' : '-'}
          {Math.abs(item.changePercent).toFixed(2)}%
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 3,
    gap: spacing.md,
  },
  logoContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    fontSize: 14,
  },
  titleWrapper: {
    flex: 1,
  },
  symbolText: {
    fontSize: 16,
    letterSpacing: 0.2,
  },
  nameText: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: -0.3,
    fontWeight: '100',
  },
  chartSection: {
    flex: 1.4,
    height: 36,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  rightSection: {
    flex: 1.6,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  priceText: {
    fontSize: 16,
  },
  changeText: {
    fontSize: 12,
    marginTop: 2,
  },
});
