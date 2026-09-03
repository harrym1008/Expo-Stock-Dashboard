import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { spacing, borderRadius } from '../../constants/theme';
import { modalStyles, layoutStyles } from '../../styles';
import { formatMoney, formatShares } from '../../utils/formatters';
import AppText from '../common/AppText';
import CompanyLogo from '../common/CompanyLogo';
import StockInteractiveChart from './StockInteractiveChart';
import OrderExecutedModal from './OrderExecutedModal';

// Modal for entering a paper trade order (buy or sell) for a stock (cannot trade non-stock securities)
function StockOrderModalInner({
  visible,
  onClose,
  stock,
  mode,
}) {
  const { theme, isDark } = useTheme();
  const { quotes, fetchHistoricalChart } = useMarketData();
  const { portfolios, activePortfolioId, getPosition } = usePortfolio();

  const scrollViewRef = useRef(null);

  const [selectedPortfolioId, setSelectedPortfolioId] = useState(activePortfolioId);
  const [portfolioPickerVisible, setPortfolioPickerVisible] = useState(false);

  const [isOwnedUsdMode, setIsOwnedUsdMode] = useState(false);
  const [isInputUsdMode, setIsInputUsdMode] = useState(false);
  const [quantityInput, setQuantityInput] = useState('10');
  const [chartData, setChartData] = useState(null);
  const [isChartLoading, setIsChartLoading] = useState(true);

  const [executedModalVisible, setExecutedModalVisible] = useState(false);
  const [pendingOrderParams, setPendingOrderParams] = useState(null);
  const [validationError, setValidationError] = useState('');

  // Make sure the selected portfolio in the portfolio tab is the default when the modal opens (user can change)
  useEffect(() => {
    if (activePortfolioId) {
      setSelectedPortfolioId(activePortfolioId);
    }
  }, [activePortfolioId, visible]);

  // Resolved portfolio (selected, else first)
  const selectedPortfolioObj = useMemo(() => {
    return (
      portfolios.find((p) => p.id === selectedPortfolioId) ||
      portfolios[0] ||
      null
    );
  }, [portfolios, selectedPortfolioId]);

  // Current price: live WS > stock field > quote > fallback to null, dont render if null
  const cleanSymbol = (stock?.symbol || 'NVDA').toUpperCase();
  const wsQuote = quotes[cleanSymbol] || quotes[stock?.symbol];
  const liveWsPrice =
    wsQuote?.isLiveWs && typeof wsQuote?.price === 'number' ? wsQuote.price : null;
  const currentPrice =
    liveWsPrice ?? stock?.price ?? wsQuote?.price ?? 0;

  const initialCash = selectedPortfolioObj?.cash ?? 10000.0;
  const positionObj = getPosition(selectedPortfolioId, cleanSymbol);
  const ownedShares = positionObj ? Number(positionObj.shares) || 0 : 0;

  // Fetch 1D historical chart data for the stock when the modal opens, to display in the mini chart
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

  // Reset input fields and validation error when the modal opens
  useEffect(() => {
    if (visible) {
      setIsInputUsdMode(false);
      setIsOwnedUsdMode(false);
      setQuantityInput('10');
      setValidationError('');
    }
  }, [visible]);

  // Toggle between shares and USD for the owned value
  const handleToggleOwnedUnit = useCallback(() => {
    setIsOwnedUsdMode((prev) => !prev);
  }, []);

  // Toggle input unit between USD and shares; recompute the other side at current price
  const handleToggleInputUnit = useCallback(() => {
    setIsInputUsdMode((prev) => {
      const next = !prev;
      const num = parseFloat(quantityInput);
      if (isNaN(num) || num <= 0 || !currentPrice) {
        setQuantityInput(next ? '10000' : '10');
        return next;
      }

      if (next) {
        const usdValue = num * currentPrice;
        setQuantityInput(parseFloat(usdValue.toFixed(2)).toString());
      } else {
        const sharesValue = num / currentPrice;
        setQuantityInput(parseFloat(sharesValue.toFixed(4)).toString());
      }
      return next;
    });
  }, [quantityInput, currentPrice]);

  // Sanitise numeric input, limiting decimals to the current unit mode
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

  // Resolve input into shares and cost depending on unit mode
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

  const chartPoints = useMemo(() => {
    if (chartData?.points && chartData.points.length > 0) {
      return chartData.points;
    }
    if (stock?.sparkline && stock.sparkline.length > 0) {
      return stock.sparkline;
    }
    return [];
  }, [chartData, stock?.sparkline]);

  // Buy = green, sell = red
  const buttonBgColor = isBuy ? '#38C172' : '#FF4D4F';

  // Validate the order then open the confirmation modal with the order params
  const handleSubmitOrder = () => {
    setValidationError('');

    // Validate the order for positive quantity, sufficient cash for buy, and sufficient shares for sell
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

  // Dismiss the confirmation sheet and close the order modal
  const handleOrderCompleted = () => {
    setExecutedModalVisible(false);
    setPendingOrderParams(null);
    onClose();
  };

  if (!currentPrice || currentPrice <= 0) {
    return null;
  }

  // Return the populated order modal
  return (
    <>
      <Modal
        visible={visible && !executedModalVisible}
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
                  contentContainerStyle={styles.scrollContainer}
                >
                  {/* Portfolio selector */}
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

                  <View
                    style={[
                      styles.divider,
                      { borderBottomColor: theme.borderSubtle },
                    ]}
                  />

                  {/* Order data rows */}
                  <View style={styles.dataRowsContainer}>
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

                    {/* Row 2: OWNED */}
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

                    {/* Row 3: INPUT */}
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
                        />
                        <AppText bold style={styles.unitText}>
                          {isInputUsdMode ? 'USD' : 'shares'}
                        </AppText>
                      </View>
                    </View>

                    {/* Row 4: ORDER COST */}
                    <View style={styles.dataRow}>
                      <AppText bold style={[styles.rowLabel, { color: theme.textSecondary }]}>
                        {isBuy ? 'ORDER COST' : 'ORDER PROCEEDS'}
                      </AppText>
                      <AppText bold style={styles.orderCostText}>
                        {formatMoney(orderCost)}
                      </AppText>
                    </View>

                    {validationError ? (
                      <AppText style={styles.errorText}>
                        {validationError}
                      </AppText>
                    ) : null}
                  </View>

                  {/* Latest Price, Submit and 1 day Chart at the bottom */}
                  <View style={styles.bottomSection}>
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

        {/* Portfolio selection dialogue box */}
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

      {/* Order Receipt Modal */}
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

export default function StockOrderModal({
  visible,
  onClose,
  stock,
  mode,
}) {
  if (!visible) return null;
  return (
    <StockOrderModalInner
      visible={visible}
      onClose={onClose}
      stock={stock}
      mode={mode}
    />
  );
}
