import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { useMarketData } from '../../context/MarketDataContext';
import { yahooFinanceService } from '../../services/yahooFinanceService';
import { spacing, borderRadius } from '../../constants/theme';
import { modalStyles, layoutStyles } from '../../styles';
import { formatMoney, formatShares } from '../../utils/formatters';
import AppText from '../common/AppText';

// Confirms an order: fetches a real price, executes the paper trade, shows result
export default function OrderExecutedModal({
  visible,
  orderParams,
  onClose,
  onComplete,
}) {
  const { theme, isDark } = useTheme();
  const { executeOrder } = usePortfolio();
  const { injectLivePrice, fetchQuote } = useMarketData();

  const [isLoading, setIsLoading] = useState(true);
  const [executionResult, setExecutionResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Prefer onComplete (order flow), fall back to onClose
  const handleDismiss = () => {
    if (onComplete) {
      onComplete();
    } else if (onClose) {
      onClose();
    }
  };

  useEffect(() => {
    let isMounted = true;

    if (visible && orderParams) {
      setIsLoading(true);
      setExecutionResult(null);
      setErrorMessage('');

      async function processTrade() {
        try {
          const sym = orderParams.symbol;
          const liveRecentPrice = await yahooFinanceService.getMostRecentPrice(sym);
          const fillPrice =
            typeof liveRecentPrice === 'number' && liveRecentPrice > 0
              ? liveRecentPrice
              : (orderParams.fallbackPrice || 100.0);

          if (typeof fillPrice === 'number' && fillPrice > 0 && injectLivePrice) {
            injectLivePrice(sym, fillPrice);
          }

          const result = executeOrder({
            portfolioId: orderParams.portfolioId,
            symbol: sym,
            name: orderParams.name || sym,
            mode: orderParams.mode || 'BUY',
            shares: orderParams.shares,
            price: fillPrice,
          });

          if (fetchQuote && sym) {
            fetchQuote(sym);
          }

          if (isMounted) {
            setExecutionResult(result);
            setIsLoading(false);
          }
        } catch (err) {
          if (isMounted) {
            setErrorMessage(err.message || 'Failed to execute order');
            setIsLoading(false);
          }
        }
      }

      processTrade();
    }

    return () => {
      isMounted = false;
    };
  }, [visible, orderParams, executeOrder]);

  // Render nothing while hidden
  if (!visible) return null;

  // Resolve display fields from result (post-trade) or original order params
  const symbol = orderParams?.symbol?.toUpperCase() || 'NVDA';
  const isBuy = (orderParams?.mode || executionResult?.mode || 'BUY') === 'BUY';
  const tradedShares = executionResult?.shares ?? orderParams?.shares ?? 0;
  const fillPrice = executionResult?.fillPrice ?? orderParams?.fallbackPrice ?? 0;
  const orderCost = executionResult?.orderCost ?? (tradedShares * fillPrice);

  // Derived post-trade position summary
  const newPosition = executionResult?.newPosition || null;
  const totalPositionShares = newPosition?.shares ?? 0;
  const positionAvgCost = newPosition?.avgCost ?? 0;
  const totalPositionValue = totalPositionShares * fillPrice;

  // Order summary rows rendered at the top of the confirmation
  const orderRows = [
    { label: 'TICKER', value: symbol, isTicker: true },
    { label: 'SHARE COUNT', value: formatShares(tradedShares) },
    { label: 'SHARE FILL PRICE', value: formatMoney(fillPrice) },
    { label: isBuy ? 'ORDER COST' : 'ORDER PROCEEDS', value: formatMoney(orderCost) },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleDismiss}
    >
      <View style={modalStyles.modalOverlayLight}>
        <TouchableOpacity
          style={modalStyles.topBackdropGap}
          activeOpacity={1}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close Order Complete Modal"
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
              <AppText bold style={styles.headerTitle}>
                Order Complete
              </AppText>

              <TouchableOpacity
                onPress={handleDismiss}
                style={modalStyles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Ionicons name="close" size={24} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <View style={[layoutStyles.flex1, layoutStyles.center, styles.loadingContainer]}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : errorMessage ? (
              <View style={[layoutStyles.flex1, layoutStyles.center, styles.errorContainer]}>
                <Ionicons name="alert-circle-outline" size={48} color="#FF4D4F" />
                <AppText bold style={styles.errorTitle}>
                  Order Failed
                </AppText>
                <AppText style={[styles.errorMessage, { color: theme.textSecondary }]}>
                  {errorMessage}
                </AppText>
                <TouchableOpacity
                  style={[styles.continueButton, { backgroundColor: theme.primary, marginTop: spacing.xl }]}
                  onPress={handleDismiss}
                  activeOpacity={0.85}
                >
                  <AppText bold style={styles.continueButtonText}>
                    Dismiss
                  </AppText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.contentContainer}>
                <View style={styles.topSection}>
                  {orderRows.map((row) => (
                    <View key={row.label} style={styles.dataRow}>
                      <AppText bold style={[styles.rowLabel, { color: theme.textSecondary }]}>
                        {row.label}
                      </AppText>
                      <AppText bold style={row.isTicker ? styles.tickerValue : styles.detailValue}>
                        {row.value}
                      </AppText>
                    </View>
                  ))}
                </View>

                <View
                  style={[
                    styles.divider,
                    { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.15)' : theme.border },
                  ]}
                />

                <View style={styles.positionSection}>
                  <AppText bold style={[styles.positionHeader, { color: theme.textSecondary }]}>
                    {symbol} POSITION
                  </AppText>

                  <View style={styles.positionRow}>
                    <View style={styles.positionLeft}>
                      <AppText bold style={styles.positionShares}>
                        {formatShares(totalPositionShares)}
                      </AppText>
                      <AppText style={[styles.avgCostLabel, { color: theme.textSecondary }]}>
                        Avg cost:{' '}
                        <AppText bold style={{ color: theme.textPrimary }}>
                          {formatMoney(positionAvgCost)}
                        </AppText>
                      </AppText>
                    </View>

                    <View style={styles.positionRight}>
                      <AppText bold style={styles.positionTotalValue}>
                        {formatMoney(totalPositionValue)}
                      </AppText>
                    </View>
                  </View>
                </View>

                <View style={layoutStyles.flex1} />

                <TouchableOpacity
                  style={[styles.continueButton, { backgroundColor: theme.primary }]}
                  onPress={handleDismiss}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                >
                  <AppText bold style={styles.continueButtonText}>
                    Continue
                  </AppText>
                </TouchableOpacity>
              </View>
            )}
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

// Confirmation layout: header, loading/error/content states, position block, continue
const styles = StyleSheet.create({
  headerTitle: {
    fontSize: 20,
    letterSpacing: 0.3,
  },
  loadingContainer: {
    padding: spacing.xxl,
    gap: spacing.md,
  },
  errorContainer: {
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: 18,
    marginTop: spacing.sm,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  topSection: {
    gap: spacing.lg + 2,
    marginBottom: spacing.lg,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 13.5,
    letterSpacing: 0.6,
  },
  tickerValue: {
    fontSize: 20,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 20,
    letterSpacing: 0.3,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
  },
  positionSection: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  positionHeader: {
    fontSize: 13.5,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  positionLeft: {
    gap: 3,
  },
  positionShares: {
    fontSize: 18,
    letterSpacing: 0.2,
  },
  avgCostLabel: {
    fontSize: 13.5,
  },
  positionRight: {
    alignItems: 'flex-end',
  },
  positionTotalValue: {
    fontSize: 24,
    letterSpacing: 0.2,
  },
  continueButton: {
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
});
