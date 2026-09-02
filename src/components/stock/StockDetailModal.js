import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { useTrading } from '../../context/TradingContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { spacing, borderRadius } from '../../constants/theme';
import {
  formatTimeAgo,
  formatLargeNum,
  formatStatPrice,
  formatShares,
  formatMoney,
} from '../../utils/formatters';
import {
  getSecurityBySymbol,
  getDisplaySymbol,
  getDisplayName,
  getCurrency,
  getDecimals,
  isNonStockSecurity,
} from '../../utils/securityUtils';
import { storageService } from '../../services/storageService';
import { useWatchlist } from '../../context/WatchlistContext';
import { modalStyles, layoutStyles, newsStyles } from '../../styles';
import AppText from '../common/AppText';
import StockDetailChartSection from './StockDetailChartSection';
import MarketCalendarModal from '../common/MarketCalendarModal';
import CompanyLogo from '../common/CompanyLogo';
import AddToWatchlistModal from './AddToWatchlistModal';
import StockOrderModal from './StockOrderModal';
import NewsCard from '../common/NewsCard';

const TIMEFRAMES = ['1H', '1D', '1W', '3M', '1Y', '5Y', 'ALL'];

const memoryStockTimeframes = {};

storageService.getStockTimeframes().then((saved) => {
  if (saved && typeof saved === 'object') {
    Object.assign(memoryStockTimeframes, saved);
  }
});

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

function RangeBar({ label, low, high, position, isDark, theme, curSymbol, decimals, symbol }) {
  return (
    <View style={styles.rangeBarGroup}>
      <View style={styles.rangeLabelRow}>
        <AppText style={[styles.rangeSubtitle, { color: theme.textSecondary }]}>{label}</AppText>
        <View style={styles.rangeValuesRow}>
          <AppText bold style={styles.rangeValueText}>{formatStatPrice(low, curSymbol, decimals, symbol)}</AppText>
          <AppText style={[styles.rangeValueSeparator, { color: theme.textMuted }]}>-</AppText>
          <AppText bold style={styles.rangeValueText}>{formatStatPrice(high, curSymbol, decimals, symbol)}</AppText>
        </View>
      </View>
      <View style={[styles.rangeTrack, { backgroundColor: isDark ? '#1E2532' : '#E4E7EC' }]}>
        <View style={[styles.rangeFill, { width: `${position}%`, backgroundColor: theme.primary }]} />
        <View style={[styles.rangePin, { left: `${Math.max(2, Math.min(98, position))}%`, backgroundColor: theme.textPrimary }]} />
      </View>
    </View>
  );
}

