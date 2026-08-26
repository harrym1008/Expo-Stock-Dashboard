import React, { useState, useEffect } from 'react';
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
import { getMarketSessionStatus } from '../../utils/marketHours';
import AppText from '../common/AppText';
import Sparkline from '../home/Sparkline';

const TIMEFRAMES = ['1D', '1W', '3M', '1Y', '5Y', 'ALL'];

export default function StockDetailModal({ visible, stock, onClose }) {
  const { theme, isDark } = useTheme();
  const { fetchHistoricalChart } = useMarketData();
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('3M');
  const [chartData, setChartData] = useState(null);
  const [marketStatus, setMarketStatus] = useState(getMarketSessionStatus());
  const [imageError, setImageError] = useState(false);

  // Periodically refresh market status
  useEffect(() => {
    setMarketStatus(getMarketSessionStatus());
    const timer = setInterval(() => {
      setMarketStatus(getMarketSessionStatus());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Reset image error on stock change
  useEffect(() => {
    setImageError(false);
  }, [stock?.symbol]);

  // Fetch real historical chart data from Yahoo Finance on modal open or timeframe switch
  useEffect(() => {
    let isMounted = true;
    if (visible && stock?.symbol) {
      fetchHistoricalChart(stock.symbol, selectedTimeframe).then((data) => {
        if (isMounted && data) {
          setChartData(data);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [visible, stock?.symbol, selectedTimeframe, fetchHistoricalChart]);

  if (!stock) return null;

  const isPositive = (stock.changePercent ?? 0) >= 0;
  const trendColor = isPositive ? '#00D084' : '#FF4D4F';

  // Real or fallback sparkline series
  const sparklineData =
    chartData?.sparkline ||
    stock.sparkline || [210, 208, 209, 206, 207, 205, 208, 207, 209, 208, 210, 209, 212.18];

  // Dynamic Y-Axis scale calculation based on real chart prices
  const minP = chartData ? chartData.minPrice : Math.min(...sparklineData);
  const maxP = chartData ? chartData.maxPrice : Math.max(...sparklineData);
  const step = (maxP - minP) / 7 || 5;
  const yLabels = Array.from({ length: 8 }, (_, i) => (maxP - i * step).toFixed(2));

  // Extended / Out-of-hours calculation
  const outOfHoursPriceVal =
    chartData?.postMarketPrice ||
    chartData?.preMarketPrice ||
    (stock.price ? stock.price - 1.0 : 211.18);

  const outOfHoursChangeVal =
    chartData?.postMarketChange ||
    chartData?.preMarketChange ||
    -1.0;

  const outOfHoursChangePercentVal =
    chartData?.postMarketChangePercent ||
    chartData?.preMarketChangePercent ||
    -0.43;

  const isOutOfHoursPositive = outOfHoursChangeVal >= 0;
  const outOfHoursTrendColor = isOutOfHoursPositive ? '#00D084' : '#FF4D4F';

  const afterHoursPriceStr = outOfHoursPriceVal.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const afterHoursChangeStr = `${isOutOfHoursPositive ? '+' : '-'}$${Math.abs(
    outOfHoursChangeVal
  ).toFixed(2)} (${Math.abs(outOfHoursChangePercentVal).toFixed(2)}%) since close`;

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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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

              {/* 2. Price & Market Status Row (Dual Column) */}
              <View style={styles.priceRow}>
                {/* Left: Main Trading Session */}
                <View style={styles.mainPriceCol}>
                  <AppText style={styles.mainPriceText}>
                    {stock.currency || '$'}
                    {(stock.price ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </AppText>
                  <AppText style={[styles.changeText, { color: trendColor }]}>
                    {isPositive ? '+' : '-'}
                    {stock.currency || '$'}
                    {stock.change
                      ? Math.abs(stock.change).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : '?'} ({Math.abs(stock.changePercent ?? 0.54).toFixed(2)}%) {marketStatus.suffix}
                  </AppText>
                </View>

                {/* Right: Extended Session or Market Open Indicator */}
                <View style={styles.afterHoursCol}>
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
                </View>
              </View>

              {/* 3. Real Timeframe Chart Area */}
              <View style={[styles.chartContainer, { backgroundColor: isDark ? '#050608' : '#F9FAFC' }]}>
                <View style={styles.chartInner}>
                  <Sparkline
                    data={sparklineData}
                    color={trendColor}
                    strokeWidth={2.5}
                    style={styles.chartSparkline}
                  />

                  {/* Horizontal Reference Line with Cyan Price Tag */}
                  <View style={[styles.referenceLine, { borderColor: '#00A3FF' }]}>
                    <View style={styles.priceTagBadge}>
                      <AppText bold style={styles.priceTagText}>
                        {(stock.price ?? 0).toLocaleString(undefined, {
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

              {/* 4. Timeframe Selector Pills */}
              <View style={styles.timeframeRow}>
                {TIMEFRAMES.map((tf) => {
                  const isActive = tf === selectedTimeframe;
                  return (
                    <TouchableOpacity
                      key={tf}
                      style={[
                        styles.timeframePill,
                        isActive
                          ? { backgroundColor: isDark ? '#4A4A4A' : '#D0D5DD' }
                          : { backgroundColor: isDark ? '#14171E' : '#E8ECF2' },
                      ]}
                      onPress={() => setSelectedTimeframe(tf)}
                      activeOpacity={0.7}
                    >
                      <AppText
                        bold={isActive}
                        style={[
                          styles.timeframeText,
                          {
                            color: isActive ? theme.textPrimary : theme.textSecondary,
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
          </SafeAreaView>
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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
    gap: spacing.sm,
  },
  mainPriceCol: {
    flex: 1.1,
  },
  mainPriceText: {
    fontSize: 32,
    letterSpacing: -0.5,
  },
  changeText: {
    fontSize: 13,
    marginTop: 4,
  },
  afterHoursCol: {
    flex: 1.3,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  marketOpenBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    gap: spacing.xs * 1.5,
  },
  timeframePill: {
    flex: 1,
    paddingVertical: spacing.sm * 0.8,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeframeText: {
    fontSize: 14,
  },
});
