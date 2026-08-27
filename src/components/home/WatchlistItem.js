import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import AppText from '../common/AppText';
import Sparkline from './Sparkline';
import CompanyLogo from '../common/CompanyLogo';

export default function WatchlistItem({ item, onPress }) {
  const { theme } = useTheme();

  const isPositive = (item.changePercent ?? 0) >= 0;
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
        <CompanyLogo
          symbol={item.symbol}
          logoUri={item.logo}
          size={32}
        />

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

      {/* Middle: Sparkline Chart with smoothing 4 */}
      <View style={styles.chartSection}>
        <Sparkline
          data={item.sparkline}
          color={trendColor}
          strokeWidth={2}
          smoothing={4}
        />
      </View>

      {/* Right: Price & Percent Change */}
      <View style={styles.rightSection}>
        <AppText style={styles.priceText}>
          {item.currency || '$'}
          {(item.price ?? 0).toLocaleString('en-GB', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </AppText>
        <AppText style={[styles.changeText, { color: trendColor }]}>
          {isPositive ? '+' : '-'}
          {Math.abs(item.changePercent ?? 0).toFixed(2)}%
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
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
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
    fontSize: 17,
    letterSpacing: 0.2,
  },
  changeText: {
    fontSize: 12,
  },
});
