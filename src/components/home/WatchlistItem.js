import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {FadeInLeft, FadeOutLeft, LinearTransition} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../constants/theme';
import { stockItemStyles } from '../../styles';
import AppText from '../common/AppText';
import Sparkline from './Sparkline';
import CompanyLogo from '../common/CompanyLogo';
import { getCurrency, getDecimals } from '../../utils/securityUtils';


// Animated watchlist row: logo/info, sparkline, price + % change
function WatchlistItem({ item, onPress, isEditMode = false, drag }) {
  const { theme } = useTheme();

  // Green/red based on up/down percent
  const isPositive = (item?.changePercent ?? 0) >= 0;
  const trendColor = isPositive ? '#00D084' : '#FF4D4F';

  const handlePress = () => {
    if (onPress) {
      onPress(item);
    }
  };

  // Derive display + currency/decimal fields with safe fallbacks
  const displaySymbol = item?.displaySymbol || item?.symbol || '';
  const displayName = item?.displayName || item?.name || displaySymbol;
  const curSymbol = item?.currency ?? getCurrency(item?.symbol, '$');
  const decimals = getDecimals(item?.symbol, item?.price, item?.decimals);

  return (
    <Animated.View layout={LinearTransition.duration(200)}>
      <TouchableOpacity
        style={stockItemStyles.itemContainer}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        disabled={isEditMode}
      >
        {/* Drag Handle (edit mode only) */}
        {isEditMode && (
          <Animated.View
            entering={FadeInLeft.duration(200)}
            exiting={FadeOutLeft.duration(150)}
            layout={LinearTransition.duration(200)}
          >
            <TouchableOpacity
              onLongPress={drag}
              delayLongPress={100}
              style={styles.dragHandle}
              accessibilityLabel="Drag to reorder"
            >
              <Ionicons name="reorder-three-outline" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Left: Logo & Company Info */}
        <Animated.View
          layout={LinearTransition.duration(200)}
          style={styles.leftSection}
        >
          <CompanyLogo
            symbol={displaySymbol}
            logoUri={item?.logo}
            size={32}
          />

          <View style={styles.titleWrapper}>
            <AppText bold style={stockItemStyles.symbolText}>
              {displaySymbol}
            </AppText>
            <AppText
              style={[stockItemStyles.nameText, styles.nameText, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {displayName}
            </AppText>
          </View>
        </Animated.View>

        {/* Smooth the sparkline in the home screen */}
        <View style={styles.chartSection}>
          <Sparkline
            data={item?.sparkline}
            color={trendColor}
            strokeWidth={2}
            smoothing={4}
          />
        </View>

        {/* Right: Price & Percent Change */}
        <View style={styles.rightSection}>
          <AppText style={stockItemStyles.priceText}>
            {curSymbol}
            {(item?.price ?? 0).toLocaleString('en-US', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
          </AppText>
          <AppText style={[stockItemStyles.changeText, { color: trendColor }]}>
            {isPositive ? '+' : '-'}
            {Math.abs(item?.changePercent ?? 0).toFixed(2)}%
          </AppText>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Skip rerender unless item props have actually changed
function areEqual(prevProps, nextProps) {
  if (prevProps.isEditMode !== nextProps.isEditMode) return false;
  if (prevProps.onPress !== nextProps.onPress) return false;
  if (prevProps.drag !== nextProps.drag) return false;

  const prevItem = prevProps.item;
  const nextItem = nextProps.item;
  if (prevItem === nextItem) return true;
  if (!prevItem || !nextItem) return false;

  return (
    prevItem.symbol === nextItem.symbol &&
    prevItem.displaySymbol === nextItem.displaySymbol &&
    prevItem.price === nextItem.price &&
    prevItem.changePercent === nextItem.changePercent &&
    prevItem.name === nextItem.name &&
    prevItem.displayName === nextItem.displayName &&
    prevItem.logo === nextItem.logo &&
    prevItem.currency === nextItem.currency &&
    prevItem.decimals === nextItem.decimals &&
    prevItem.sparkline === nextItem.sparkline
  );
}

export default React.memo(WatchlistItem, areEqual);

const styles = StyleSheet.create({
  dragHandle: {
    paddingRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 3,
    gap: spacing.md,
  },
  titleWrapper: {
    flex: 1,
  },
  nameText: {
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
});
