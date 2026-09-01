import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { spacing, borderRadius } from '../../constants/theme';
import { modalStyles, layoutStyles } from '../../styles';
import AppText from '../common/AppText';
import CompanyLogo from '../common/CompanyLogo';
import StockInteractiveChart from './StockInteractiveChart';
import OrderExecutedModal from './OrderExecutedModal';

export default function StockOrderModal({
  visible,
  onClose,
  stock,
  mode = 'BUY', // 'BUY' | 'SELL'
}) {
  const { theme, isDark } = useTheme();
  const { quotes, fetchHistoricalChart } = useMarketData();
  const { portfolios, activePortfolioId, getPosition } = usePortfolio();

  const scrollViewRef = useRef(null);
  const [rowsYOffset, setRowsYOffset] = useState(80);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Selected portfolio state
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(activePortfolioId);
  const [portfolioPickerVisible, setPortfolioPickerVisible] = useState(false);

  // Separate toggle states for Row 2 (Owned) and Row 3 (Input)
  const [isOwnedUsdMode, setIsOwnedUsdMode] = useState(false);
  const [isInputUsdMode, setIsInputUsdMode] = useState(false);
  const [quantityInput, setQuantityInput] = useState('10');
  const [chartData, setChartData] = useState(null);
  const [isChartLoading, setIsChartLoading] = useState(true);

  // Order Executed Modal states
  const [executedModalVisible, setExecutedModalVisible] = useState(false);
  const [pendingOrderParams, setPendingOrderParams] = useState(null);
  const [validationError, setValidationError] = useState('');

  // Keep selected portfolio in sync
  useEffect(() => {
    if (activePortfolioId) {
      setSelectedPortfolioId(activePortfolioId);
    }
  }, [activePortfolioId, visible]);

  const selectedPortfolioObj = useMemo(() => {
    return (
      portfolios.find((p) => p.id === selectedPortfolioId) ||
      portfolios[0] ||
      null
    );
  }, [portfolios, selectedPortfolioId]);

  // Live WebSocket price
  const cleanSymbol = (stock?.symbol || 'NVDA').toUpperCase();
  const wsQuote = quotes[cleanSymbol] || quotes[stock?.symbol];
  const liveWsPrice =
    wsQuote?.isLiveWs && typeof wsQuote?.price === 'number' ? wsQuote.price : null;
  const currentPrice =
    liveWsPrice ?? stock?.price ?? wsQuote?.price ?? 100.0;

  // Real portfolio values
  const initialCash = selectedPortfolioObj?.cash ?? 10000.0;
  const positionObj = getPosition(selectedPortfolioId, cleanSymbol);
  const ownedShares = positionObj ? Number(positionObj.shares) || 0 : 0;

  // Load 1D chart data on open
  useEffect(() => {
    if (!visible || !stock?.symbol) return;
    let isMounted = true;
    setIsChartLoading(true);

    fetchHistoricalChart(stock.symbol, '1D').then((data) => {
      if (isMounted) {
        if (data) {
          setChartData(data);
        }
        setIsChartLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [visible, stock?.symbol, fetchHistoricalChart]);

  // Reset inputs when modal becomes visible
  useEffect(() => {
    if (visible) {
      setIsInputUsdMode(false);
      setIsOwnedUsdMode(false);
      setQuantityInput('10');
    }
  }, [visible]);

  // Auto-scroll when keyboard opens so "Free Cash" is pinned at the top and all values stay visible
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, rowsYOffset - spacing.xs),
          animated: true,
        });
      }, 50);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      scrollViewRef.current?.scrollTo({
        y: 0,
        animated: true,
      });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [rowsYOffset]);

  const handleInputFocus = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, rowsYOffset - spacing.xs),
        animated: true,
      });
    }, 50);
  }, [rowsYOffset]);

  // Toggle Row 2 (Owned row) between shares and USD
  const handleToggleOwnedUnit = useCallback(() => {
    setIsOwnedUsdMode((prev) => !prev);
  }, []);

  // Toggle Row 3 (Input row) between shares and USD: converts value while preserving order cost!
  const handleToggleInputUnit = useCallback(() => {
    setIsInputUsdMode((prev) => {
      const next = !prev;
      const num = parseFloat(quantityInput);
      if (isNaN(num) || num <= 0 || !currentPrice) {
        setQuantityInput(next ? '10000' : '10');
        return next;
      }

      if (next) {
        // Converting from shares to USD: max 2 decimal places
        const usdValue = num * currentPrice;
        const formattedUsd = parseFloat(usdValue.toFixed(2)).toString();
        setQuantityInput(formattedUsd);
      } else {
        // Converting from USD to shares: max 4 decimal places
        const sharesValue = num / currentPrice;
        const formattedShares = parseFloat(sharesValue.toFixed(4)).toString();
        setQuantityInput(formattedShares);
      }
      return next;
    });
  }, [quantityInput, currentPrice]);

  // Clean numeric / decimal input change enforcing max dp
  const handleInputChange = useCallback((text) => {
    let cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const maxDp = isInputUsdMode ? 2 : 4;
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    const currentParts = cleaned.split('.');
    if (currentParts.length === 2 && currentParts[1].length > maxDp) {
      cleaned = currentParts[0] + '.' + currentParts[1].slice(0, maxDp);
    }
    setQuantityInput(cleaned);
  }, [isInputUsdMode]);

  // Calculations for order cost and after values
  const parsedInput = parseFloat(quantityInput) || 0;
  const orderShares = isInputUsdMode
    ? currentPrice > 0
      ? parsedInput / currentPrice
      : 0
    : parsedInput;
  const orderCost = isInputUsdMode ? parsedInput : parsedInput * currentPrice;

  const isBuy = mode === 'BUY';
  const afterCash = isBuy ? initialCash - orderCost : initialCash + orderCost;
  const afterShares = isBuy
    ? ownedShares + orderShares
    : Math.max(0, ownedShares - orderShares);

  // Formatting helpers
  const formatMoney = (val) => {
    return `$${Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatShares = (val) => {
    const num = Number(val || 0);
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    return `${formatted} shares`;
  };

  const chartPoints = useMemo(() => {
    if (chartData?.points && chartData.points.length > 0) {
      return chartData.points;
    }
    if (stock?.sparkline && stock.sparkline.length > 0) {
      return stock.sparkline;
    }
    return [];
  }, [chartData, stock?.sparkline]);

  const buttonBgColor = isBuy ? '#38C172' : '#FF4D4F';

  const handleSubmitOrder = () => {
    setValidationError('');
    if (orderShares <= 0) {
      setValidationError('Please enter a valid quantity.');
      return;
    }
    if (isBuy && orderCost > initialCash) {
      setValidationError(`Order cost exceeds free cash (${formatMoney(initialCash)})`);
      return;
    }
    if (!isBuy && orderShares > ownedShares && Math.abs(orderShares - ownedShares) > 0.0001) {
      setValidationError(`You only own ${formatShares(ownedShares)}`);
      return;
    }

    setPendingOrderParams({
      portfolioId: selectedPortfolioId,
      symbol: cleanSymbol,
      name: stock?.name || cleanSymbol,
      mode,
      shares: Number(orderShares.toFixed(4)),
      fallbackPrice: currentPrice,
    });
    setExecutedModalVisible(true);
  };

  const handleOrderCompleted = () => {
    setExecutedModalVisible(false);
    setPendingOrderParams(null);
    onClose();
  };

  return (
    <>
      <Modal
        visible={visible && !executedModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={modalStyles.modalOverlayLight}>
          {/* Top Backdrop Gap */}
          <TouchableOpacity
            style={modalStyles.topBackdropGap}
            activeOpacity={1}
            onPress={onClose}
          />

          {/* Modal Sheet Container */}
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
              {/* Header */}
              <View
                style={[
                  modalStyles.header,
                  { borderBottomColor: theme.borderSubtle },
                ]}
              >
                <AppText bold style={styles.modalTitle}>
                  Execute Paper Order
                </AppText>

                <TouchableOpacity
                  onPress={onClose}
                  style={modalStyles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close Order Modal"
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                  <Ionicons name="close" size={24} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={layoutStyles.flex1}
              >
                <ScrollView
                  ref={scrollViewRef}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={[
                    styles.scrollContainer,
                    isKeyboardVisible && { paddingBottom: 240 },
                  ]}
                >
                  {/* 1. SELECT PORTFOLIO */}
                  <View style={styles.portfolioSection}>
                    <AppText
                      bold
                      style={[modalStyles.sectionLabel, { color: theme.textSecondary }]}
                    >
                      SELECT PORTFOLIO
                    </AppText>

                    <TouchableOpacity
                      style={[
                        styles.portfolioSelector,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() => setPortfolioPickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <AppText bold style={styles.portfolioText}>
                        {selectedPortfolioObj?.title || 'Portfolio 1'}
                      </AppText>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={theme.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Divider Line */}
                  <View
                    style={[
                      styles.divider,
                      { borderBottomColor: theme.borderSubtle },
                    ]}
                  />

                  {/* 2. FINANCIAL ROWS */}
                  <View
                    style={styles.dataRowsContainer}
                    onLayout={(e) => {
                      const y = e.nativeEvent.layout.y;
                      if (y > 0) setRowsYOffset(y);
                    }}
                  >
                    {/* Row 1: FREE CASH */}
                    <View style={styles.dataRow}>
                      <AppText bold style={[styles.rowLabel, { color: theme.textSecondary }]}>
                        FREE CASH
                      </AppText>
                      <View style={styles.rowValueGroup}>
                        <AppText bold style={styles.primaryValueText}>
                          {formatMoney(initialCash)}
                        </AppText>
                        <AppText style={[styles.subValueText, { color: theme.textSecondary }]}>
                          After:{' '}
                          <AppText style={{ color: theme.textPrimary }}>
                            {formatMoney(afterCash)}
                          </AppText>
                        </AppText>
                      </View>
                    </View>

                    {/* Row 2: OWNED [SYMBOL] <--> (Toggles Row 2 values between shares and USD) */}
                    <View style={styles.dataRow}>
                      <View style={styles.labelWithToggle}>
                        <AppText bold style={[styles.rowLabel, { color: theme.textSecondary }]}>
                          OWNED{' '}
                          <AppText bold style={{ color: theme.textPrimary }}>
                            {cleanSymbol}
                          </AppText>
                        </AppText>
                        <TouchableOpacity
                          style={styles.swapBtn}
                          onPress={handleToggleOwnedUnit}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Toggle owned shares or USD"
                        >
                          <Ionicons
                            name="swap-horizontal"
                            size={20}
                            color={theme.primary}
                          />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.rowValueGroup}>
                        <AppText bold style={styles.primaryValueText}>
                          {isOwnedUsdMode
                            ? formatMoney(ownedShares * currentPrice)
                            : formatShares(ownedShares)}
                        </AppText>
                        <AppText style={[styles.subValueText, { color: theme.textSecondary }]}>
                          After:{' '}
                          <AppText style={{ color: theme.textPrimary }}>
                            {isOwnedUsdMode
                              ? formatMoney(afterShares * currentPrice)
                              : formatShares(afterShares)}
                          </AppText>
                        </AppText>
                      </View>
                    </View>

                    {/* Row 3: BUY/SELL SHARES <--> with Input (Toggles input between shares and USD) */}
                    <View style={styles.dataRow}>
                      <View style={styles.labelWithToggle}>
                        <AppText bold style={[styles.rowLabel, { color: theme.textSecondary }]}>
                          {isBuy ? 'BUY' : 'SELL'}{' '}
                          {isInputUsdMode ? 'USD' : 'SHARES'}
                        </AppText>
                        <TouchableOpacity
                          style={styles.swapBtn}
                          onPress={handleToggleInputUnit}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Toggle input shares or USD"
                        >
                          <Ionicons
                            name="swap-horizontal"
                            size={20}
                            color={theme.primary}
                          />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.inputAndUnitRow}>
                        <TextInput
                          style={[
                            styles.quantityInput,
                            {
                              color: theme.textPrimary,
                              backgroundColor: isDark ? '#181E29' : '#E8ECF2',
                              borderColor: theme.border,
                            },
                          ]}
                          keyboardType="numeric"
                          returnKeyType="done"
                          value={quantityInput}
                          onChangeText={handleInputChange}
                          onFocus={handleInputFocus}
                        />
                        <AppText bold style={styles.unitText}>
                          {isInputUsdMode ? 'USD' : 'shares'}
                        </AppText>
                      </View>
                    </View>

                    {/* Row 4: ORDER COST / PROCEEDS */}
                    <View style={styles.dataRow}>
                      <AppText bold style={[styles.rowLabel, { color: theme.textSecondary }]}>
                        {isBuy ? 'ORDER COST' : 'ORDER PROCEEDS'}
                      </AppText>
                      <AppText bold style={styles.orderCostText}>
                        {formatMoney(orderCost)}
                      </AppText>
                    </View>

                    {/* Validation Error Alert */}
                    {validationError ? (
                      <AppText style={styles.errorText}>
                        {validationError}
                      </AppText>
                    ) : null}
                  </View>

                  {/* 3. BOTTOM SECTION: Latest Price + Horizontal Submit Button, with full-width 1D Chart below */}
                  <View style={styles.bottomSection}>
                    {/* Top Row: Latest Price & Horizontal Submit Button */}
                    <View style={styles.priceAndSubmitRow}>
                      <View style={styles.latestPriceRow}>
                        <CompanyLogo
                          symbol={cleanSymbol}
                          size={42}
                          logoUri={stock?.logo}
                          style={styles.companyLogo}
                        />
                        <View style={styles.priceTextGroup}>
                          <AppText style={[styles.latestPriceLabel, { color: theme.textSecondary }]}>
                            Latest price:
                          </AppText>
                          <AppText bold style={styles.latestPriceValue}>
                            {formatMoney(currentPrice)}
                          </AppText>
                        </View>
                      </View>

                      {/* Horizontal Submit Button */}
                      <TouchableOpacity
                        style={[
                          styles.horizontalSubmitButton,
                          { backgroundColor: buttonBgColor },
                        ]}
                        onPress={handleSubmitOrder}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Submit Order"
                      >
                        <AppText bold style={styles.horizontalSubmitButtonText}>
                          Submit
                        </AppText>
                      </TouchableOpacity>
                    </View>

                    {/* Full-width Mini 1D Interactive Chart */}
                    <View
                      style={[
                        styles.miniChartContainer,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      {isChartLoading && chartPoints.length === 0 ? (
                        <View style={layoutStyles.center}>
                          <ActivityIndicator size="small" color={theme.primary} />
                        </View>
                      ) : (
                        <StockInteractiveChart
                          points={chartData?.points || []}
                          sparkline={stock?.sparkline || []}
                          timeframe="1D"
                          color="#00D084"
                        />
                      )}
                    </View>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </View>
        </View>

        {/* Portfolio Selection Dialog */}
        {portfolioPickerVisible && (
          <Modal
            visible={portfolioPickerVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setPortfolioPickerVisible(false)}
          >
            <TouchableOpacity
              style={styles.pickerOverlay}
              activeOpacity={1}
              onPress={() => setPortfolioPickerVisible(false)}
            >
              <View
                style={[
                  styles.pickerCard,
                  {
                    backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                    borderColor: theme.border,
                  },
                ]}
              >
                <AppText bold style={styles.pickerTitle}>
                  Select Portfolio
                </AppText>
                {portfolios.map((p) => {
                  const isSelected = p.id === selectedPortfolioId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.pickerOption,
                        isSelected && {
                          backgroundColor: isDark ? '#252C3A' : '#E8ECF2',
                        },
                      ]}
                      onPress={() => {
                        setSelectedPortfolioId(p.id);
                        setPortfolioPickerVisible(false);
                      }}
                    >
                      <AppText bold={isSelected} style={styles.pickerOptionText}>
                        {p.title}
                      </AppText>
                      <AppText style={[styles.pickerOptionCash, { color: theme.textSecondary }]}>
                        {formatMoney(p.cash)}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </Modal>

      {/* Order Executed Modal Confirmation */}
      <OrderExecutedModal
        visible={executedModalVisible}
        orderParams={pendingOrderParams}
        onComplete={handleOrderCompleted}
        onClose={handleOrderCompleted}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalTitle: {
    fontSize: 20,
    letterSpacing: 0.3,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  portfolioSection: {
    marginBottom: spacing.md,
  },
  portfolioSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  portfolioText: {
    fontSize: 16,
  },
  divider: {
    borderBottomWidth: 1,
    marginVertical: spacing.md,
  },
  dataRowsContainer: {
    gap: spacing.lg * 1.3,
    marginBottom: spacing.lg,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  labelWithToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  swapBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  rowValueGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  primaryValueText: {
    fontSize: 22,
    letterSpacing: 0.2,
  },
  subValueText: {
    fontSize: 13,
  },
  inputAndUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quantityInput: {
    minWidth: 86,
    maxWidth: 130,
    height: 42,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'TangoSans-Bold',
  },
  unitText: {
    fontSize: 20,
  },
  orderCostText: {
    fontSize: 24,
    letterSpacing: 0.2,
  },
  errorText: {
    fontSize: 13,
    color: '#FF4D4F',
    marginTop: 4,
    textAlign: 'right',
  },
  bottomSection: {
    flex: 1,
    gap: spacing.md,
    marginTop: spacing.sm,
    minHeight: 180,
  },
  priceAndSubmitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  latestPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  companyLogo: {
    borderRadius: borderRadius.sm,
  },
  priceTextGroup: {
    gap: 1,
  },
  latestPriceLabel: {
    fontSize: 12,
  },
  latestPriceValue: {
    fontSize: 22,
    letterSpacing: 0.2,
  },
  horizontalSubmitButton: {
    paddingVertical: spacing.sm + 3,
    paddingHorizontal: spacing.xl + 4,
    borderRadius: borderRadius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 124,
  },
  horizontalSubmitButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontFamily: 'TangoSans-Bold',
  },
  miniChartContainer: {
    flex: 1,
    minHeight: 150,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  pickerTitle: {
    fontSize: 18,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  pickerOptionText: {
    fontSize: 15,
  },
  pickerOptionCash: {
    fontSize: 14,
  },
});
