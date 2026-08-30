import React, { useState, useMemo, useCallback } from 'react';
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
import { useMarketData } from '../context/MarketDataContext';
import { spacing, borderRadius } from '../constants/theme';
import { layoutStyles } from '../styles';

const initialPortfolios = [
  {
    id: 'portfolio-1',
    title: 'Portfolio 1',
    cash: 32430.43,
    totalValue: 36642.61,
    todayChangePercent: 0.46,
    sinceStartChangePercent: 5.54,
    positions: [
      {
        id: 'pos-1',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        shares: '4.4832',
        avgCost: 108.56,
        totalValue: 4212.18,
        changePercent: 7.54,
      },
      {
        id: 'pos-2',
        symbol: 'SPCX',
        name: 'Space Exploration Technologies',
        shares: '4.4832',
        avgCost: 108.56,
        totalValue: 4212.18,
        changePercent: 7.54,
      },
    ],
  },
  {
    id: 'portfolio-2',
    title: 'Portfolio 2',
    cash: 10000.0,
    totalValue: 10000.0,
    todayChangePercent: 0.0,
    sinceStartChangePercent: 0.0,
    positions: [],
  },
];

export default function PortfolioScreen() {
  const { theme, isDark } = useTheme();
  const { isPaperTradingEnabled } = useTrading();
  const { quotes, profiles } = useMarketData();

  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [activePortfolioId, setActivePortfolioId] = useState('portfolio-1');
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);

  // Modals state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState(null);
  const [renameInitialValue, setRenameInitialValue] = useState('');

  const activePortfolio = useMemo(() => {
    return (
      portfolios.find((p) => p.id === activePortfolioId) ||
      portfolios[0] ||
      null
    );
  }, [portfolios, activePortfolioId]);

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  const handleOpenAddPortfolio = useCallback(() => {
    setCreateModalVisible(true);
  }, []);

  const handleCreatePortfolioSubmit = useCallback(
    ({ title, cash }) => {
      const newId = `portfolio-${Date.now()}`;
      const newPortfolio = {
        id: newId,
        title,
        cash: cash || 10000.0,
        totalValue: cash || 10000.0,
        todayChangePercent: 0.0,
        sinceStartChangePercent: 0.0,
        positions: [],
      };
      setPortfolios((prev) => [...prev, newPortfolio]);
      setActivePortfolioId(newId);
      setCreateModalVisible(false);
    },
    []
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

      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === renameTargetId ? { ...p, title: trimmed } : p
        )
      );
      setRenameModalVisible(false);
    },
    [renameTargetId]
  );

  const handleDeletePortfolio = useCallback(
    (id) => {
      if (portfolios.length <= 1) return;
      setPortfolios((prev) => {
        const filtered = prev.filter((p) => p.id !== id);
        if (id === activePortfolioId && filtered.length > 0) {
          setActivePortfolioId(filtered[0].id);
        }
        return filtered;
      });
    },
    [portfolios.length, activePortfolioId]
  );

  const handleReorderPortfolios = useCallback((reordered) => {
    if (Array.isArray(reordered)) {
      setPortfolios(reordered);
    }
  }, []);

  const formatMoney = (val) => {
    return `$${Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleOpenStockDetail = useCallback((position) => {
    setSelectedStock({
      symbol: position.symbol,
      name: position.name,
    });
  }, []);

  const modalStock = useMemo(() => {
    if (!selectedStock) return null;
    const sym = selectedStock.symbol;
    const liveQuote = quotes[sym];
    const liveProfile = profiles[sym];

    return {
      symbol: sym,
      name: liveProfile?.name || selectedStock.name,
      exchange: liveProfile?.exchange || '...',
      logo: liveProfile?.logo || null,
      price: (liveQuote?.isLiveWs ? liveQuote.price : null) ?? liveQuote?.price ?? null,
      change: liveQuote?.change ?? null,
      changePercent: liveQuote?.changePercent ?? null,
      previousClose: liveQuote?.previousClose ?? null,
      regularMarketPrice: liveQuote?.regularMarketPrice ?? null,
      lastUpdated: liveQuote?.lastTickTime || liveQuote?.timestamp,
    };
  }, [selectedStock, quotes, profiles]);

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
              {/* 1. PORTFOLIO VALUE SECTION: Left (Total Value) & Right (Change Today / Since Start) */}
              <View style={styles.portfolioValueRow}>
                {/* Left stats */}
                <View style={styles.portfolioValueLeft}>
                  <AppText
                    bold
                    style={[styles.sectionHeaderLabel, { color: theme.textSecondary }]}
                  >
                    PORTFOLIO VALUE
                  </AppText>

                  <AppText bold style={styles.totalValueText}>
                    {formatMoney(activePortfolio?.totalValue || 36642.61)}
                  </AppText>
                </View>

                {/* Right stats (Change Today / Since Start) */}
                <View style={styles.portfolioValueRight}>
                  <AppText bold style={styles.returnGreenText}>
                    ↗ {(activePortfolio?.todayChangePercent ?? 0.46).toFixed(2)}% today
                  </AppText>
                  <AppText bold style={styles.returnGreenText}>
                    ↗ {(activePortfolio?.sinceStartChangePercent ?? 5.54).toFixed(2)}% since start
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
                  {formatMoney(activePortfolio?.cash || 32430.43)}
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

                <View style={styles.positionsList}>
                  {(activePortfolio?.positions || []).map((pos) => (
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
                        <AppText bold style={styles.positionChangeText}>
                          ↗ {Number(pos.changePercent || 0).toFixed(2)}%
                        </AppText>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
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

        {/* Rename Portfolio Dialog Modal */}
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
          onClose={() => setSelectedStock(null)}
        />
      </View>
    </ScreenContainer>
  );
}

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
  returnGreenText: {
    color: '#00D084',
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
    color: '#00D084',
  },
});
