import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import AppText from '../common/AppText';
import StockInteractiveChart, { formatCandleDate } from './StockInteractiveChart';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import { layoutStyles } from '../../styles';
import { getDecimals, getCurrency, isNonStockSecurity } from '../../utils/securityUtils';

const TIMEFRAME_SUFFIXES = {
  '1H': 'last hour',
  '1D': null,
  '1W': 'last week',
  '3M': 'last 3 months',
  '1Y': 'last year',
  '5Y': 'last 5 years',
  'ALL': 'since start',
};

const CHART_UPDATE_THROTTLE_MS = 10000;

/**
 * Throttles incoming live WebSocket price updates so that each chart updates
 * at a maximum of once every 10 seconds, and does not update if the price has not changed.
 */
function useThrottledChartPrice(liveWsPrice, chartKey) {
  const isPos = (n) => typeof n === 'number' && !isNaN(n) && n > 0;
  const validLivePrice = isPos(liveWsPrice) ? liveWsPrice : null;

  const [chartPrice, setChartPrice] = useState(validLivePrice);

  const throttleRef = useRef({
    lastUpdateTime: 0,
    lastAppliedPrice: validLivePrice,
    pendingPrice: null,
    timer: null,
    activeChartKey: chartKey,
  });

  // When chartKey (stock symbol or timeframe) changes, immediately reset and display fresh for the new chart
  useEffect(() => {
    if (throttleRef.current.timer) {
      clearTimeout(throttleRef.current.timer);
      throttleRef.current.timer = null;
    }
    throttleRef.current.activeChartKey = chartKey;
    throttleRef.current.lastUpdateTime = Date.now();
    throttleRef.current.lastAppliedPrice = validLivePrice;
    throttleRef.current.pendingPrice = null;
    setChartPrice(validLivePrice);
  }, [chartKey]);

  // When liveWsPrice changes
  useEffect(() => {
    if (!validLivePrice) return;

    const state = throttleRef.current;

    // Initial price assignment if not set
    if (state.lastAppliedPrice == null) {
      state.lastAppliedPrice = validLivePrice;
      state.lastUpdateTime = Date.now();
      state.pendingPrice = null;
      setChartPrice(validLivePrice);
      return;
    }

    // Do not update if the price has not changed
    if (Math.abs(validLivePrice - state.lastAppliedPrice) < 0.000001) {
      // If a pending update was waiting but current price reverted back to last applied,
      // cancel the pending update
      state.pendingPrice = null;
      return;
    }

    const now = Date.now();
    const elapsed = now - state.lastUpdateTime;

    if (elapsed >= CHART_UPDATE_THROTTLE_MS) {
      // 10+ seconds have passed: update immediately
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      state.lastUpdateTime = now;
      state.lastAppliedPrice = validLivePrice;
      state.pendingPrice = null;
      setChartPrice(validLivePrice);
    } else {
      // Less than 10 seconds: throttle and schedule trailing update
      state.pendingPrice = validLivePrice;
      if (!state.timer) {
        const remaining = CHART_UPDATE_THROTTLE_MS - elapsed;
        state.timer = setTimeout(() => {
          state.timer = null;
          const target = state.pendingPrice;
          if (
            typeof target === 'number' &&
            !isNaN(target) &&
            target > 0 &&
            Math.abs(target - state.lastAppliedPrice) >= 0.000001
          ) {
            state.lastUpdateTime = Date.now();
            state.lastAppliedPrice = target;
            state.pendingPrice = null;
            setChartPrice(target);
          } else {
            state.pendingPrice = null;
          }
        }, remaining);
      }
    }
  }, [validLivePrice]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (throttleRef.current.timer) {
        clearTimeout(throttleRef.current.timer);
        throttleRef.current.timer = null;
      }
    };
  }, []);

  return chartPrice;
}

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
  isNonStock: isNonStockProp,
}) {
  const { theme } = useTheme();
  const [scrubData, setScrubData] = useState(null);

  const isNonStock = Boolean(
    isNonStockProp ||
    stock?.isNonStock ||
    stock?.isStock === false ||
    (stock?.symbol && isNonStockSecurity(stock.symbol))
  );

  const isMarketOpen = isNonStock ? true : Boolean(marketStatus?.isOpen);

  const handleScrub = useCallback((curr, prev) => {
    setScrubData(curr ? { current: curr, prev } : null);
  }, []);

  const handleScrubEnd = useCallback(() => {
    setScrubData(null);
  }, []);

  const isPos = (n) => typeof n === 'number' && !isNaN(n) && n > 0;

  const regularClosePrice =
    (isPos(chartData?.regularMarketPrice) ? chartData.regularMarketPrice : null) ??
    (isPos(stock?.regularMarketPrice) ? stock.regularMarketPrice : null) ??
    (isPos(stock?.price) ? stock.price : null) ??
    (isPos(chartData?.currentPrice) ? chartData.currentPrice : 0);

  const chartKey = `${stock?.symbol || ''}_${activeDisplayedTimeframe}`;
  const chartWsPrice = useThrottledChartPrice(liveWsPrice, chartKey);
  const effectiveWsPrice = isPos(chartWsPrice) ? chartWsPrice : null;

  const leftPrice = isMarketOpen
    ? (effectiveWsPrice ?? (isPos(stock?.price) ? stock.price : null) ?? (isPos(chartData?.currentPrice) ? chartData.currentPrice : null) ?? regularClosePrice)
    : regularClosePrice;

  const curSymbol = stock?.currency !== undefined ? stock.currency : getCurrency(stock?.symbol, '$');
  const decimals = getDecimals(stock?.symbol, leftPrice, stock?.decimals);

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
      ? (isNonStock ? 'today' : marketStatus?.suffix)
      : TIMEFRAME_SUFFIXES[activeDisplayedTimeframe] || 'since start';

  const isPreMarket = marketStatus?.isPreMarket;
  const targetChartExtPrice = isPreMarket
    ? (isPos(chartData?.preMarketPrice) && Math.abs(chartData.preMarketPrice - regularClosePrice) > 0.000001 ? chartData.preMarketPrice : null) ??
      (isPos(chartData?.postMarketPrice) && Math.abs(chartData.postMarketPrice - regularClosePrice) > 0.000001 ? chartData.postMarketPrice : null)
    : (isPos(chartData?.postMarketPrice) && Math.abs(chartData.postMarketPrice - regularClosePrice) > 0.000001 ? chartData.postMarketPrice : null) ??
      (isPos(chartData?.preMarketPrice) && Math.abs(chartData.preMarketPrice - regularClosePrice) > 0.000001 ? chartData.preMarketPrice : null);

  const targetStockExtPrice = isPreMarket
    ? (isPos(stock?.preMarketPrice) ? stock.preMarketPrice : null) ??
      (isPos(stock?.postMarketPrice) ? stock.postMarketPrice : null)
    : (isPos(stock?.postMarketPrice) ? stock.postMarketPrice : null) ??
      (isPos(stock?.preMarketPrice) ? stock.preMarketPrice : null);

  const outOfHoursPriceVal =
    effectiveWsPrice ??
    (isPos(latestExtendedPrice) ? latestExtendedPrice : null) ??
    targetChartExtPrice ??
    targetStockExtPrice ??
    regularClosePrice;

  const outOfHoursChangeVal = isPos(outOfHoursPriceVal) && isPos(regularClosePrice)
    ? outOfHoursPriceVal - regularClosePrice
    : 0;
  const outOfHoursChangePercentVal =
    isPos(regularClosePrice) ? (outOfHoursChangeVal / regularClosePrice) * 100 : 0;

  const isOutOfHoursPositive = outOfHoursChangeVal >= 0;
  const outOfHoursTrendColor = isOutOfHoursPositive ? '#00D084' : '#FF4D4F';

  const afterHoursPriceStr = isPos(outOfHoursPriceVal)
    ? outOfHoursPriceVal.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : '-';

  const afterHoursChangeStr = isPos(outOfHoursPriceVal) && isPos(regularClosePrice)
    ? `${isOutOfHoursPositive ? '+' : '-'}${curSymbol}${Math.abs(
        outOfHoursChangeVal
      ).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })} (${Math.abs(outOfHoursChangePercentVal).toFixed(2)}%) since close`
    : '-';

  const baseSparklineData = chartData?.sparkline || stock?.sparkline || [];
  const activeEndPrice = isMarketOpen ? leftPrice : outOfHoursPriceVal;

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
            isNonStock || isMarketOpen
              ? styles.mainPriceColOpen
              : styles.mainPriceColClosed
          }
        >
          <AppText
            style={[
              styles.mainPriceText,
              !isMarketOpen && !scrubData && { color: theme.textSecondary },
            ]}
            adjustsFontSizeToFit={true} numberOfLines={1}
          >
            {curSymbol}
            {displayedMainPrice.toLocaleString(undefined, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
          </AppText>

          <View style={styles.mainReturnRow}>
            {scrubData?.current ? (
              <>
                <AppText bold style={[styles.changeText, { color: scrubTrendColor }]}>
                  {isScrubPositive ? '+' : '-'}
                  {curSymbol}
                  {Math.abs(scrubDelta).toLocaleString(undefined, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
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
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
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
        {!isNonStock && (
          <TouchableOpacity
            style={
              marketStatus?.isOpen
                ? styles.afterHoursColOpen
                : styles.afterHoursColClosed
            }
            onPress={onOpenCalendar}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View US Market Calendar"
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
        )}
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