const LastUpdatedFreshness = React.memo(function LastUpdatedFreshness({ timestamp, textStyle, textColor }) {
  const [text, setText] = useState(() => formatTimeAgo(timestamp));

  useEffect(() => {
    setText(formatTimeAgo(timestamp));
    const interval = setInterval(() => {
      setText(formatTimeAgo(timestamp));
    }, 5000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <AppText style={[textStyle, { color: textColor }]}>
      Latest price updated {text}
    </AppText>
  );
});

function StockDetailModal({ visible, stock, onClose }) {
  const { theme, isDark } = useTheme();
  const {
    quotes,
    fetchQuote,
    fetchHistoricalChart,
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
  const { activePortfolioId, getPosition } = usePortfolio();

  const [watchlistModalVisible, setWatchlistModalVisible] = useState(false);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [orderMode, setOrderMode] = useState('BUY');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [chartData, setChartData] = useState(null);
  const [isInitialStockLoading, setIsInitialStockLoading] = useState(true);
  const [isTimeframeLoading, setIsTimeframeLoading] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);

  const [metrics, setMetrics] = useState(null);
  const [companyDesc, setCompanyDesc] = useState(null);
  const [companyNews, setCompanyNews] = useState([]);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const cleanSymbol = stock?.symbol ? getDisplaySymbol(stock.symbol) : '';
  const isNonStock = Boolean(
    (stock?.symbol && (isNonStockSecurity(stock.symbol) || isNonStockSecurity(cleanSymbol))) ||
    stock?.isStock === false ||
    stock?.isNonStock ||
    stock?.category === 'crypto' ||
    stock?.category === 'forex' ||
    stock?.category === 'commodities' ||
    stock?.category === 'indices'
  );
  const isStock = !isNonStock && stock?.isStock !== false;
  const isStockPaperTradingAllowed = isPaperTradingEnabled && isStock;

  const effectiveMarketStatus = useMemo(() => {
    if (isNonStock) {
      return {
        session: 'OPEN',
        label: 'Market Open',
        color: '#00D084',
        isOpen: true,
        isPreMarket: false,
        isAfterHours: false,
        suffix: 'today',
      };
    }
    return marketStatus;
  }, [isNonStock, marketStatus]);

  const isFavorite = cleanSymbol ? isStockInAnyWatchlist(cleanSymbol) : false;
  const latestExtendedPriceRef = useRef(null);
  const [persistentPrevClose, setPersistentPrevClose] = useState(
    () => (typeof stock?.previousClose === 'number' && stock.previousClose > 0 ? stock.previousClose : null)
  );

  useEffect(() => {
    latestExtendedPriceRef.current = null;
    setChartData(null);
    setMetrics(null);
    setCompanyDesc(null);
    setCompanyNews([]);
    setIsDescExpanded(false);
    setIsInitialStockLoading(true);
    setIsTimeframeLoading(false);
    setPersistentPrevClose(
      typeof stock?.previousClose === 'number' && stock.previousClose > 0
        ? stock.previousClose
        : null
    );

    if (stock?.symbol) {
      const sym = getDisplaySymbol(stock.symbol);
      setSelectedTimeframe(memoryStockTimeframes[sym] || '1D');
    }
  }, [stock?.symbol]);

  // Fetch live REST quote whenever modal opens or symbol changes
  useEffect(() => {
    if (visible && cleanSymbol && fetchQuote) {
      fetchQuote(cleanSymbol);
    }
  }, [visible, cleanSymbol, fetchQuote]);

  const handleSelectTimeframe = (tf) => {
    if (tf === selectedTimeframe) return;
    setIsTimeframeLoading(true);
    setSelectedTimeframe(tf);
    if (stock?.symbol) {
      const sym = getDisplaySymbol(stock.symbol);
      memoryStockTimeframes[sym] = tf;
      storageService.setStockTimeframe(sym, tf);
    }
  };

  const handleOpenCalendar = useCallback(() => {
    if (!isNonStock) {
      setCalendarVisible(true);
    }
  }, [isNonStock]);

  useEffect(() => {
    let isMounted = true;
    if (visible && stock?.symbol) {
      const sym = getDisplaySymbol(stock.symbol);
      setIsTimeframeLoading(true);
      fetchHistoricalChart(sym, selectedTimeframe)
        .then((data) => {
          if (isMounted) {
            if (data) {
              setChartData(data);
              const extCandidate = marketStatus?.isPreMarket
                ? (data.preMarketPrice || data.postMarketPrice)
                : (data.postMarketPrice || data.preMarketPrice);
              if (typeof extCandidate === 'number' && extCandidate > 0 && Math.abs(extCandidate - (data.regularMarketPrice || 0)) > 0.000001) {
                latestExtendedPriceRef.current = extCandidate;
              }
            }
            setIsInitialStockLoading(false);
            setIsTimeframeLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            setIsInitialStockLoading(false);
            setIsTimeframeLoading(false);
          }
        });
    } else {
      setIsInitialStockLoading(false);
      setIsTimeframeLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, [visible, stock?.symbol, selectedTimeframe, marketStatus.session, fetchHistoricalChart]);

  useEffect(() => {
    if (typeof stock?.previousClose === 'number' && stock.previousClose > 0) {
      setPersistentPrevClose(stock.previousClose);
    }
  }, [stock?.previousClose]);

  useEffect(() => {
    if (typeof chartData?.previousClose === 'number' && chartData.previousClose > 0) {
      setPersistentPrevClose(chartData.previousClose);
    }
  }, [chartData?.previousClose]);

  useEffect(() => {
    let isMounted = true;
    if (visible && stock?.symbol && !persistentPrevClose) {
      const sym = getDisplaySymbol(stock.symbol);
      fetchHistoricalChart(sym, '1D')
        .then((d1) => {
          if (isMounted && typeof d1?.previousClose === 'number' && d1.previousClose > 0) {
            setPersistentPrevClose(d1.previousClose);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [visible, stock?.symbol, persistentPrevClose, fetchHistoricalChart]);

  useEffect(() => {
    let isMounted = true;
    if (visible && stock?.symbol) {
      const sym = getDisplaySymbol(stock.symbol);
      setIsLoadingDetails(true);

      if (isNonStockSecurity(sym)) {
        fetchCompanyDescription(sym)
          .then((desc) => {
            if (isMounted) {
              if (desc) setCompanyDesc(desc);
              setIsLoadingDetails(false);
            }
          })
          .catch(() => {
            if (isMounted) setIsLoadingDetails(false);
          });
      } else {
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
    }
    return () => {
      isMounted = false;
    };
  }, [visible, stock?.symbol, apiKey, marketStatus.session, fetchProfile, fetchStockMetrics, fetchCompanyDescription, fetchCompanyNews]);

  const isTimeframeDisabled = useMemo(() => {
    const firstTrade = chartData?.firstTradeDate || null;
    if (!firstTrade) return () => false;

    const stockAgeMs = Date.now() - firstTrade;
    const DAY_MS = 24 * 60 * 60 * 1000;

    return (tf) => {
      if (tf === '1W') return stockAgeMs < 5 * DAY_MS;
      if (tf === '3M') return stockAgeMs < 60 * DAY_MS;
      if (tf === '1Y') return stockAgeMs < 300 * DAY_MS;
      if (tf === '5Y') return stockAgeMs < 4 * 365 * DAY_MS;
      return false;
    };
  }, [chartData?.firstTradeDate]);

  useEffect(() => {
    if (isTimeframeDisabled(selectedTimeframe)) {
      handleSelectTimeframe('ALL');
    }
  }, [selectedTimeframe, isTimeframeDisabled]);

  const isPos = (n) => typeof n === 'number' && !isNaN(n) && n > 0;

  const activeDisplayedTimeframe = chartData?.timeframe || selectedTimeframe;
  const liveQuote = cleanSymbol ? (quotes[cleanSymbol] || quotes[stock?.symbol] || {}) : {};
  const liveWsPrice = isPos(liveQuote?.price) ? liveQuote.price : (isPos(stock?.price) ? stock.price : null);

  if (liveWsPrice) {
    latestExtendedPriceRef.current = liveWsPrice;
  }

  const regularClosePrice =
    (isPos(chartData?.regularMarketPrice) ? chartData.regularMarketPrice : null) ??
    (isPos(liveQuote?.regularMarketPrice) ? liveQuote.regularMarketPrice : null) ??
    (isPos(stock?.regularMarketPrice) ? stock.regularMarketPrice : null) ??
    (isPos(liveQuote?.price) ? liveQuote.price : null) ??
    (isPos(stock?.price) ? stock.price : null) ??
    (isPos(chartData?.currentPrice) ? chartData.currentPrice : 0);

  const leftPrice = effectiveMarketStatus.isOpen
    ? (liveWsPrice ?? (isPos(liveQuote?.price) ? liveQuote.price : null) ?? (isPos(stock?.price) ? stock.price : null) ?? (isPos(chartData?.currentPrice) ? chartData.currentPrice : null) ?? regularClosePrice)
    : regularClosePrice;

  const isPreMarket = marketStatus?.isPreMarket;
  const targetChartExtPrice = isPreMarket
    ? (isPos(chartData?.preMarketPrice) && Math.abs(chartData.preMarketPrice - regularClosePrice) > 0.000001 ? chartData.preMarketPrice : null) ??
      (isPos(chartData?.postMarketPrice) && Math.abs(chartData.postMarketPrice - regularClosePrice) > 0.000001 ? chartData.postMarketPrice : null)
    : (isPos(chartData?.postMarketPrice) && Math.abs(chartData.postMarketPrice - regularClosePrice) > 0.000001 ? chartData.postMarketPrice : null) ??
      (isPos(chartData?.preMarketPrice) && Math.abs(chartData.preMarketPrice - regularClosePrice) > 0.000001 ? chartData.preMarketPrice : null);

  const targetStockExtPrice = isPreMarket
    ? (isPos(liveQuote?.preMarketPrice) ? liveQuote.preMarketPrice : (isPos(stock?.preMarketPrice) ? stock.preMarketPrice : null)) ??
      (isPos(liveQuote?.postMarketPrice) ? liveQuote.postMarketPrice : (isPos(stock?.postMarketPrice) ? stock.postMarketPrice : null))
    : (isPos(liveQuote?.postMarketPrice) ? liveQuote.postMarketPrice : (isPos(stock?.postMarketPrice) ? stock.postMarketPrice : null)) ??
      (isPos(liveQuote?.preMarketPrice) ? liveQuote.preMarketPrice : (isPos(stock?.preMarketPrice) ? stock.preMarketPrice : null));

  const outOfHoursPriceVal =
    liveWsPrice ??
    (isPos(latestExtendedPriceRef.current) ? latestExtendedPriceRef.current : null) ??
    targetChartExtPrice ??
    targetStockExtPrice ??
    regularClosePrice;

  const curSymbol = stock?.currency !== undefined ? stock.currency : getCurrency(cleanSymbol, '$');
  const decimals = getDecimals(cleanSymbol, leftPrice, stock?.decimals);
  const secMetadata = getSecurityBySymbol(cleanSymbol);

  const profileData = cleanSymbol ? profiles[cleanSymbol] : null;
  const companyName = stock?.displayName || getDisplayName(cleanSymbol) || profileData?.name || stock?.name || cleanSymbol;

  const chartSectionStock = useMemo(() => ({
    ...stock,
    symbol: cleanSymbol,
    currency: curSymbol,
    decimals,
    isStock,
    isNonStock,
  }), [stock, cleanSymbol, curSymbol, decimals, isStock, isNonStock]);

  const currentStatPrice = leftPrice;
  const dayLow = chartData?.regularMarketDayLow ?? (chartData?.timeframe === '1D' ? chartData?.minPrice : null) ?? stock?.low ?? null;
  const dayHigh = chartData?.regularMarketDayHigh ?? (chartData?.timeframe === '1D' ? chartData?.maxPrice : null) ?? stock?.high ?? null;
  const dayRangePos = getRangePosition(currentStatPrice, dayLow, dayHigh);

  const fiftyTwoLow = metrics?.['52WeekLow'] ?? metrics?.fiftyTwoWeekLow ?? chartData?.fiftyTwoWeekLow ?? null;
  const fiftyTwoHigh = metrics?.['52WeekHigh'] ?? metrics?.fiftyTwoWeekHigh ?? chartData?.fiftyTwoWeekHigh ?? null;
  const fiftyTwoRangePos = getRangePosition(currentStatPrice, fiftyTwoLow, fiftyTwoHigh);

  const prevCloseVal =
    persistentPrevClose ??
    (typeof chartData?.previousClose === 'number' && chartData.previousClose > 0 ? chartData.previousClose : null) ??
    (typeof stock?.previousClose === 'number' && stock.previousClose > 0 ? stock.previousClose : null) ??
    null;
  const prevCloseStr = prevCloseVal !== null && prevCloseVal !== undefined && !isNaN(prevCloseVal) && prevCloseVal > 0
    ? formatStatPrice(prevCloseVal, curSymbol, decimals, cleanSymbol)
    : '-';

  const marketCapVal = metrics?.marketCapitalization ?? profileData?.marketCap ?? stock?.marketCap ?? null;
  const marketCapStr = marketCapVal !== null && marketCapVal !== undefined && !isNaN(marketCapVal) && marketCapVal > 0
    ? formatLargeNum(marketCapVal * 1e6, curSymbol)
    : '-';

  const volumeVal = chartData?.regularMarketVolume ?? stock?.volume ?? null;
  const volumeStr = volumeVal !== null && volumeVal !== undefined && !isNaN(volumeVal) && volumeVal > 0
    ? formatLargeNum(volumeVal)
    : '-';

  const rawAvgVol = metrics?.['3MonthAverageTradingVolume'] ?? metrics?.avgVolume3M ?? null;
  const numAvgVol = rawAvgVol !== null && rawAvgVol !== undefined ? Number(rawAvgVol) : null;
  const avgVol3MStr = numAvgVol !== null && !isNaN(numAvgVol) && numAvgVol > 0
    ? `${numAvgVol.toFixed(2)}M`
    : '-';

  const peTTM = metrics?.peTTM ?? companyDesc?.peRatio ?? null;
  const trailingPeStr = typeof peTTM === 'number' && !isNaN(peTTM) && peTTM > 0 ? peTTM.toFixed(2) : '-';

  const forwardPE = metrics?.forwardPE ?? companyDesc?.forwardPE ?? null;
  const forwardPeStr = typeof forwardPE === 'number' && !isNaN(forwardPE) && forwardPE > 0 ? forwardPE.toFixed(2) : '-';

  const epsTTM = metrics?.epsTTM ?? companyDesc?.eps ?? null;
  const trailingEpsStr = typeof epsTTM === 'number' && !isNaN(epsTTM)
    ? formatStatPrice(epsTTM, curSymbol, decimals, cleanSymbol)
    : '-';

  const marginTTM = metrics?.netProfitMarginTTM ?? companyDesc?.profitMargin ?? null;
  const profitMarginStr = typeof marginTTM === 'number' && !isNaN(marginTTM) ? `${marginTTM.toFixed(2)}%` : '-';

  const beta = metrics?.beta ?? companyDesc?.beta ?? null;
  const betaStr = typeof beta === 'number' && !isNaN(beta) ? beta.toFixed(2) : '-';

  const rawDivYield = metrics?.currentDividendYieldTTM;
  const numDivYield = rawDivYield !== null && rawDivYield !== undefined ? Number(rawDivYield) : null;
  const divYieldStr = numDivYield !== null && !isNaN(numDivYield)
    ? `${numDivYield.toFixed(2)}%`
    : (metrics ? '0.00%' : '-');

  const statRows = [
    [
      { label: 'Previous Close', value: prevCloseStr },
      { label: 'Market Cap', value: marketCapStr },
    ],
    [
      { label: 'Volume', value: volumeStr },
      { label: 'Avg Volume (3mo)', value: avgVol3MStr },
    ],
    [
      { label: 'Trailing P/E', value: trailingPeStr },
      { label: 'Forward P/E', value: forwardPeStr },
    ],
    [
      { label: 'Trailing EPS', value: trailingEpsStr },
      { label: 'Profit Margin', value: profitMarginStr },
    ],
    [
      { label: 'Beta', value: betaStr },
      { label: 'Dividend Yield', value: divYieldStr },
    ],
  ];

  const businessSummary = companyDesc?.description || '';
  const sector = companyDesc?.sector || null;
  const industry = companyDesc?.industry || profileData?.industry || null;
  const exchange = profileData?.exchange || stock?.exchange || (secMetadata ? secMetadata.category.toUpperCase() : null);
  const country = companyDesc?.country || profileData?.country || null;
  const websiteUrl = companyDesc?.website || profileData?.weburl || null;

  const companyTags = [
    sector && { label: 'Sector', value: sector },
    industry && { label: 'Industry', value: industry },
    country && { label: 'Country', value: country },
    companyDesc?.employees && { label: 'Employees', value: companyDesc.employees.toLocaleString() },
  ].filter(Boolean);

  const positionInfo = useMemo(() => {
    if (!isStockPaperTradingAllowed || !cleanSymbol) return null;
    const pos = getPosition(activePortfolioId, cleanSymbol);
    const heldShares = pos ? Number(pos.shares) || 0 : 0;
    if (heldShares <= 0) return { hasPosition: false, heldShares: 0 };
    const avgCost = pos ? Number(pos.avgCost) || 0 : 0;
    const totalCost = pos ? (pos.totalCost ?? heldShares * avgCost) : heldShares * avgCost;
    const currentValuationPrice = marketStatus.isOpen ? leftPrice : outOfHoursPriceVal;
    const positionTotalValue = heldShares * currentValuationPrice;
    const gainLoss = positionTotalValue - totalCost;
    const posReturnPercent =
      totalCost > 0
        ? (gainLoss / totalCost) * 100
        : (avgCost > 0 ? ((currentValuationPrice - avgCost) / avgCost) * 100 : 0);
    return {
      hasPosition: true,
      heldShares,
      avgCost,
      positionTotalValue,
      posReturnPercent,
      isPosReturnPositive: posReturnPercent >= 0,
      posReturnColor: posReturnPercent >= 0 ? '#00D084' : '#FF4D4F',
    };
  }, [
    isStockPaperTradingAllowed,
    cleanSymbol,
    activePortfolioId,
    getPosition,
    marketStatus.isOpen,
    leftPrice,
    outOfHoursPriceVal,
  ]);

  if (!stock) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={modalStyles.modalOverlayLight}>
        <TouchableOpacity
          style={modalStyles.topBackdropGap}
          activeOpacity={1}
          onPress={onClose}
        />

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
              {/* 1. Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <CompanyLogo
                    symbol={cleanSymbol}
                    size={46}
                    logoUri={stock.logo || profileData?.logo}
                    style={styles.logo}
                  />

                  <View style={styles.titleInfo}>
                    <View style={styles.symbolRow}>
                      <AppText bold style={styles.symbolText}>
                        {cleanSymbol}
                      </AppText>
                      {exchange && (
                        <AppText
                          numberOfLines={1}
                          style={[styles.exchangeText, { color: theme.textSecondary }]}
                        >
                          {' '} - {exchange}
                        </AppText>
                      )}
                    </View>
                    <AppText
                      numberOfLines={1}
                      style={[styles.companyText, { color: theme.textSecondary }]}
                    >
                      {companyName}
                    </AppText>
                  </View>
                </View>

                <View style={styles.headerActions}>
                  <TouchableOpacity
                    onPress={() => setWatchlistModalVisible(true)}
                    style={styles.actionBtn}
                    accessibilityRole="button"
                    accessibilityLabel={isFavorite ? 'Remove from Watchlist' : 'Add to Watchlist'}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={isFavorite ? 'star' : 'star-outline'}
                      size={24}
                      color={isFavorite ? '#FFD700' : theme.textPrimary}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={onClose}
                    style={modalStyles.closeBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Close Detail Modal"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={24} color={theme.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2 & 3. Interactive Price Header & Chart Area (Isolated Scrub Rendering) */}
              <StockDetailChartSection
                stock={chartSectionStock}
                chartData={chartData}
                liveWsPrice={liveWsPrice}
                latestExtendedPrice={latestExtendedPriceRef.current}
                marketStatus={effectiveMarketStatus}
                activeDisplayedTimeframe={activeDisplayedTimeframe}
                isInitialStockLoading={isInitialStockLoading}
                isTimeframeLoading={isTimeframeLoading}
                onOpenCalendar={isNonStock ? undefined : handleOpenCalendar}
                isNonStock={isNonStock}
              />

              {/* 4. Timeframe Selector Pills */}
              <View style={styles.timeframeSelectorRow}>
                {TIMEFRAMES.map((tf) => {
                  const isSelected = tf === selectedTimeframe;
                  const disabled = isTimeframeDisabled(tf);

                  return (
                    <TouchableOpacity
                      key={tf}
                      disabled={disabled}
                      style={[
                        styles.timeframeBtn,
                        isSelected && {
                          backgroundColor: isDark ? '#4A4A4A' : '#D0D5DD',
                        },
                        disabled && styles.timeframeBtnDisabled,
                      ]}
                      onPress={() => handleSelectTimeframe(tf)}
                      activeOpacity={0.7}
                    >
                      <AppText
                        bold={isSelected}
                        style={[
                          styles.timeframeText,
                          {
                            color: isSelected
                              ? theme.textPrimary
                              : disabled
                              ? theme.textMuted
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

              {/* 5. Key Statistics Section */}
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <AppText bold style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                    {cleanSymbol} Key Statistics
                  </AppText>
                  {isLoadingDetails && (
                    <ActivityIndicator size="small" color={theme.primary} />
                  )}
                </View>

                {/* Range Bars Card */}
                <View style={[styles.cardBox, { backgroundColor: isDark ? '#12161E' : '#FFFFFF', borderColor: theme.border }]}>
                  <RangeBar
                    label="Day Range"
                    low={dayLow}
                    high={dayHigh}
                    position={dayRangePos}
                    isDark={isDark}
                    theme={theme}
                    curSymbol={curSymbol}
                    decimals={decimals}
                    symbol={cleanSymbol}
                  />
                  <View style={{ marginTop: spacing.md }}>
                    <RangeBar
                      label="52-Week Range"
                      low={fiftyTwoLow}
                      high={fiftyTwoHigh}
                      position={fiftyTwoRangePos}
                      isDark={isDark}
                      theme={theme}
                      curSymbol={curSymbol}
                      decimals={decimals}
                      symbol={cleanSymbol}
                    />
                  </View>
                </View>

                {/* 2-Column Statistics Grid */}
                <View style={[styles.statsGrid, { backgroundColor: isDark ? '#12161E' : '#FFFFFF', borderColor: theme.border }]}>
                  {statRows.map((row, rowIdx) => (
                    <View
                      key={`row-${rowIdx}`}
                      style={[
                        styles.statGridRow,
                        rowIdx > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      {row.map((col) => (
                        <View key={col.label} style={styles.statGridCol}>
                          <AppText style={[styles.statLabel, { color: theme.textSecondary }]}>
                            {col.label}
                          </AppText>
                          <AppText bold style={styles.statValue}>
                            {col.value}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>

              {/* 6. About Company / Security Section */}
              <View style={styles.sectionContainer}>
                <AppText bold style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                  About {cleanSymbol}
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
                      {isStock ? 'Company profile details are loading or currently unavailable.' : `${companyName} (${cleanSymbol}) overview and price data.`}
                    </AppText>
                  )}

                  {companyTags.length > 0 && (
                    <View style={[styles.infoTagsGrid, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                      {companyTags.map((tag) => (
                        <View key={tag.label} style={styles.infoTagItem}>
                          <AppText style={[styles.infoTagLabel, { color: theme.textMuted }]}>
                            {tag.label}
                          </AppText>
                          <AppText bold style={styles.infoTagValue}>
                            {tag.value}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  )}

                  {websiteUrl && (
                    <TouchableOpacity
                      style={[styles.websiteButton, { backgroundColor: isDark ? '#181E29' : '#F0F3F7' }]}
                      onPress={() => {
                        const target = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
                        Linking.openURL(target).catch(() => {});
                      }}
                      activeOpacity={0.7}
                    >
                      <AppText bold style={[styles.websiteButtonText, { color: theme.primary }]}>
                        Visit Website
                      </AppText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 7. Recent News Section */}
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

            {/* 8. Anchored Bottom Price Freshness & Paper Trading Actions (Stocks only) */}
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
              {isStockPaperTradingAllowed && positionInfo && (
                <View style={styles.positionContainer}>
                  {positionInfo.hasPosition && (
                    <>
                      <AppText bold style={styles.positionTitle}>
                        Your Position
                      </AppText>
                      <View style={styles.positionDataRow}>
                        <View style={styles.positionLeftGroup}>
                          <AppText bold style={styles.positionSharesText}>
                            {formatShares(positionInfo.heldShares)}
                          </AppText>
                          <AppText style={[styles.positionAvgCostLabel, { color: theme.textSecondary }]}>
                            Avg cost:{' '}
                            <AppText bold style={{ color: theme.textPrimary }}>
                              {formatMoney(positionInfo.avgCost, curSymbol, decimals, cleanSymbol)}
                            </AppText>
                          </AppText>
                        </View>

                        <View style={styles.positionRightGroup}>
                          <AppText bold style={styles.positionValueText}>
                            {formatMoney(positionInfo.positionTotalValue, curSymbol, decimals, cleanSymbol)}
                          </AppText>
                          <AppText bold style={[styles.positionReturnText, { color: positionInfo.posReturnColor }]}>
                            {positionInfo.isPosReturnPositive ? '+' : '-'}{Math.abs(positionInfo.posReturnPercent).toFixed(2)}%
                          </AppText>
                        </View>
                      </View>
                    </>
                  )}

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

                    {positionInfo.hasPosition && (
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
                    )}
                  </View>
                </View>
              )}

              <LastUpdatedFreshness
                timestamp={stock?.lastUpdated || chartData?.lastUpdated}
                textStyle={styles.lastUpdatedText}
                textColor={theme.textMuted}
              />
            </View>
          </SafeAreaView>

          {!isNonStock && (
            <MarketCalendarModal
              visible={calendarVisible}
              onClose={() => setCalendarVisible(false)}
            />
          )}

          <AddToWatchlistModal
            visible={watchlistModalVisible}
            stock={{
              ...stock,
              symbol: cleanSymbol,
              displaySymbol: cleanSymbol,
              name: companyName,
              displayName: companyName,
              currency: curSymbol,
              decimals,
              isStock,
            }}
            onClose={() => setWatchlistModalVisible(false)}
          />

          {isStockPaperTradingAllowed && (
            <StockOrderModal
              visible={orderModalVisible}
              stock={{
                ...stock,
                symbol: cleanSymbol,
                displaySymbol: cleanSymbol,
                name: companyName,
                displayName: companyName,
                currency: curSymbol,
                decimals,
                isStock,
              }}
              mode={orderMode}
              onClose={() => setOrderModalVisible(false)}
            />
          )}
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
  },
  companyText: {
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionBtn: {
    padding: spacing.xs,
  },
  logo: {
    borderRadius: borderRadius.sm,
  },
  timeframeSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: 2,
  },
  timeframeBtn: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.sm,
  },
  timeframeBtnDisabled: {
    opacity: 0.35,
  },
  timeframeText: {
    fontSize: 13,
  },
  sectionContainer: {
    marginBottom: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    letterSpacing: 0.2,
    marginBottom: spacing.sm,
  },
  cardBox: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  rangeBarGroup: {
    gap: spacing.xs,
  },
  rangeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    justifyContent: 'center',
  },
  rangeFill: {
    height: 6,
    borderRadius: 3,
  },
  rangePin: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
    top: -2,
  },
  statsGrid: {
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statGridRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  statGridCol: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 15,
  },
  descriptionText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  readMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  infoTagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  infoTagItem: {
    minWidth: '45%',
    gap: 2,
  },
  infoTagLabel: {
    fontSize: 11.5,
  },
  infoTagValue: {
    fontSize: 13.5,
  },
  websiteButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  websiteButtonText: {
    fontSize: 13.5,
  },
  anchoredFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: 1,
  },
  positionContainer: {
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  positionTitle: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  positionDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs - 2,
  },
  positionLeftGroup: {
    gap: 2,
  },
  positionSharesText: {
    fontSize: 16,
  },
  positionAvgCostLabel: {
    fontSize: 12,
  },
  positionRightGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  positionValueText: {
    fontSize: 18,
  },
  positionReturnText: {
    fontSize: 13,
  },
  paperTradeButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs - 2,
  },
  paperTradeBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperBuyBtn: {
    backgroundColor: '#00D084',
  },
  paperSellBtn: {
    backgroundColor: '#FF4D4F',
  },
  paperTradeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  lastUpdatedText: {
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 4,
  },
});

export default React.memo(StockDetailModal);
