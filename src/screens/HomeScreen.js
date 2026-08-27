import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import ScreenContainer from '../components/common/ScreenContainer';
import WatchlistTabSelector from '../components/home/WatchlistTabSelector';
import WatchlistItem from '../components/home/WatchlistItem';
import SwipeableStockItem from '../components/home/SwipeableStockItem';
import AppText from '../components/common/AppText';
import TextInputModal from '../components/common/TextInputModal';
import StockDetailModal from '../components/stock/StockDetailModal';
import { mockWatchlists } from '../constants/mockData';
import { storageService } from '../services/storageService';
import { useTheme } from '../context/ThemeContext';
import { useMarketData } from '../context/MarketDataContext';
import { spacing } from '../constants/theme';

export default function HomeScreen() {
  const { theme } = useTheme();
  const {
    quotes,
    profiles,
    marketStatus,
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
  const [isEditMode, setIsEditMode] = useState(false);

  // Text input modal state
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [inputModalTitle, setInputModalTitle] = useState('');
  const [inputModalInitialValue, setInputModalInitialValue] = useState('');
  const [inputModalAction, setInputModalAction] = useState(null); // 'add' | 'rename'
  const [renameTargetId, setRenameTargetId] = useState(null);

  // Track whether initial load from storage is complete
  const hasLoadedFromStorage = useRef(false);

  // Track symbols already fetched in the current active watchlist
  const fetchedSparklinesRef = useRef(new Set());

  // --- Persistence: Load watchlists from AsyncStorage on mount ---
  useEffect(() => {
    storageService.getStoredWatchlists().then((stored) => {
      if (stored && Array.isArray(stored) && stored.length > 0) {
        setWatchlists(stored);
        setActiveWatchlistId(stored[0]?.id || 'watchlist-1');
      }
      hasLoadedFromStorage.current = true;
    });
  }, []);

  // --- Persistence: Save watchlists to AsyncStorage on every change ---
  useEffect(() => {
    if (hasLoadedFromStorage.current) {
      storageService.setStoredWatchlists(watchlists);
    }
  }, [watchlists]);

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
                regularMarketPrice: chart.regularMarketPrice,
                previousClose: chart.previousClose,
                change: chart.priceChange,
                changePercent: chart.priceChangePercent,
                postMarketPrice: chart.postMarketPrice,
                postMarketChange: chart.postMarketChange,
                postMarketChangePercent: chart.postMarketChangePercent,
                preMarketPrice: chart.preMarketPrice,
                preMarketChange: chart.preMarketChange,
                preMarketChangePercent: chart.preMarketChangePercent,
                lastUpdated: chart.lastUpdated,
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

  // --- Stock detail modal ---
  const handleOpenStockDetail = (item) => {
    setSelectedStock(item);
    setActiveModalSymbol(item.symbol);
  };

  const handleCloseStockDetail = () => {
    setSelectedStock(null);
    setActiveModalSymbol(null);
  };

  // --- Edit Mode ---
  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  // --- Watchlist CRUD ---
  const handleAddWatchlist = useCallback(() => {
    setInputModalTitle('New Watchlist');
    setInputModalInitialValue('');
    setInputModalAction('add');
    setRenameTargetId(null);
    setInputModalVisible(true);
  }, []);

  const handleRenameWatchlist = useCallback((id) => {
    const wl = watchlists.find((w) => w.id === id);
    if (!wl) return;
    setInputModalTitle('Rename Watchlist');
    setInputModalInitialValue(wl.title);
    setInputModalAction('rename');
    setRenameTargetId(id);
    setInputModalVisible(true);
  }, [watchlists]);

  const handleInputModalSubmit = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (inputModalAction === 'add') {
      const newId = `watchlist-${Date.now()}`;
      const newWatchlist = {
        id: newId,
        title: trimmed,
        items: [],
      };
      setWatchlists((prev) => [...prev, newWatchlist]);
      setActiveWatchlistId(newId);
    } else if (inputModalAction === 'rename' && renameTargetId) {
      setWatchlists((prev) =>
        prev.map((wl) =>
          wl.id === renameTargetId ? { ...wl, title: trimmed } : wl
        )
      );
    }

    setInputModalVisible(false);
  }, [inputModalAction, renameTargetId]);

  const handleInputModalCancel = useCallback(() => {
    setInputModalVisible(false);
  }, []);

  const handleDeleteWatchlist = useCallback((id) => {
    setWatchlists((prev) => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((wl) => wl.id !== id);
      // If deleting the active watchlist, select the nearest one
      if (id === activeWatchlistId && filtered.length > 0) {
        setActiveWatchlistId(filtered[0].id);
      }
      return filtered;
    });
  }, [activeWatchlistId]);

  const handleReorderWatchlists = useCallback((reordered) => {
    setWatchlists(reordered);
  }, []);

  // --- Stock CRUD ---
  const handleDeleteStock = useCallback((stockId) => {
    setWatchlists((prev) =>
      prev.map((wl) =>
        wl.id === activeWatchlistId
          ? { ...wl, items: wl.items.filter((item) => item.id !== stockId) }
          : wl
      )
    );
  }, [activeWatchlistId]);

  const handleReorderStocks = useCallback((reorderedItems) => {
    setWatchlists((prev) =>
      prev.map((wl) =>
        wl.id === activeWatchlistId
          ? { ...wl, items: reorderedItems }
          : wl
      )
    );
  }, [activeWatchlistId]);

  // Merge dynamic quotes, 1D historical candles, and profiles into items
  const displayItems = useMemo(() => {
    return (activeWatchlist?.items || []).map((item) => {
      const sym = item.symbol?.toUpperCase();
      const liveQuote = quotes[sym];
      const liveProfile = profiles[sym];
      const y1D = sparklines1D[sym];

      const regularClose = y1D?.regularMarketPrice || item.price;
      const prevDayClose = y1D?.previousClose || item.price;

      let displayPrice;
      let displayChange;
      let displayChangePercent;

      if (marketStatus.isOpen) {
        // Market is OPEN: Live price compared against previous day's close
        displayPrice = liveQuote?.price ?? y1D?.price ?? item.price;
        const refClose = prevDayClose || displayPrice;
        displayChange = displayPrice - refClose;
        displayChangePercent = refClose !== 0 ? (displayChange / refClose) * 100 : 0;
      } else {
        // Market is OUT OF HOURS:
        const hasLiveWsTrade = liveQuote?.isLiveWs && typeof liveQuote?.price === 'number' && Math.abs(liveQuote.price - regularClose) > 0.001;
        const postPrice = (marketStatus.isPreMarket ? y1D?.preMarketPrice : y1D?.postMarketPrice) || y1D?.postMarketPrice || y1D?.preMarketPrice;
        const hasPostMarketDelta = typeof postPrice === 'number' && Math.abs(postPrice - regularClose) > 0.001;

        if (hasLiveWsTrade) {
          displayPrice = liveQuote.price;
          displayChange = liveQuote.price - regularClose;
          displayChangePercent = regularClose !== 0 ? (displayChange / regularClose) * 100 : 0;
        } else if (hasPostMarketDelta) {
          displayPrice = postPrice;
          displayChange = postPrice - regularClose;
          displayChangePercent = regularClose !== 0 ? (displayChange / regularClose) * 100 : 0;
        } else {
          // If no extended delta occurred, show the official regular market session close figures
          displayPrice = regularClose;
          displayChange = y1D?.change ?? item.change ?? 0;
          displayChangePercent = y1D?.changePercent ?? item.changePercent ?? 0;
        }
      }

      // Dynamically update the sparkline's endmost value with the current active trade price
      const baseSparkline = y1D?.sparkline || liveQuote?.sparkline || item.sparkline || [];
      const dynamicSparkline =
        typeof displayPrice === 'number' && baseSparkline.length > 0
          ? [...baseSparkline.slice(0, -1), displayPrice]
          : baseSparkline;

      return {
        ...item,
        price: displayPrice,
        postMarketPrice: y1D?.postMarketPrice || displayPrice,
        regularMarketPrice: regularClose,
        change: displayChange,
        changePercent: displayChangePercent,
        name: liveProfile?.name || item.name,
        exchange: liveProfile?.exchange || item.exchange || '...',
        logo: liveProfile?.logo || item.logo || null,
        sparkline: dynamicSparkline,
        lastUpdated:
          liveQuote?.lastTickTime ||
          liveQuote?.timestamp ||
          y1D?.lastUpdated ||
          item.lastUpdated,
      };
    });
  }, [activeWatchlist, quotes, profiles, sparklines1D, marketStatus]);

  const renderStockItem = useCallback(({ item, drag, isActive }) => {
    const stockContent = (
      <WatchlistItem
        item={item}
        onPress={() => handleOpenStockDetail(item)}
        isEditMode={isEditMode}
        drag={drag}
      />
    );

    return (
      <SwipeableStockItem
        itemId={item.id}
        onDelete={() => handleDeleteStock(item.id)}
      >
        {stockContent}
      </SwipeableStockItem>
    );
  }, [isEditMode, handleDeleteStock]);

  return (
    <ScreenContainer
      title="Home"
      showSettingsButton={true}
      showEditButton={true}
      isEditMode={isEditMode}
      onEditPress={handleToggleEditMode}
    >
      <View style={styles.container}>
        {/* Watchlist Horizontal Drag Selector with Gradient Fades */}
        <WatchlistTabSelector
          watchlists={watchlists}
          activeWatchlistId={activeWatchlistId}
          onSelectWatchlist={setActiveWatchlistId}
          onAddWatchlist={handleAddWatchlist}
          isEditMode={isEditMode}
          onReorderWatchlists={handleReorderWatchlists}
          onDeleteWatchlist={handleDeleteWatchlist}
          onRenameWatchlist={handleRenameWatchlist}
        />

        {/* Stock Items List (Draggable in edit mode) */}
        <DraggableFlatList
          data={displayItems}
          keyExtractor={(item) => item.id || item.symbol}
          renderItem={renderStockItem}
          onDragEnd={({ data }) => handleReorderStocks(data)}
          activationDistance={isEditMode ? 0 : 999}
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
                  price: (quotes[selectedStock.symbol]?.isLiveWs ? quotes[selectedStock.symbol]?.price : null) ?? sparklines1D[selectedStock.symbol]?.postMarketPrice ?? selectedStock.price,
                  postMarketPrice: sparklines1D[selectedStock.symbol]?.postMarketPrice || selectedStock.postMarketPrice,
                  regularMarketPrice: sparklines1D[selectedStock.symbol]?.regularMarketPrice || selectedStock.regularMarketPrice,
                  change: quotes[selectedStock.symbol]?.change ?? sparklines1D[selectedStock.symbol]?.change ?? selectedStock.change,
                  changePercent: quotes[selectedStock.symbol]?.changePercent ?? sparklines1D[selectedStock.symbol]?.changePercent ?? selectedStock.changePercent,
                  name: profiles[selectedStock.symbol]?.name || selectedStock.name,
                  exchange: profiles[selectedStock.symbol]?.exchange || selectedStock.exchange || '...',
                  logo: profiles[selectedStock.symbol]?.logo || selectedStock.logo || null,
                  sparkline: sparklines1D[selectedStock.symbol]?.sparkline || quotes[selectedStock.symbol]?.sparkline || selectedStock.sparkline,
                  lastUpdated: quotes[selectedStock.symbol]?.lastTickTime || quotes[selectedStock.symbol]?.timestamp || sparklines1D[selectedStock.symbol]?.lastUpdated || selectedStock.lastUpdated,
                }
              : null
          }
          onClose={handleCloseStockDetail}
        />

        {/* Text Input Modal for Add / Rename */}
        <TextInputModal
          visible={inputModalVisible}
          title={inputModalTitle}
          placeholder="Enter watchlist name"
          initialValue={inputModalInitialValue}
          onSubmit={handleInputModalSubmit}
          onCancel={handleInputModalCancel}
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
