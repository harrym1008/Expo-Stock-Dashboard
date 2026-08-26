import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';
import WatchlistTabSelector from '../components/home/WatchlistTabSelector';
import WatchlistItem from '../components/home/WatchlistItem';
import AppText from '../components/common/AppText';
import StockDetailModal from '../components/stock/StockDetailModal';
import { mockWatchlists } from '../constants/mockData';
import { useTheme } from '../context/ThemeContext';
import { useMarketData } from '../context/MarketDataContext';
import { spacing } from '../constants/theme';

export default function HomeScreen() {
  const { theme } = useTheme();
  const {
    quotes,
    profiles,
    fetchQuote,
    fetchProfile,
    fetchHistoricalChart,
    setWatchlistSymbols,
    setActiveModalSymbol,
    hasValidKey,
  } = useMarketData();

  const [watchlists, setWatchlists] = useState(mockWatchlists);
  const [activeWatchlistId, setActiveWatchlistId] = useState(
    mockWatchlists[0]?.id || 'watchlist-1'
  );
  const [selectedStock, setSelectedStock] = useState(null);
  const [sparklines1D, setSparklines1D] = useState({});

  // Track symbols already fetched in the current active watchlist
  const fetchedSparklinesRef = useRef(new Set());

  // 1. Gather all unique symbols across all watchlists to subscribe in WebSocket pool
  const allUniqueSymbols = useMemo(() => {
    const syms = new Set();
    for (const wl of watchlists) {
      if (Array.isArray(wl.items)) {
        for (const item of wl.items) {
          if (item.symbol) syms.add(item.symbol.toUpperCase());
        }
      }
    }
    return Array.from(syms);
  }, [watchlists]);

  // 2. Sync watchlist symbols to the 45-budget WebSocket manager
  useEffect(() => {
    setWatchlistSymbols(allUniqueSymbols);
  }, [allUniqueSymbols, setWatchlistSymbols]);

  // 3. Fetch real 1D sparklines & Finnhub profiles/quotes for active watchlist stocks
  const activeWatchlist =
    watchlists.find((wl) => wl.id === activeWatchlistId) || watchlists[0];

  useEffect(() => {
    fetchedSparklinesRef.current.clear();
  }, [activeWatchlistId]);

  useEffect(() => {
    if (!activeWatchlist?.items) return;

    for (const item of activeWatchlist.items) {
      const sym = item.symbol?.toUpperCase();
      if (!sym) continue;

      // Fetch 1D intraday sparkline only once per symbol per watchlist
      if (!fetchedSparklinesRef.current.has(sym)) {
        fetchedSparklinesRef.current.add(sym);
        fetchHistoricalChart(sym, '1D').then((chart) => {
          if (chart?.sparkline && chart.sparkline.length > 0) {
            setSparklines1D((prev) => ({
              ...prev,
              [sym]: {
                sparkline: chart.sparkline,
                price: chart.currentPrice,
                change: chart.priceChange,
                changePercent: chart.priceChangePercent,
              },
            }));
          }
        });
      }

      // Fetch Finnhub profile & quote if API key is active
      if (hasValidKey) {
        fetchQuote(sym);
        fetchProfile(sym);
      }
    }
  }, [activeWatchlistId, hasValidKey, fetchQuote, fetchProfile, fetchHistoricalChart, activeWatchlist?.items]);

  const handleOpenStockDetail = (item) => {
    setSelectedStock(item);
    setActiveModalSymbol(item.symbol);
  };

  const handleCloseStockDetail = () => {
    setSelectedStock(null);
    setActiveModalSymbol(null);
  };

  const handleAddWatchlist = () => {
    const newId = `watchlist-${watchlists.length + 1}`;
    const newWatchlist = {
      id: newId,
      title: `${watchlists.length + 1}th watchlist`,
      items: [
        {
          id: `stock-${Date.now()}`,
          symbol: 'AMZN',
          name: 'Amazon.com, Inc.',
          price: 182.40,
          changePercent: 0.94,
          change: 1.70,
          currency: '$',
          sparkline: [179, 180, 181.5, 180.8, 182, 181.2, 182.40],
        },
      ],
    };
    setWatchlists((prev) => [...prev, newWatchlist]);
    setActiveWatchlistId(newId);
  };

  // Merge dynamic quotes, 1D historical candles, and profiles into items
  const displayItems = useMemo(() => {
    return (activeWatchlist?.items || []).map((item) => {
      const sym = item.symbol?.toUpperCase();
      const liveQuote = quotes[sym];
      const liveProfile = profiles[sym];
      const y1D = sparklines1D[sym];

      return {
        ...item,
        price: liveQuote?.price ?? y1D?.price ?? item.price,
        change: liveQuote?.change ?? y1D?.change ?? item.change,
        changePercent: liveQuote?.changePercent ?? y1D?.changePercent ?? item.changePercent,
        name: liveProfile?.name || item.name,
        exchange: liveProfile?.exchange || item.exchange || 'NASDAQ',
        logo: liveProfile?.logo || item.logo || null,
        sparkline: y1D?.sparkline || liveQuote?.sparkline || item.sparkline,
      };
    });
  }, [activeWatchlist, quotes, profiles, sparklines1D]);

  return (
    <ScreenContainer title="Home" showSettingsButton={true}>
      <View style={styles.container}>
        {/* Watchlist Horizontal Drag Selector with Gradient Fades */}
        <WatchlistTabSelector
          watchlists={watchlists}
          activeWatchlistId={activeWatchlistId}
          onSelectWatchlist={setActiveWatchlistId}
          onAddWatchlist={handleAddWatchlist}
        />

        {/* Stock Items List */}
        <FlatList
          data={displayItems}
          keyExtractor={(item) => item.id || item.symbol}
          renderItem={({ item }) => (
            <WatchlistItem
              item={item}
              onPress={() => handleOpenStockDetail(item)}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <AppText style={[styles.emptyText, { color: theme.textSecondary }]}>
                No stocks in this watchlist yet.
              </AppText>
            </View>
          }
        />

        {/* Fullscreen Stock Detail Slide-Up Modal */}
        <StockDetailModal
          visible={!!selectedStock}
          stock={
            selectedStock
              ? {
                  ...selectedStock,
                  price: quotes[selectedStock.symbol]?.price ?? sparklines1D[selectedStock.symbol]?.price ?? selectedStock.price,
                  change: quotes[selectedStock.symbol]?.change ?? sparklines1D[selectedStock.symbol]?.change ?? selectedStock.change,
                  changePercent: quotes[selectedStock.symbol]?.changePercent ?? sparklines1D[selectedStock.symbol]?.changePercent ?? selectedStock.changePercent,
                  name: profiles[selectedStock.symbol]?.name || selectedStock.name,
                  exchange: profiles[selectedStock.symbol]?.exchange || selectedStock.exchange || 'NASDAQ',
                  logo: profiles[selectedStock.symbol]?.logo || selectedStock.logo || null,
                  sparkline: sparklines1D[selectedStock.symbol]?.sparkline || quotes[selectedStock.symbol]?.sparkline || selectedStock.sparkline,
                }
              : null
          }
          onClose={handleCloseStockDetail}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
});
