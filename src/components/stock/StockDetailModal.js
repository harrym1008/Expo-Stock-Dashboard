import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { spacing, borderRadius } from '../../constants/theme';
import { formatTimeAgo } from '../../utils/formatTimeAgo';
import { storageService } from '../../services/storageService';
import AppText from '../common/AppText';
import Sparkline from '../home/Sparkline';
import MarketCalendarModal from '../common/MarketCalendarModal';

const TIMEFRAMES = ['1H', '1D', '1W', '3M', '1Y', '5Y', 'ALL'];

const TIMEFRAME_SUFFIXES = {
  '1H': 'last hour',
  '1D': null, // Dynamic: 'today' or 'at close'
  '1W': 'last week',
  '3M': 'last 3 months',
  '1Y': 'last year',
  '5Y': 'last 5 years',
  'ALL': 'since start',
};

// Global in-memory cache for per-stock timeframe memory
const memoryStockTimeframes = {};

// Load persisted stock timeframes once on module load
storageService.getStockTimeframes().then((saved) => {
  if (saved && typeof saved === 'object') {
    Object.assign(memoryStockTimeframes, saved);
  }
});

export default function StockDetailModal({ visible, stock, onClose }) {
  const { theme, isDark } = useTheme();
  const { fetchHistoricalChart, quotes, marketStatus } = useMarketData();
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [chartData, setChartData] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [timeAgoText, setTimeAgoText] = useState('just now');
  const [calendarVisible, setCalendarVisible] = useState(false);

  // Track the latest known after-hours price across timeframe switches
  const latestExtendedPriceRef = useRef(null);

  // Initialize or restore per-stock timeframe when active stock changes
  useEffect(() => {
    setImageError(false);
    latestExtendedPriceRef.current = null;

    if (stock?.symbol) {
      const sym = stock.symbol.toUpperCase();
      const savedTf = memoryStockTimeframes[sym] || '1D';
      setSelectedTimeframe(savedTf);
    }
  }, [stock?.symbol]);

  // Handle user timeframe selection & persist preference
  const handleSelectTimeframe = (tf) => {
    setSelectedTimeframe(tf);
    if (stock?.symbol) {
      const sym = stock.symbol.toUpperCase();
      memoryStockTimeframes[sym] = tf;
      storageService.setStockTimeframe(sym, tf);
    }
  };

  // Fetch real historical chart data from Yahoo Finance on modal open or timeframe switch
  useEffect(() => {
    let isMounted = true;
    if (visible && stock?.symbol) {
      fetchHistoricalChart(stock.symbol, selectedTimeframe).then((data) => {
        if (isMounted && data) {
          setChartData(data);
          if (typeof data.postMarketPrice === 'number' && Math.abs(data.postMarketPrice - data.regularMarketPrice) > 0.001) {
            latestExtendedPriceRef.current = data.postMarketPrice;
          }
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [visible, stock?.symbol, selectedTimeframe, fetchHistoricalChart]);

  // 1-second live ticking timer for price freshness indicator
  useEffect(() => {
    if (!visible) return;

    const updateFreshness = () => {
      const cleanSym = stock?.symbol?.toUpperCase();
      const wsQuote = quotes[cleanSym] || quotes[stock?.symbol];
      const ts = wsQuote?.lastTickTime || wsQuote?.timestamp || stock?.lastUpdated || chartData?.lastUpdated;
      setTimeAgoText(formatTimeAgo(ts));
    };

    updateFreshness();
    const interval = setInterval(updateFreshness, 1000);
    return () => clearInterval(interval);
  }, [visible, stock?.lastUpdated, stock?.symbol, quotes, chartData?.lastUpdated]);

  // Calculate stock trading age to disable unsupported timeframe buttons (e.g. recent IPOs)
  const isTimeframeDisabled = useMemo(() => {
    const firstTrade = chartData?.firstTradeDate || null;
    if (!firstTrade) {
      return () => false;
    }

    const stockAgeMs = Date.now() - firstTrade;
    const DAY_MS = 24 * 60 * 60 * 1000;

    return (tf) => {
      if (tf === '1W') return stockAgeMs < 5 * DAY_MS;
      if (tf === '3M') return stockAgeMs < 60 * DAY_MS;
      if (tf === '1Y') return stockAgeMs < 300 * DAY_MS;
      if (tf === '5Y') return stockAgeMs < 4 * 365 * DAY_MS;
      return false; // 1H, 1D, and ALL are always enabled
    };
  }, [chartData?.firstTradeDate]);

  // Auto-switch to ALL if current selected timeframe is disabled for this stock
  useEffect(() => {
    if (isTimeframeDisabled(selectedTimeframe)) {
      handleSelectTimeframe('ALL');
    }
  }, [selectedTimeframe, isTimeframeDisabled]);

  if (!stock) return null;

  // The displayed timeframe is strictly tied to chartData.timeframe to eliminate text-before-data mismatch
  const activeDisplayedTimeframe = chartData?.timeframe || selectedTimeframe;

  // Live WebSocket trade tick price (ONLY if genuine isLiveWs is true)
  const cleanSymbol = stock.symbol?.toUpperCase();
  const wsQuote = quotes[cleanSymbol] || quotes[stock.symbol];
  const liveWsPrice = (wsQuote?.isLiveWs && typeof wsQuote?.price === 'number') ? wsQuote.price : null;

  if (liveWsPrice) {
    latestExtendedPriceRef.current = liveWsPrice;
  }

  // 1. LEFT SIDE: Regular Market Hours Price & Return
  const regularClosePrice =
    chartData?.regularMarketPrice || stock.regularMarketPrice || stock.price || chartData?.currentPrice || 0;

  const leftPrice = marketStatus.isOpen
    ? (liveWsPrice ?? stock.price ?? chartData?.currentPrice ?? regularClosePrice)
    : regularClosePrice;

  const effectiveChange = chartData?.priceChange ?? stock.change ?? 0;
  const effectiveChangePercent = chartData?.priceChangePercent ?? stock.changePercent ?? 0;

  const isTimeframePositive = (effectiveChange ?? 0) >= 0;
  const timeframeTrendColor = isTimeframePositive ? '#00D084' : '#FF4D4F';

  // Dynamic suffix matches the active displayed timeframe
  const timeframeSuffix =
    activeDisplayedTimeframe === '1D'
      ? marketStatus.suffix
      : TIMEFRAME_SUFFIXES[activeDisplayedTimeframe] || 'since start';

  // 2. RIGHT SIDE: Always preserves the highest-fidelity after-hours price across all timeframes
  const outOfHoursPriceVal =
    liveWsPrice ??
    latestExtendedPriceRef.current ??
    (chartData?.postMarketPrice && Math.abs(chartData.postMarketPrice - regularClosePrice) > 0.001 ? chartData.postMarketPrice : null) ??
    (typeof stock.postMarketPrice === 'number' ? stock.postMarketPrice : null) ??
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

  const afterHoursChangeStr = `${isOutOfHoursPositive ? '+' : '-'}$${Math.abs(
    outOfHoursChangeVal
  ).toFixed(2)} (${Math.abs(outOfHoursChangePercentVal).toFixed(2)}%) since close`;

  // 3. Dynamic Sparkline: Always overlays the live active price onto the endmost point
  const baseSparklineData = chartData?.sparkline || stock.sparkline || [];
  const activeEndPrice = marketStatus.isOpen ? leftPrice : outOfHoursPriceVal;

  const sparklineData =
    typeof activeEndPrice === 'number' && baseSparklineData.length > 0
      ? [...baseSparklineData.slice(0, -1), activeEndPrice]
      : baseSparklineData;

  // Dynamic Y-Axis scale calculation based on real chart prices including live tick
  const minP = chartData && sparklineData.length > 0
    ? Math.min(chartData.minPrice ?? activeEndPrice, ...sparklineData)
    : 0;
  const maxP = chartData && sparklineData.length > 0
    ? Math.max(chartData.maxPrice ?? activeEndPrice, ...sparklineData)
    : 100;
  const step = (maxP - minP) / 7 || 5;
  const yLabels = Array.from({ length: 8 }, (_, i) => (maxP - i * step).toFixed(2));

  const placeholderLogoUri = `https://placehold.co/128x128/FFFFFF/000000.png?text=${encodeURIComponent(
    stock.symbol || 'ST'
  )}`;

  const logoUri = !imageError && stock.logo ? stock.logo : placeholderLogoUri;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Top Gap - Tapping here dismisses the modal */}
        <TouchableOpacity
          style={styles.topBackdropGap}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Sheet Container */}
        <View
          style={[
            styles.sheetContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <SafeAreaView
            style={[styles.safeArea, { backgroundColor: theme.background }]}
            edges={['bottom', 'left', 'right']}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.scrollFlex}
              contentContainerStyle={styles.scrollContent}
            >
              {/* 1. Header Row */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={[styles.logoContainer, { backgroundColor: '#FFFFFF' }]}>
                    <Image
                      source={{ uri: logoUri }}
                      style={styles.logoImage}
                      resizeMode="cover"
                      onError={() => setImageError(true)}
                    />
                  </View>

                  <View style={styles.titleInfo}>
                    <View style={styles.symbolRow}>
                      <AppText bold style={styles.symbolText}>
                        {stock.symbol}
                      </AppText>
                      <AppText style={[styles.exchangeText, { color: theme.textSecondary }]}>
                        {' - '}{stock.exchange || 'NASDAQ'}
                      </AppText>
                    </View>
                    <AppText style={[styles.companyText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {stock.name}
                    </AppText>
                  </View>
                </View>

                <View style={styles.headerActions}>
                  <TouchableOpacity
                    onPress={() => setIsFavorite((prev) => !prev)}
                    style={styles.actionBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Favorite"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={isFavorite ? 'star' : 'star-outline'}
                      size={22}
                      color={isFavorite ? '#FFD700' : theme.textPrimary}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={onClose}
                    style={styles.actionBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Close Stock Details"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={26} color={theme.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2. Price & Market Status Row (Adaptive Dual Column) */}
              <View style={styles.priceRow}>
                {/* Left: Official Regular Session Price (Fixed when Market Closed) */}
                <View
                  style={
                    marketStatus.isOpen
                      ? styles.mainPriceColOpen
                      : styles.mainPriceColClosed
                  }
                >
                  <AppText style={styles.mainPriceText}>
                    {stock.currency || '$'}
                    {leftPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </AppText>
                  <AppText style={[styles.changeText, { color: timeframeTrendColor }]}>
                    {isTimeframePositive ? '+' : '-'}
                    {stock.currency || '$'}
                    {Math.abs(effectiveChange).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    ({Math.abs(effectiveChangePercent).toFixed(2)}%) {timeframeSuffix}
                  </AppText>
                </View>

                {/* Right: Extended Session or Market Open Indicator (Tap to open Market Calendar) */}
                <TouchableOpacity
                  style={
                    marketStatus.isOpen
                      ? styles.afterHoursColOpen
                      : styles.afterHoursColClosed
                  }
                  onPress={() => setCalendarVisible(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View US Market Calendar & Holidays"
                >
                  {marketStatus.isOpen ? (
                    <View style={styles.marketOpenBadgeContainer}>
                      <View style={[styles.statusDot, { backgroundColor: marketStatus.color }]} />
                      <AppText bold style={[styles.afterHoursLabel, { color: marketStatus.color }]}>
                        {marketStatus.label}
                      </AppText>
                    </View>
                  ) : (
                    <>
                      <AppText style={styles.afterHoursPriceText}>
                        {stock.currency || '$'}{afterHoursPriceStr}
                      </AppText>
                      <AppText
                        numberOfLines={1}
                        style={[styles.afterHoursChangeText, { color: outOfHoursTrendColor }]}
                      >
                        {afterHoursChangeStr}
                      </AppText>
                      <AppText italic bold style={[styles.afterHoursLabel, { color: marketStatus.color }]}>
                        {marketStatus.label}
                      </AppText>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* 3. Real Timeframe Chart Area */}
              <View style={[styles.chartContainer, { backgroundColor: isDark ? '#050608' : '#F9FAFC' }]}>
                <View style={styles.chartInner}>
                  <Sparkline
                    data={sparklineData}
                    color={timeframeTrendColor}
                    strokeWidth={2.5}
                    style={styles.chartSparkline}
                  />

                  {/* Horizontal Reference Line with Cyan Price Tag */}
                  <View style={[styles.referenceLine, { borderColor: '#00A3FF' }]}>
                    <View style={styles.priceTagBadge}>
                      <AppText bold style={styles.priceTagText}>
                        {activeEndPrice.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </AppText>
                    </View>
                  </View>
                </View>

                {/* Right-hand Y-Axis Price Labels */}
                <View style={styles.yAxisLabels}>
                  {yLabels.map((priceStr, idx) => (
                    <AppText key={idx} style={[styles.yAxisText, { color: theme.textMuted }]}>
                      {priceStr}
                    </AppText>
                  ))}
                </View>
              </View>

              {/* 4. Timeframe Selector Pills (includes 1H) */}
              <View style={styles.timeframeRow}>
                {TIMEFRAMES.map((tf) => {
                  const isActive = tf === selectedTimeframe;
                  const disabled = isTimeframeDisabled(tf);

                  return (
                    <TouchableOpacity
                      key={tf}
                      disabled={disabled}
                      style={[
                        styles.timeframePill,
                        disabled
                          ? {
                              backgroundColor: isDark ? '#101318' : '#ECEFF4',
                              opacity: 0.35,
                            }
                          : isActive
                          ? { backgroundColor: isDark ? '#4A4A4A' : '#D0D5DD' }
                          : { backgroundColor: isDark ? '#14171E' : '#E8ECF2' },
                      ]}
                      onPress={() => handleSelectTimeframe(tf)}
                      activeOpacity={disabled ? 1 : 0.7}
                    >
                      <AppText
                        bold={isActive}
                        style={[
                          styles.timeframeText,
                          {
                            color: disabled
                              ? theme.textMuted
                              : isActive
                              ? theme.textPrimary
                              : theme.textSecondary,
                          },
                        ]}
                      >
                        {tf}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* 5. Anchored Bottom Price Freshness Indicator */}
            <View
              style={[
                styles.anchoredFooter,
                {
                  borderTopColor: isDark
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'rgba(0, 0, 0, 0.05)',
                },
              ]}
            >
              <AppText style={[styles.lastUpdatedText, { color: theme.textMuted }]}>
                Latest price updated {timeAgoText}
              </AppText>
            </View>
          </SafeAreaView>

          {/* Market Hours & Holiday Calendar Overlay */}
          <MarketCalendarModal
            visible={calendarVisible}
            onClose={() => setCalendarVisible(false)}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  topBackdropGap: {
    height: 60,
    width: '100%',
  },
  sheetContainer: {
    flex: 1,
    borderTopLeftRadius: borderRadius.md + 6,
    borderTopRightRadius: borderRadius.md + 6,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  logoContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  titleInfo: {
    flex: 1,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  symbolText: {
    fontSize: 20,
    letterSpacing: 0.3,
  },
  exchangeText: {
    fontSize: 12,
  },
  companyText: {
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md * 2,
  },
  actionBtn: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  mainPriceColOpen: {
    flex: 1,
  },
  mainPriceColClosed: {
    flex: 1.4,
  },
  mainPriceText: {
    fontSize: 32,
    letterSpacing: -0.5,
  },
  changeText: {
    fontSize: 13,
    marginTop: 4,
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
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
  chartContainer: {
    height: 240,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  chartInner: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
    paddingVertical: spacing.md,
  },
  chartSparkline: {
    flex: 1,
    width: '100%',
  },
  referenceLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '55%',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  priceTagBadge: {
    backgroundColor: '#00A3FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: -10,
    marginRight: 4,
  },
  priceTagText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  yAxisLabels: {
    width: 52,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.04)',
  },
  yAxisText: {
    fontSize: 10,
  },
  timeframeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  timeframePill: {
    flex: 1,
    paddingVertical: spacing.sm * 0.8,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeframeText: {
    fontSize: 13,
  },
  anchoredFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  lastUpdatedText: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
