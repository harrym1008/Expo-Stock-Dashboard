import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import AppText from '../common/AppText';
import StockInteractiveChart, { formatCandleDate } from './StockInteractiveChart';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import { layoutStyles } from '../../styles';

const TIMEFRAME_SUFFIXES = {
  '1H': 'last hour',
  '1D': null,
  '1W': 'last week',
  '3M': 'last 3 months',
  '1Y': 'last year',
  '5Y': 'last 5 years',
  'ALL': 'since start',
};

function StockDetailChartSection({
  stock,
  chartData,
  liveWsPrice,
  latestExtendedPrice,
  marketStatus,
  activeDisplayedTimeframe = '1D',
  isInitialStockLoading = false,
  isTimeframeLoading = false,
  onOpenCalendar,
}) {
  const { theme } = useTheme();
  const [scrubData, setScrubData] = useState(null);

  const handleScrub = useCallback((curr, prev) => {
    setScrubData(curr ? { current: curr, prev } : null);
  }, []);

  const handleScrubEnd = useCallback(() => {
    setScrubData(null);
  }, []);

  const curSymbol = stock?.currency === 'USD' || !stock?.currency ? '$' : stock.currency;

  const regularClosePrice =
    chartData?.regularMarketPrice || stock?.regularMarketPrice || stock?.price || chartData?.currentPrice || 0;

  const leftPrice = marketStatus?.isOpen
    ? (liveWsPrice ?? stock?.price ?? chartData?.currentPrice ?? regularClosePrice)
    : regularClosePrice;

  const baseComparison =
    activeDisplayedTimeframe === '1D'
      ? (chartData?.previousClose || stock?.previousClose || regularClosePrice)
      : (chartData?.startPrice || chartData?.sparkline?.[0] || stock?.sparkline?.[0] || regularClosePrice);

  const displayedMainPrice = scrubData?.current?.price ?? leftPrice;
  const periodChange = chartData?.priceChange ?? stock?.change ?? (leftPrice - baseComparison);
  const periodChangePercent =
    baseComparison !== 0
      ? (periodChange / baseComparison) * 100
      : (chartData?.priceChangePercent ?? stock?.changePercent ?? 0);

  const isPeriodPositive = (periodChange ?? 0) >= 0;
  const timeframeTrendColor = isPeriodPositive ? '#00D084' : '#FF4D4F';

  let scrubDelta = 0;
  let scrubDeltaPercent = 0;
  let isScrubPositive = true;

  if (scrubData?.current) {
    const currP = scrubData.current.price;
    const prevP = scrubData.prev ? scrubData.prev.price : currP;
    scrubDelta = currP - prevP;
    scrubDeltaPercent = prevP !== 0 ? (scrubDelta / prevP) * 100 : 0;
    isScrubPositive = scrubDelta >= 0;
  }

  const scrubTrendColor = isScrubPositive ? '#00D084' : '#FF4D4F';

  const timeframeSuffix =
    activeDisplayedTimeframe === '1D'
      ? marketStatus?.suffix
      : TIMEFRAME_SUFFIXES[activeDisplayedTimeframe] || 'since start';

  const outOfHoursPriceVal =
    liveWsPrice ??
    latestExtendedPrice ??
    (chartData?.postMarketPrice && Math.abs(chartData.postMarketPrice - regularClosePrice) > 0.001 ? chartData.postMarketPrice : null) ??
    (typeof stock?.postMarketPrice === 'number' ? stock.postMarketPrice : null) ??
    regularClosePrice;

  const outOfHoursChangeVal = outOfHoursPriceVal - regularClosePrice;
  const outOfHoursChangePercentVal =
    regularClosePrice !== 0 ? (outOfHoursChangeVal / regularClosePrice) * 100 : 0;

  const isOutOfHoursPositive = outOfHoursChangeVal >= 0;
  const outOfHoursTrendColor = isOutOfHoursPositive ? '#00D084' : '#FF4D4F';

  const afterHoursPriceStr = outOfHoursPriceVal.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const afterHoursChangeStr = `${isOutOfHoursPositive ? '+' : '-'}${curSymbol}${Math.abs(
    outOfHoursChangeVal
  ).toFixed(2)} (${Math.abs(outOfHoursChangePercentVal).toFixed(2)}%) since close`;

  const baseSparklineData = chartData?.sparkline || stock?.sparkline || [];
  const activeEndPrice = marketStatus?.isOpen ? leftPrice : outOfHoursPriceVal;

  const sparklineData = useMemo(() => {
    return typeof activeEndPrice === 'number' && baseSparklineData.length > 0
      ? [...baseSparklineData.slice(0, -1), activeEndPrice]
      : baseSparklineData;
  }, [baseSparklineData, activeEndPrice]);

  const chartPointsWithLiveOverlay = useMemo(() => {
    return chartData?.points && chartData.points.length > 0 && typeof activeEndPrice === 'number'
      ? [
          ...chartData.points.slice(0, -1),
          {
            ...chartData.points[chartData.points.length - 1],
            price: activeEndPrice,
          },
        ]
      : chartData?.points || [];
  }, [chartData?.points, activeEndPrice]);

  const animatedChartStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isTimeframeLoading ? 0.2 : 1.0, { duration: 300 }),
    };
  }, [isTimeframeLoading]);

  const animatedOverlayStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isTimeframeLoading ? 0.8 : 0.0, { duration: 300 }),
    };
  }, [isTimeframeLoading]);

  return (
    <View>
      {/* Price & Market Status Row (Adaptive Dual Column) */}
      <View style={styles.priceRow}>
        {/* Left: Official Regular Session Price (or Scrubbed Candle Price) */}
        <View
          style={
            marketStatus?.isOpen
              ? styles.mainPriceColOpen
              : styles.mainPriceColClosed
          }
        >
          <AppText
            style={[
              styles.mainPriceText,
              !marketStatus?.isOpen && !scrubData && { color: theme.textSecondary },
            ]}
          >
            {curSymbol}
            {displayedMainPrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </AppText>

          <View style={styles.mainReturnRow}>
            {scrubData?.current ? (
              <>
                <AppText bold style={[styles.changeText, { color: scrubTrendColor }]}>
                  {isScrubPositive ? '+' : '-'}
                  {curSymbol}
                  {Math.abs(scrubDelta).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  ({Math.abs(scrubDeltaPercent).toFixed(2)}%)
                </AppText>
                <AppText style={[styles.scrubTimeLabel, { color: theme.textSecondary }]}>
                  {formatCandleDate(scrubData.current.time, activeDisplayedTimeframe)}
                </AppText>
              </>
            ) : (
              <>
                <AppText bold style={[styles.changeText, { color: timeframeTrendColor }]}>
                  {isPeriodPositive ? '+' : '-'}
                  {curSymbol}
                  {Math.abs(periodChange).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  ({Math.abs(periodChangePercent).toFixed(2)}%)
                </AppText>
                <AppText style={[styles.timeframeSuffixLabel, { color: theme.textSecondary }]}>
                  {timeframeSuffix}
                </AppText>
              </>
            )}
          </View>
        </View>

        {/* Right: Extended Session or Market Open Indicator (Tap to open Market Calendar) */}
        <TouchableOpacity
          style={
            marketStatus?.isOpen
              ? styles.afterHoursColOpen
              : styles.afterHoursColClosed
          }
          onPress={onOpenCalendar}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View US Market Calendar & Holidays"
        >
          {marketStatus?.isOpen ? (
            <View style={styles.marketOpenBadgeContainer}>
              <AppText bold style={[styles.afterHoursLabel, { color: marketStatus?.color }]}>
                {marketStatus?.label}
              </AppText>
            </View>
          ) : (
            <>
              <AppText style={styles.afterHoursPriceText}>
                {curSymbol}{afterHoursPriceStr}
              </AppText>
              <AppText
                numberOfLines={1}
                style={[styles.afterHoursChangeText, { color: outOfHoursTrendColor }]}
              >
                {afterHoursChangeStr}
              </AppText>
              <AppText italic bold style={[styles.afterHoursLabel, { color: marketStatus?.color }]}>
                {marketStatus?.label}
              </AppText>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Interactive SVG Chart Area */}
      <View
        style={[
          styles.chartCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        {isInitialStockLoading ? (
          <View style={[layoutStyles.flex1, layoutStyles.center]}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : (
          <Animated.View style={[layoutStyles.flex1, animatedChartStyle]}>
            <StockInteractiveChart
              points={chartPointsWithLiveOverlay}
              sparkline={sparklineData}
              color={timeframeTrendColor}
              timeframe={activeDisplayedTimeframe}
              onScrub={handleScrub}
              onScrubEnd={handleScrubEnd}
            />
            {/* 40% Darkening Animated Overlay during timeframe loading */}
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: '#000000' },
                animatedOverlayStyle,
              ]}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export default React.memo(StockDetailChartSection);

const styles = StyleSheet.create({
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginVertical: spacing.md,
  },
  mainPriceColOpen: {
    flex: 1,
  },
  mainPriceColClosed: {
    flex: 1.36,
  },
  mainPriceText: {
    fontSize: 32,
  },
  mainReturnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 4,
  },
  changeText: {
    fontSize: 13,
  },
  timeframeSuffixLabel: {
    fontSize: 12,
  },
  scrubTimeLabel: {
    fontSize: 12,
  },
  afterHoursColOpen: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: 6,
  },
  afterHoursColClosed: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  marketOpenBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  afterHoursPriceText: {
    fontSize: 22,
    textAlign: 'right',
  },
  afterHoursChangeText: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
  },
  afterHoursLabel: {
    fontSize: 13,
    marginTop: 3,
    textAlign: 'right',
  },
  chartCard: {
    height: 220,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
});
