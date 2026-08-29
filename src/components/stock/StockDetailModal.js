import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { useTrading } from '../../context/TradingContext';
import { spacing, borderRadius } from '../../constants/theme';
import { formatTimeAgo } from '../../utils/formatTimeAgo';
import { storageService } from '../../services/storageService';
import { useWatchlist } from '../../context/WatchlistContext';
import { modalStyles, layoutStyles, newsStyles } from '../../styles';
import AppText from '../common/AppText';
import StockInteractiveChart from './StockInteractiveChart';
import MarketCalendarModal from '../common/MarketCalendarModal';
import CompanyLogo from '../common/CompanyLogo';
import AddToWatchlistModal from './AddToWatchlistModal';
import StockOrderModal from './StockOrderModal';
import NewsCard from '../common/NewsCard';

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

function formatLargeNum(num, currency = '') {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '-';
  const abs = Math.abs(num);
  if (abs >= 1e12) {
    return `${currency}${(num / 1e12).toFixed(2)}T`;
  }
  if (abs >= 1e9) {
    return `${currency}${(num / 1e9).toFixed(2)}B`;
  }
  if (abs >= 1e6) {
    return `${currency}${(num / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e3) {
    return `${currency}${(num / 1e3).toFixed(1)}K`;
  }
  return `${currency}${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatStatPrice(val, currency = '$') {
  if (val === null || val === undefined || isNaN(val) || val === 0) return '-';
  return `${currency}${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getRangePosition(current, low, high) {
  if (
    typeof current !== 'number' ||
    typeof low !== 'number' ||
    typeof high !== 'number' ||
    high <= low
  ) {
    return 50;
  }
  const ratio = (current - low) / (high - low);
  return Math.max(0, Math.min(100, ratio * 100));
}

export default function StockDetailModal({ visible, stock, onClose }) {
  const { theme, isDark } = useTheme();
  const {
    fetchHistoricalChart,
    quotes,
    profiles,
    fetchProfile,
    fetchStockMetrics,
    fetchCompanyDescription,
    fetchCompanyNews,
    marketStatus,
    apiKey,
  } = useMarketData();
  const { isStockInAnyWatchlist } = useWatchlist();
  const { isPaperTradingEnabled } = useTrading();
  const [watchlistModalVisible, setWatchlistModalVisible] = useState(false);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [orderMode, setOrderMode] = useState('BUY');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [chartData, setChartData] = useState(null);
  const [scrubData, setScrubData] = useState(null);
  const [isInitialStockLoading, setIsInitialStockLoading] = useState(true);
  const [timeAgoText, setTimeAgoText] = useState('just now');
  const [calendarVisible, setCalendarVisible] = useState(false);

  // Additional detail states
  const [metrics, setMetrics] = useState(null);
  const [companyDesc, setCompanyDesc] = useState(null);
  const [companyNews, setCompanyNews] = useState([]);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const isFavorite = stock?.symbol ? isStockInAnyWatchlist(stock.symbol) : false;

  // Track the latest known after-hours price across timeframe switches
  const latestExtendedPriceRef = useRef(null);

  // Initialize or restore per-stock timeframe when active stock changes (first load for stock)
  useEffect(() => {
    latestExtendedPriceRef.current = null;
    setChartData(null);
    setScrubData(null);
    setMetrics(null);
    setCompanyDesc(null);
    setCompanyNews([]);
    setIsDescExpanded(false);
    setIsInitialStockLoading(true);

    if (stock?.symbol) {
      const sym = stock.symbol.toUpperCase();
      const savedTf = memoryStockTimeframes[sym] || '1D';
      setSelectedTimeframe(savedTf);
    }
  }, [stock?.symbol]);

  // Handle user timeframe selection & persist preference without flashing full-screen loader
  const handleSelectTimeframe = (tf) => {
    if (tf === selectedTimeframe) return;
    setScrubData(null);
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
      fetchHistoricalChart(stock.symbol, selectedTimeframe)
        .then((data) => {
          if (isMounted) {
            if (data) {
              setChartData(data);
              if (typeof data.postMarketPrice === 'number' && Math.abs(data.postMarketPrice - data.regularMarketPrice) > 0.001) {
                latestExtendedPriceRef.current = data.postMarketPrice;
              }
            }
            setIsInitialStockLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) setIsInitialStockLoading(false);
        });
    } else {
      setIsInitialStockLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, [visible, stock?.symbol, selectedTimeframe, fetchHistoricalChart]);

  // Fetch company profile, stock metrics, description, and news
  useEffect(() => {
    let isMounted = true;
    if (visible && stock?.symbol) {
      const sym = stock.symbol.toUpperCase();
      setIsLoadingDetails(true);

      Promise.all([
        fetchProfile(sym).catch(() => null),
        fetchStockMetrics(sym).catch(() => null),
        fetchCompanyDescription(sym).catch(() => null),
        fetchCompanyNews(sym).catch(() => []),
      ]).then(([prof, met, desc, news]) => {
        if (isMounted) {
          if (met) setMetrics(met);
          if (desc) setCompanyDesc(desc);
          if (Array.isArray(news)) setCompanyNews(news);
          setIsLoadingDetails(false);
        }
      }).catch(() => {
        if (isMounted) setIsLoadingDetails(false);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [visible, stock?.symbol, apiKey, fetchProfile, fetchStockMetrics, fetchCompanyDescription, fetchCompanyNews]);

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

  // Base comparison for timeframe return calculation
  const baseComparison =
    activeDisplayedTimeframe === '1D'
      ? (chartData?.previousClose || stock.previousClose || regularClosePrice)
      : (chartData?.startPrice || chartData?.sparkline?.[0] || stock.sparkline?.[0] || regularClosePrice);

  const displayedMainPrice = scrubData ? scrubData.current.price : leftPrice;
  const periodChange = chartData?.priceChange ?? stock.change ?? (leftPrice - baseComparison);
  const periodChangePercent =
    baseComparison !== 0
      ? (periodChange / baseComparison) * 100
      : (chartData?.priceChangePercent ?? stock.changePercent ?? 0);

  // The overall timeframe trend color stays stable based on period return (does not recolor on scrub)
  const isPeriodPositive = (periodChange ?? 0) >= 0;
  const timeframeTrendColor = isPeriodPositive ? '#00D084' : '#FF4D4F';

  // Immediate candle-over-candle change from previous point when scrubbing (no suffix)
  let scrubDelta = 0;
  let scrubDeltaPercent = 0;
  let isScrubPositive = true;

  if (scrubData) {
    const currP = scrubData.current.price;
    const prevP = scrubData.prev ? scrubData.prev.price : currP;
    scrubDelta = currP - prevP;
    scrubDeltaPercent = prevP !== 0 ? (scrubDelta / prevP) * 100 : 0;
    isScrubPositive = scrubDelta >= 0;
  }

  const scrubTrendColor = isScrubPositive ? '#00D084' : '#FF4D4F';

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

  // 3. Dynamic Sparkline & Chart Points: Always overlays the live active price onto the endmost point
  const baseSparklineData = chartData?.sparkline || stock.sparkline || [];
  const activeEndPrice = marketStatus.isOpen ? leftPrice : outOfHoursPriceVal;

  const sparklineData =
    typeof activeEndPrice === 'number' && baseSparklineData.length > 0
      ? [...baseSparklineData.slice(0, -1), activeEndPrice]
      : baseSparklineData;

  const chartPointsWithLiveOverlay =
    chartData?.points && chartData.points.length > 0 && typeof activeEndPrice === 'number'
      ? [
          ...chartData.points.slice(0, -1),
          {
            ...chartData.points[chartData.points.length - 1],
            price: activeEndPrice,
          },
        ]
      : chartData?.points || [];

  // Currency symbol
  const curSymbol = stock.currency === 'USD' || !stock.currency ? '$' : stock.currency;

  const profileData = profiles[cleanSymbol] || null;
  const companyName = profileData?.name || stock.name || stock.symbol;

  // Day Range & 52-Week Range (anchored to latest/current price, unaffected by graph scrubbing)
  const currentStatPrice = leftPrice;
  const dayLow = wsQuote?.low ?? chartData?.regularMarketDayLow ?? (chartData?.timeframe === '1D' ? chartData?.minPrice : null) ?? stock?.low ?? null;
  const dayHigh = wsQuote?.high ?? chartData?.regularMarketDayHigh ?? (chartData?.timeframe === '1D' ? chartData?.maxPrice : null) ?? stock?.high ?? null;
  const dayRangePos = getRangePosition(currentStatPrice, dayLow, dayHigh);

  const fiftyTwoLow = metrics?.['52WeekLow'] ?? metrics?.fiftyTwoWeekLow ?? chartData?.fiftyTwoWeekLow ?? null;
  const fiftyTwoHigh = metrics?.['52WeekHigh'] ?? metrics?.fiftyTwoWeekHigh ?? chartData?.fiftyTwoWeekHigh ?? null;
  const fiftyTwoRangePos = getRangePosition(currentStatPrice, fiftyTwoLow, fiftyTwoHigh);

  // 1. Previous Close
  const prevCloseVal = chartData?.previousClose ?? wsQuote?.previousClose ?? stock.previousClose ?? null;
  const prevCloseStr = prevCloseVal !== null && prevCloseVal !== undefined && !isNaN(prevCloseVal) && prevCloseVal > 0
    ? `${curSymbol}${Number(prevCloseVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '-';

  // 2. Market Cap (in millions in Finnhub metric/profile)
  const marketCapVal = metrics?.marketCapitalization ?? profileData?.marketCap ?? stock?.marketCap ?? null;
  const marketCapStr = marketCapVal !== null && marketCapVal !== undefined && !isNaN(marketCapVal) && marketCapVal > 0
    ? formatLargeNum(marketCapVal * 1e6, curSymbol)
    : '-';

  // 3. Volume (today)
  const volumeVal = chartData?.regularMarketVolume ?? wsQuote?.volume ?? null;
  const volumeStr = volumeVal !== null && volumeVal !== undefined && !isNaN(volumeVal) && volumeVal > 0
    ? formatLargeNum(volumeVal)
    : '-';

  // 4. Avg Volume (3mo) via 3MonthAverageTradingVolume (in millions of shares)
  const rawAvgVol = metrics?.['3MonthAverageTradingVolume'] ?? metrics?.avgVolume3M ?? null;
  const numAvgVol = rawAvgVol !== null && rawAvgVol !== undefined ? Number(rawAvgVol) : null;
  const avgVol3MStr = numAvgVol !== null && !isNaN(numAvgVol) && numAvgVol > 0
    ? `${numAvgVol.toFixed(2)}M`
    : '-';

  // 5. Trailing P/E (peTTM)
  const peTTM = metrics?.peTTM ?? companyDesc?.peRatio ?? null;
  const trailingPeStr = typeof peTTM === 'number' && !isNaN(peTTM) && peTTM > 0
    ? peTTM.toFixed(2)
    : '-';

  // 6. Forward P/E (forwardPE)
  const forwardPE = metrics?.forwardPE ?? companyDesc?.forwardPE ?? null;
  const forwardPeStr = typeof forwardPE === 'number' && !isNaN(forwardPE) && forwardPE > 0
    ? forwardPE.toFixed(2)
    : '-';

  // 7. Trailing EPS (epsTTM)
  const epsTTM = metrics?.epsTTM ?? companyDesc?.eps ?? null;
  const trailingEpsStr = typeof epsTTM === 'number' && !isNaN(epsTTM)
    ? `${curSymbol}${epsTTM.toFixed(2)}`
    : '-';

  // 8. Profit Margin (netProfitMarginTTM)
  const marginTTM = metrics?.netProfitMarginTTM ?? companyDesc?.profitMargin ?? null;
  const profitMarginStr = typeof marginTTM === 'number' && !isNaN(marginTTM)
    ? `${marginTTM.toFixed(2)}%`
    : '-';

  // 9. Beta (beta)
  const beta = metrics?.beta ?? companyDesc?.beta ?? null;
  const betaStr = typeof beta === 'number' && !isNaN(beta)
    ? beta.toFixed(2)
    : '-';

  // 10. Dividend Yield (dividendYieldIndicatedAnnual)
  const rawDivYield = metrics?.currentDividendYieldTTM;
  const numDivYield = rawDivYield !== null && rawDivYield !== undefined ? Number(rawDivYield) : null;
  const divYieldStr = numDivYield !== null && !isNaN(numDivYield)
    ? `${numDivYield.toFixed(2)}%`
    : (metrics ? '0.00%' : '-');

  const businessSummary = companyDesc?.description || '';
  const sector = companyDesc?.sector || null;
  const industry = companyDesc?.industry || profileData?.industry || null;
  const exchange = profileData?.exchange || stock.exchange || null;
  const country = companyDesc?.country || profileData?.country || null;
  const websiteUrl = companyDesc?.website || profileData?.weburl || null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={modalStyles.modalOverlayLight}>
        {/* Top Gap - Tapping here dismisses the modal */}
        <TouchableOpacity
          style={modalStyles.topBackdropGap}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Sheet Container */}
        <View
          style={[
            modalStyles.sheetContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <SafeAreaView
            style={[modalStyles.safeArea, { backgroundColor: theme.background }]}
            edges={['bottom', 'left', 'right']}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={layoutStyles.flex1}
              contentContainerStyle={styles.scrollContent}
            >
              {/* 1. Header Row */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <CompanyLogo
                    symbol={stock.symbol}
                    logoUri={stock.logo}
                    size={38}
                  />

                  <View style={styles.titleInfo}>
                    <View style={styles.symbolRow}>
                      <AppText bold style={styles.symbolText}>
                        {stock.symbol}
                      </AppText>
                      <AppText style={[styles.exchangeText, { color: theme.textSecondary }]}>
                        {' - '}{stock.exchange || '...'}  
                      </AppText>
                    </View>
                    <AppText style={[styles.companyText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {companyName}
                    </AppText>
                  </View>
                </View>

                <View style={styles.headerActions}>
                  <TouchableOpacity
                    onPress={() => setWatchlistModalVisible(true)}
                    style={modalStyles.closeBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Add to Wishlist"
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
                    style={modalStyles.closeBtn}
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
                {/* Left: Official Regular Session Price (or Scrubbed Candle Price) */}
                <View
                  style={
                    marketStatus.isOpen
                      ? styles.mainPriceColOpen
                      : styles.mainPriceColClosed
                  }
                >
                  <AppText style={styles.mainPriceText}>
                    {stock.currency || '$'}
                    {displayedMainPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </AppText>
                  {scrubData ? (
                    <AppText style={[styles.changeText, { color: scrubTrendColor }]}>
                      {isScrubPositive ? '+' : '-'}
                      {stock.currency || '$'}
                      {Math.abs(scrubDelta).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      ({Math.abs(scrubDeltaPercent).toFixed(2)}%)
                    </AppText>
                  ) : (
                    <AppText style={[styles.changeText, { color: timeframeTrendColor }]}>
                      {isPeriodPositive ? '+' : '-'}
                      {stock.currency || '$'}
                      {Math.abs(periodChange).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      ({Math.abs(periodChangePercent).toFixed(2)}%) {timeframeSuffix}
                    </AppText>
                  )}
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

              {/* 3. Real Timeframe Interactive Chart Area */}
              <View style={[styles.chartContainer, { backgroundColor: isDark ? '#050608' : '#F9FAFC' }]}>
                {isInitialStockLoading || !chartData || chartData.symbol !== cleanSymbol || !Array.isArray(sparklineData) || sparklineData.length === 0 ? (
                  <View style={styles.chartLoadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
                  </View>
                ) : (
                  <StockInteractiveChart
                    points={chartPointsWithLiveOverlay.length > 0 ? chartPointsWithLiveOverlay : chartData.points}
                    sparkline={sparklineData}
                    timeframe={activeDisplayedTimeframe}
                    color={timeframeTrendColor}
                    onScrub={(curr, prev) => setScrubData({ current: curr, prev })}
                    onScrubEnd={() => setScrubData(null)}
                  />
                )}
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

              {/* 5. KEY STATISTICS SECTION */}
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <AppText bold style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                    {stock.symbol} Key Statistics
                  </AppText>
                  {isLoadingDetails && (
                    <ActivityIndicator size="small" color={theme.primary} />
                  )}
                </View>

                {/* Range Bars Card */}
                <View style={[styles.cardBox, { backgroundColor: isDark ? '#12161E' : '#FFFFFF', borderColor: theme.border }]}>
                  {/* Day Range Bar */}
                  <View style={styles.rangeBarGroup}>
                    <View style={styles.rangeLabelRow}>
                      <AppText style={[styles.rangeSubtitle, { color: theme.textSecondary }]}>Day Range</AppText>
                      <View style={styles.rangeValuesRow}>
                        <AppText bold style={styles.rangeValueText}>{formatStatPrice(dayLow, curSymbol)}</AppText>
                        <AppText style={[styles.rangeValueSeparator, { color: theme.textMuted }]}>-</AppText>
                        <AppText bold style={styles.rangeValueText}>{formatStatPrice(dayHigh, curSymbol)}</AppText>
                      </View>
                    </View>
                    <View style={[styles.rangeTrack, { backgroundColor: isDark ? '#1E2532' : '#E4E7EC' }]}>
                      <View
                        style={[
                          styles.rangeFill,
                          {
                            width: `${dayRangePos}%`,
                            backgroundColor: timeframeTrendColor,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.rangePin,
                          {
                            left: `${Math.max(2, Math.min(98, dayRangePos))}%`,
                            backgroundColor: theme.textPrimary,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* 52-Week Range Bar */}
                  <View style={[styles.rangeBarGroup, { marginTop: spacing.md }]}>
                    <View style={styles.rangeLabelRow}>
                      <AppText style={[styles.rangeSubtitle, { color: theme.textSecondary }]}>52-Week Range</AppText>
                      <View style={styles.rangeValuesRow}>
                        <AppText bold style={styles.rangeValueText}>{formatStatPrice(fiftyTwoLow, curSymbol)}</AppText>
                        <AppText style={[styles.rangeValueSeparator, { color: theme.textMuted }]}>-</AppText>
                        <AppText bold style={styles.rangeValueText}>{formatStatPrice(fiftyTwoHigh, curSymbol)}</AppText>
                      </View>
                    </View>
                    <View style={[styles.rangeTrack, { backgroundColor: isDark ? '#1E2532' : '#E4E7EC' }]}>
                      <View
                        style={[
                          styles.rangeFill,
                          {
                            width: `${fiftyTwoRangePos}%`,
                            backgroundColor: timeframeTrendColor,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.rangePin,
                          {
                            left: `${Math.max(2, Math.min(98, fiftyTwoRangePos))}%`,
                            backgroundColor: theme.textPrimary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                {/* 2-Column Statistics Grid */}
                <View style={[styles.statsGrid, { backgroundColor: isDark ? '#12161E' : '#FFFFFF', borderColor: theme.border }]}>
                  {/* Row 1: Previous Close | Market Cap */}
                  <View style={styles.statGridRow}>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Previous Close</AppText>
                      <AppText bold style={styles.statValue}>{prevCloseStr}</AppText>
                    </View>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Market Cap</AppText>
                      <AppText bold style={styles.statValue}>{marketCapStr}</AppText>
                    </View>
                  </View>

                  {/* Row 2: Volume | Avg Volume (3mo) */}
                  <View style={[styles.statGridRow, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Volume</AppText>
                      <AppText bold style={styles.statValue}>{volumeStr}</AppText>
                    </View>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Avg Volume (3mo)</AppText>
                      <AppText bold style={styles.statValue}>{avgVol3MStr}</AppText>
                    </View>
                  </View>

                  {/* Row 3: Trailing P/E | Forward P/E */}
                  <View style={[styles.statGridRow, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Trailing P/E</AppText>
                      <AppText bold style={styles.statValue}>{trailingPeStr}</AppText>
                    </View>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Forward P/E</AppText>
                      <AppText bold style={styles.statValue}>{forwardPeStr}</AppText>
                    </View>
                  </View>

                  {/* Row 4: Trailing EPS | Profit Margin */}
                  <View style={[styles.statGridRow, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Trailing EPS</AppText>
                      <AppText bold style={styles.statValue}>{trailingEpsStr}</AppText>
                    </View>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Profit Margin</AppText>
                      <AppText bold style={styles.statValue}>{profitMarginStr}</AppText>
                    </View>
                  </View>

                  {/* Row 5: Beta | Dividend Yield */}
                  <View style={[styles.statGridRow, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Beta</AppText>
                      <AppText bold style={styles.statValue}>{betaStr}</AppText>
                    </View>
                    <View style={styles.statGridCol}>
                      <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>Dividend Yield</AppText>
                      <AppText bold style={styles.statValue}>{divYieldStr}</AppText>
                    </View>
                  </View>
                </View>
              </View>

              {/* 6. ABOUT COMPANY SECTION */}
              <View style={styles.sectionContainer}>
                <AppText bold style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                  About {stock.symbol}
                </AppText>

                <View style={[styles.cardBox, { backgroundColor: isDark ? '#12161E' : '#FFFFFF', borderColor: theme.border }]}>
                  {businessSummary ? (
                    <View>
                      <AppText
                        style={[styles.descriptionText, { color: theme.textSecondary }]}
                        numberOfLines={isDescExpanded ? undefined : 4}
                      >
                        {businessSummary}
                      </AppText>
                      <TouchableOpacity
                        onPress={() => setIsDescExpanded((prev) => !prev)}
                        style={styles.readMoreBtn}
                        activeOpacity={0.7}
                      >
                        <AppText bold style={{ color: theme.primary, fontSize: 13 }}>
                          {isDescExpanded ? 'Show less' : 'Read more'}
                        </AppText>
                        <Ionicons
                          name={isDescExpanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={theme.primary}
                          style={{ marginLeft: 4 }}
                        />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <AppText style={[styles.descriptionText, { color: theme.textMuted }]}>
                      Company profile details are loading or currently unavailable.
                    </AppText>
                  )}

                  {/* Company Info Tags Grid */}
                  <View style={[styles.infoTagsGrid, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    {sector && (
                      <View style={styles.infoTagItem}>
                        <AppText style={[styles.infoTagLabel, { color: theme.textMuted }]}>Sector</AppText>
                        <AppText bold style={styles.infoTagValue}>{sector}</AppText>
                      </View>
                    )}
                    {industry && (
                      <View style={styles.infoTagItem}>
                        <AppText style={[styles.infoTagLabel, { color: theme.textMuted }]}>Industry</AppText>
                        <AppText bold style={styles.infoTagValue}>{industry}</AppText>
                      </View>
                    )}
                    {country && (
                      <View style={styles.infoTagItem}>
                        <AppText style={[styles.infoTagLabel, { color: theme.textMuted }]}>Country</AppText>
                        <AppText bold style={styles.infoTagValue}>{country}</AppText>
                      </View>
                    )}
                    {companyDesc?.employees && (
                      <View style={styles.infoTagItem}>
                        <AppText style={[styles.infoTagLabel, { color: theme.textMuted }]}>Employees</AppText>
                        <AppText bold style={styles.infoTagValue}>{companyDesc.employees.toLocaleString()}</AppText>
                      </View>
                    )}
                  </View>

                  {/* External Website Button */}
                  {websiteUrl && (
                    <TouchableOpacity
                      style={[styles.websiteButton, { backgroundColor: isDark ? '#181E29' : '#F0F3F7' }]}
                      onPress={() => {
                        const target = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
                        Linking.openURL(target).catch(() => {});
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="globe-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
                      <AppText bold style={[styles.websiteButtonText, { color: theme.primary }]}>
                        Visit Website
                      </AppText>
                      <Ionicons name="open-outline" size={14} color={theme.primary} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 7. RECENT NEWS SECTION */}
              {companyNews && companyNews.length > 0 && (
                <View style={styles.sectionContainer}>
                  <AppText bold style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                    Recent News
                  </AppText>

                  <View style={newsStyles.newsList}>
                    {companyNews.slice(0, 6).map((item) => (
                      <NewsCard key={item.id} item={item} />
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* 8. Anchored Bottom Price Freshness Indicator & Paper Trading Actions */}
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
              {isPaperTradingEnabled && (
                <View style={styles.paperTradeButtonRow}>
                  <TouchableOpacity
                    style={[styles.paperTradeBtn, styles.paperBuyBtn]}
                    onPress={() => {
                      setOrderMode('BUY');
                      setOrderModalVisible(true);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Paper Buy"
                  >
                    <AppText bold style={styles.paperTradeBtnText}>
                      Paper Buy
                    </AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.paperTradeBtn, styles.paperSellBtn]}
                    onPress={() => {
                      setOrderMode('SELL');
                      setOrderModalVisible(true);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Paper Sell"
                  >
                    <AppText bold style={styles.paperTradeBtnText}>
                      Paper Sell
                    </AppText>
                  </TouchableOpacity>
                </View>
              )}

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

          {/* Add to Wishlist Modal */}
          <AddToWatchlistModal
            visible={watchlistModalVisible}
            stock={stock}
            onClose={() => setWatchlistModalVisible(false)}
          />

          {/* Paper Trading Order Modal */}
          <StockOrderModal
            visible={orderModalVisible}
            stock={stock}
            mode={orderMode}
            onClose={() => setOrderModalVisible(false)}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
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
  titleInfo: {
    flex: 1,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    width: '75%',
  },
  symbolText: {
    fontSize: 20,
    letterSpacing: 0.3,
  },
  exchangeText: {
    fontSize: 12,
    overflowX: 'ellipsis',
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
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  chartLoadingContainer: {
    flex: 1,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Sections layout
  sectionContainer: {
    marginTop: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm + 2,
  },
  sectionTitle: {
    fontSize: 16,
    letterSpacing: 0.2,
    marginBottom: spacing.sm,
  },
  cardBox: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md + 2,
  },
  // Range bar styles
  rangeBarGroup: {
    width: '100%',
  },
  rangeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  rangeSubtitle: {
    fontSize: 13,
  },
  rangeValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rangeValueText: {
    fontSize: 13,
  },
  rangeValueSeparator: {
    fontSize: 13,
  },
  rangeTrack: {
    height: 6,
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
  },
  rangeFill: {
    height: '100%',
    borderRadius: 3,
  },
  rangePin: {
    position: 'absolute',
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: '#000000',
  },
  // Stats grid styles
  statsGrid: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  statGridRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
  },
  statGridCol: {
    flex: 1,
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 3,
  },
  statValue: {
    fontSize: 15,
  },
  // Description styles
  descriptionText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  readMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  infoTagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  infoTagItem: {
    width: '45%',
  },
  infoTagLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  infoTagValue: {
    fontSize: 13,
    lineHeight: 17,
  },
  websiteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
  },
  websiteButtonText: {
    fontSize: 13,
  },
  anchoredFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#CCCCCC',
  },
  paperTradeButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  paperTradeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm
  },
  paperBuyBtn: {
    backgroundColor: '#00D084',
  },
  paperSellBtn: {
    backgroundColor: '#FF4D4F',
  },
  paperTradeBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  lastUpdatedText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
});

