import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';
import TabSelector from '../components/common/TabSelector';
import AppText from '../components/common/AppText';
import CompanyLogo from '../components/common/CompanyLogo';
import StockDetailModal from '../components/stock/StockDetailModal';
import TextInputModal from '../components/common/TextInputModal';
import CreatePortfolioModal from '../components/common/CreatePortfolioModal';
import { useTheme } from '../context/ThemeContext';
import { useTrading } from '../context/TradingContext';
import { usePortfolio } from '../context/PortfolioContext';
import { useMarketData } from '../context/MarketDataContext';
import { spacing, borderRadius } from '../constants/theme';
import { layoutStyles } from '../styles';
import { formatMoney, formatStockQuote } from '../utils/formatters';

export default function PortfolioScreen() {
  const { theme, isDark } = useTheme();
  const { isPaperTradingEnabled } = useTrading();
  const {
    quotes,
    profiles,
    marketStatus,
    fetchQuote,
    fetchProfile,
    setActiveModalSymbol,
    hasValidKey,
  } = useMarketData();
  const {
    portfolios,
    activePortfolioId,
    setActivePortfolioId,
    activePortfolio,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,
    reorderPortfolios,
  } = usePortfolio();
  const { isPaperTradingEnabled } = useTrading();

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);

  // Modals state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState(null);
  const [renameInitialValue, setRenameInitialValue] = useState('');

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  const handleOpenAddPortfolio = useCallback(() => {
    setCreateModalVisible(true);
  }, []);

  const handleCreatePortfolioSubmit = useCallback(
    ({ title, cash }) => {
      createPortfolio({ title, cash });
      setCreateModalVisible(false);
    },
    [createPortfolio]
  );

  const handleOpenRenamePortfolio = useCallback(
    (id) => {
      const target = portfolios.find((p) => p.id === id);
      if (!target) return;
      setRenameTargetId(id);
      setRenameInitialValue(target.title);
      setRenameModalVisible(true);
    },
    [portfolios]
  );

  const handleRenamePortfolioSubmit = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed || !renameTargetId) return;
      renamePortfolio(renameTargetId, trimmed);
      setRenameModalVisible(false);
    },
    [renamePortfolio, renameTargetId]
  );

  const handleDeletePortfolio = useCallback(
    (id) => {
      deletePortfolio(id);
    },
    [deletePortfolio]
  );

  const handleReorderPortfolios = useCallback(
    (reordered) => {
      reorderPortfolios(reordered);
    },
    [reorderPortfolios]
  );

  const handleOpenStockDetail = useCallback(
    (position) => {
      setSelectedStock({
        symbol: position.symbol,
        name: position.name,
      });
      if (setActiveModalSymbol) {
        setActiveModalSymbol(position.symbol);
      }
      if (fetchQuote && position.symbol) {
        fetchQuote(position.symbol);
      }
    },
    [setActiveModalSymbol, fetchQuote]
  );

  const handleCloseStockDetail = useCallback(() => {
    setSelectedStock(null);
    if (setActiveModalSymbol) {
      setActiveModalSymbol(null);
    }
  }, [setActiveModalSymbol]);

  // Fetch live quotes and profiles for active portfolio positions on mount, tab change & session transition
  useEffect(() => {
    if (!activePortfolio?.positions || !fetchQuote) return;
    for (const pos of activePortfolio.positions) {
      const sym = pos.symbol?.toUpperCase();
      if (sym) {
        fetchQuote(sym);
        if (hasValidKey && fetchProfile) {
          fetchProfile(sym);
        }
      }
    }
  }, [
    activePortfolioId,
    marketStatus.session,
    fetchQuote,
    fetchProfile,
    hasValidKey,
    activePortfolio?.positions,
  ]);

  // Compute live value/return for each position
  const positionsWithLiveMetrics = useMemo(() => {
    if (!activePortfolio || !Array.isArray(activePortfolio.positions)) return [];
    return activePortfolio.positions.map((pos) => {
      const sym = pos.symbol?.toUpperCase();
      const quote = quotes[sym] || quotes[pos.symbol] || {};
      const profile = profiles[sym] || profiles[pos.symbol];
      const formatted = formatStockQuote(pos, quote, profile, null, marketStatus);
      const livePrice =
        typeof formatted.price === 'number' && formatted.price > 0
          ? formatted.price
          : (typeof pos.avgCost === 'number' && pos.avgCost > 0 ? pos.avgCost : 0);
      const sharesNum = Number(pos.shares) || 0;
      const totalVal = sharesNum * livePrice;
      const avgCost = Number(pos.avgCost) || livePrice;
      const totalCost = pos.totalCost ?? sharesNum * avgCost;
      const gainLoss = totalVal - totalCost;
      const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;
      const todayChange = (formatted.change || 0) * sharesNum;

      return {
        ...pos,
        name: formatted.displayName || pos.name || sym,
        livePrice,
        totalValue: totalVal,
        changePercent: gainLossPercent,
        gainLoss,
        todayChange,
        quoteChangePercent: formatted.changePercent || 0,
        formattedStock: formatted,
      };
    });
  }, [activePortfolio, quotes, profiles, marketStatus]);

  // Sum positions + cash for total value; compute return since starting cash
  const portfolioMetrics = useMemo(() => {
    const cash = activePortfolio?.cash || 0;
    const startingCash = activePortfolio?.startingCash || cash || 10000;
    const positionsValue = positionsWithLiveMetrics.reduce(
      (sum, p) => sum + p.totalValue,
      0
    );
    const totalValue = cash + positionsValue;

    // Return since start
    const sinceStartChange = totalValue - startingCash;
    const sinceStartChangePercent =
      startingCash > 0 ? (sinceStartChange / startingCash) * 100 : 0;

    return {
      totalValue,
      sinceStartChangePercent,
    };
  }, [activePortfolio, positionsWithLiveMetrics]);

  // Prefer the live-formatted position; fall back to formatting the raw selected stock
  const modalStock = useMemo(() => {
    if (!selectedStock) return null;
    const sym = selectedStock.symbol?.toUpperCase();
    const activePosition = positionsWithLiveMetrics.find(
      (p) => p.symbol?.toUpperCase() === sym
    );
    if (activePosition?.formattedStock) {
      return activePosition.formattedStock;
    }
    return formatStockQuote(
      selectedStock,
      quotes[sym],
      profiles[sym],
      null,
      marketStatus
    );
  }, [selectedStock, positionsWithLiveMetrics, quotes, profiles, marketStatus]);

  // Green when the portfolio is up since start
  const isStartPos = portfolioMetrics.sinceStartChangePercent >= 0;

  return (
    <ScreenContainer
      title="Portfolio"
      showEditButton={isPaperTradingEnabled}
      isEditMode={isEditMode}
      onEditPress={handleToggleEditMode}
    >
      <View style={layoutStyles.flex1}>
        {!isPaperTradingEnabled ? (
          <View style={styles.emptyContainer}>
            <AppText bold style={styles.emptyTitle}>
              Simulated Paper Trading
            </AppText>

            <AppText style={[styles.emptyDescription, { color: theme.textSecondary }]}>
              Simulated Paper Trading is currently turned off. Activate it in settings to trade with a simulated portfolio.
            </AppText>
          </View>
        ) : (
          <View style={layoutStyles.flex1}>
            {/* Portfolio Horizontal Tab Selector */}
            <TabSelector
              tabs={portfolios}
              activeTabId={activePortfolioId}
              onSelectTab={setActivePortfolioId}
              onAddTab={handleOpenAddPortfolio}
              isEditMode={isEditMode}
              onReorderTabs={handleReorderPortfolios}
              onDeleteTab={handleDeletePortfolio}
              onRenameTab={handleOpenRenamePortfolio}
              itemTypeLabel="Portfolio"
            />

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.contentScroll}
            >
              {/* 1. PORTFOLIO VALUE SECTION: Left (Total Value) & Right (Change Since Start) */}
              <View style={styles.portfolioValueRow}>
                {/* Left stats */}
                <View style={styles.portfolioValueLeft}>
                  <AppText
                    bold
                    style={[styles.sectionHeaderLabel, { color: theme.textSecondary }]}
                  >
                    PORTFOLIO VALUE
                  </AppText>

                  <AppText bold style={styles.totalValueText} adjustsFontSizeToFit={true} numberOfLines={1}>
                    {formatMoney(portfolioMetrics.totalValue)}
                  </AppText>
                </View>

                {/* Right stats (Change Since Start) */}
                <View style={styles.portfolioValueRight}>
                  <AppText
                    bold
                    style={[
                      styles.returnText,
                      { color: isStartPos ? '#00D084' : '#FF4D4F' },
                    ]}
                  >
                    {isStartPos ? '+' : '-'}{Math.abs(portfolioMetrics.sinceStartChangePercent).toFixed(2)}% since start
                  </AppText>
                </View>
              </View>

              {/* 2. FREE CASH SECTION */}
              <View style={styles.freeCashRow}>
                <AppText
                  bold
                  style={[styles.sectionHeaderLabel, { color: theme.textSecondary }]}
                >
                  FREE CASH
                </AppText>
                <AppText bold style={styles.freeCashValue}>
                  {formatMoney(activePortfolio?.cash || 0)}
                </AppText>
              </View>

              {/* 3. POSITIONS SECTION */}
              <View style={styles.positionsSection}>
                <AppText
                  bold
                  style={[styles.sectionHeaderLabel, { color: theme.textSecondary }]}
                >
                  POSITIONS
                </AppText>

                {positionsWithLiveMetrics.length === 0 ? (
                  <View style={[styles.noPositionsContainer]}>
                    <AppText style={[styles.noPositionsText, { color: theme.textSecondary }]}>
                      No open positions in this portfolio yet.
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.positionsList}>
                    {positionsWithLiveMetrics.map((pos) => {
                      const isPosGain = pos.changePercent >= 0;
                      return (
                        <TouchableOpacity
                          key={pos.id || pos.symbol}
                          style={[
                            styles.positionItemRow,
                            { borderBottomColor: theme.borderSubtle },
                          ]}
                          onPress={() => handleOpenStockDetail(pos)}
                          activeOpacity={0.7}
                        >
                          {/* Left: Logo & Symbol */}
                          <View style={styles.positionLeftCol}>
                            <CompanyLogo symbol={pos.symbol} size={32} />
                            <AppText bold style={styles.positionSymbolText}>
                              {pos.symbol}
                            </AppText>
                          </View>

                          {/* Middle: Shares count */}
                          <AppText bold style={styles.positionSharesText}>
                            {pos.shares} shares
                          </AppText>

                          {/* Right: Value & Return */}
                          <View style={styles.positionRightCol}>
                            <AppText bold style={styles.positionTotalValueText}>
                              {formatMoney(pos.totalValue)}
                            </AppText>
                            <AppText
                              bold
                              style={[
                                styles.positionChangeText,
                                { color: isPosGain ? '#00D084' : '#FF4D4F' },
                              ]}
                            >
                              {isPosGain ? '+' : '-'}{Math.abs(pos.changePercent || 0).toFixed(2)}%
                            </AppText>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Create Portfolio Modal with Name & Starting Cash ($100 - $1,000,000) */}
        <CreatePortfolioModal
          visible={createModalVisible}
          initialTitle={`Portfolio ${portfolios.length + 1}`}
          defaultCash={10000}
          onSubmit={handleCreatePortfolioSubmit}
          onCancel={() => setCreateModalVisible(false)}
        />

        {/* Rename Portfolio Dialogue Modal */}
        <TextInputModal
          visible={renameModalVisible}
          title="Rename Portfolio"
          placeholder="Enter portfolio name"
          initialValue={renameInitialValue}
          submitLabel="Save"
          onSubmit={handleRenamePortfolioSubmit}
          onCancel={() => setRenameModalVisible(false)}
        />

        {/* Stock Detail Slide-Up Modal */}
        <StockDetailModal
          visible={Boolean(selectedStock)}
          stock={modalStock}
          onClose={handleCloseStockDetail}
        />
      </View>
    </ScreenContainer>
  );
}

// Portfolio screen layout: empty state, value rows, positions list
const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
  emptyTitle: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  contentScroll: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  sectionHeaderLabel: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  portfolioValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  portfolioValueLeft: {
    flex: 1,
    gap: 2,
  },
  totalValueText: {
    fontSize: 30,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  portfolioValueRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  returnText: {
    fontSize: 13.5,
  },
  freeCashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  freeCashValue: {
    fontSize: 22,
    letterSpacing: 0.2,
  },
  positionsSection: {
    gap: spacing.sm + 2,
  },
  noPositionsContainer: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },
  noPositionsText: {
    fontSize: 14,
    marginBottom: 4,
  },
  positionsList: {
    gap: spacing.xs,
  },
  positionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md - 2,
  },
  positionLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '32%',
  },
  positionSymbolText: {
    fontSize: 16,
    letterSpacing: 0.2,
  },
  positionSharesText: {
    fontSize: 15,
    textAlign: 'left',
  },
  positionRightCol: {
    alignItems: 'flex-end',
    gap: 2,
    width: '33%',
  },
  positionTotalValueText: {
    fontSize: 16,
    letterSpacing: 0.2,
  },
  positionChangeText: {
    fontSize: 12,
  },
});

