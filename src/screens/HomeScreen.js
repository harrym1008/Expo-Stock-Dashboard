import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList from 'react-native-draggable-flatlist';
import ScreenContainer from '../components/common/ScreenContainer';
import TabSelector from '../components/common/TabSelector';
import WatchlistItem from '../components/home/WatchlistItem';
import SwipeableStockItem from '../components/home/SwipeableStockItem';
import AppText from '../components/common/AppText';
import TextInputModal from '../components/common/TextInputModal';
import StockDetailModal from '../components/stock/StockDetailModal';
import SearchStockModal from '../components/stock/SearchStockModal';
import { useTheme } from '../context/ThemeContext';
import { useMarketData } from '../context/MarketDataContext';
import { useWatchlist } from '../context/WatchlistContext';
import { spacing, borderRadius } from '../constants/theme';
import { layoutStyles, emptyStateStyles } from '../styles';
import { formatStockQuote } from '../utils/formatters';

export default function HomeScreen() {
  const { theme, isDark } = useTheme();
  const {
    quotes,
    profiles,
    marketStatus,
    fetchQuote,
    fetchProfile,
    fetchHistoricalChart,
    setActiveModalSymbol,
    hasValidKey,
  } = useMarketData();

  const {
    watchlists,
    activeWatchlistId,
    setActiveWatchlistId,
    activeWatchlist,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    reorderWatchlists,
    addStockToWatchlist,
    deleteStock,
    reorderStocks,
  } = useWatchlist();

  const [selectedStock, setSelectedStock] = useState(null);
  const [sparklines1D, setSparklines1D] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchStockModalVisible, setSearchStockModalVisible] = useState(false);

  // Text input modal state
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [inputModalTitle, setInputModalTitle] = useState('');
  const [inputModalInitialValue, setInputModalInitialValue] = useState('');
  const [inputModalAction, setInputModalAction] = useState(null); // 'add' | 'rename'
  const [renameTargetId, setRenameTargetId] = useState(null);

  // Track symbols already fetched in the current active watchlist
  const fetchedSparklinesRef = useRef(new Set());

  // Fetch real 1D sparklines & Finnhub profiles/quotes for active watchlist stocks
  useEffect(() => {
    fetchedSparklinesRef.current.clear();
  }, [activeWatchlistId, marketStatus.session]);

  useEffect(() => {
    if (!activeWatchlist?.items) return;

    for (const item of activeWatchlist.items) {
      const sym = item.symbol?.toUpperCase();
      if (!sym) continue;

      // Fetch 1D intraday sparkline only once per symbol per watchlist/session
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
  }, [activeWatchlistId, marketStatus.session, hasValidKey, fetchQuote, fetchProfile, fetchHistoricalChart, activeWatchlist?.items]);

  // --- Stock detail modal ---
  const handleOpenStockDetail = useCallback((item) => {
    setSelectedStock(item);
    setActiveModalSymbol(item?.symbol);
  }, [setActiveModalSymbol]);

  const handleCloseStockDetail = useCallback(() => {
    setSelectedStock(null);
    setActiveModalSymbol(null);
  }, [setActiveModalSymbol]);

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

  const handleRenameWatchlist = useCallback(
    (id) => {
      const wl = watchlists.find((w) => w.id === id);
      if (!wl) return;
      setInputModalTitle('Rename Watchlist');
      setInputModalInitialValue(wl.title);
      setInputModalAction('rename');
      setRenameTargetId(id);
      setInputModalVisible(true);
    },
    [watchlists]
  );

  const handleInputModalSubmit = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (inputModalAction === 'add') {
        createWatchlist(trimmed);
      } else if (inputModalAction === 'rename' && renameTargetId) {
        renameWatchlist(renameTargetId, trimmed);
      }

      setInputModalVisible(false);
    },
    [inputModalAction, renameTargetId, createWatchlist, renameWatchlist]
  );

  const handleInputModalCancel = useCallback(() => {
    setInputModalVisible(false);
  }, []);

  const handleDeleteWatchlist = useCallback(
    (id) => {
      deleteWatchlist(id);
    },
    [deleteWatchlist]
  );

  const handleReorderWatchlists = useCallback(
    (reordered) => {
      reorderWatchlists(reordered);
    },
    [reorderWatchlists]
  );

  // --- Stock CRUD ---
  const handleDeleteStock = useCallback(
    (stockId) => {
      deleteStock(activeWatchlistId, stockId);
    },
    [activeWatchlistId, deleteStock]
  );

  const handleReorderStocks = useCallback(
    (reorderedItems) => {
      reorderStocks(activeWatchlistId, reorderedItems);
    },
    [activeWatchlistId, reorderStocks]
  );

  const handleSelectStockToAdd = useCallback(
    (stockItem) => {
      if (activeWatchlistId && stockItem) {
        addStockToWatchlist(activeWatchlistId, stockItem);
        const sym = stockItem.symbol?.toUpperCase();
        if (sym) {
          if (hasValidKey) {
            fetchQuote(sym);
            fetchProfile(sym);
          }
          fetchHistoricalChart(sym, '1D');
        }
      }
      setSearchStockModalVisible(false);
    },
    [
      activeWatchlistId,
      addStockToWatchlist,
      hasValidKey,
      fetchQuote,
      fetchProfile,
      fetchHistoricalChart,
    ]
  );

  // Freeze background list items while the StockDetailModal is open to prevent
  // WebSocket price ticks from triggering 300ms background DraggableFlatList reconciliations
  const displayItemsRef = useRef([]);
  const displayItems = useMemo(() => {
    if (selectedStock && displayItemsRef.current.length > 0) {
      return displayItemsRef.current;
    }
    const items = (activeWatchlist?.items || []).map((item) => {
      const sym = item.symbol?.toUpperCase();
      return formatStockQuote(
        item,
        quotes[sym],
        profiles[sym],
        sparklines1D[sym],
        marketStatus
      );
    });
    displayItemsRef.current = items;
    return items;
  }, [
    activeWatchlist,
    selectedStock ? null : quotes,
    profiles,
    sparklines1D,
    marketStatus,
    selectedStock,
  ]);

  // Memoize formatted selected stock specifically on its own quote/profile/sparkline
  const selectedSymbol = selectedStock?.symbol?.toUpperCase();
  const selectedQuote = selectedSymbol ? (quotes[selectedSymbol] || quotes[selectedStock?.symbol]) : null;
  const selectedProfile = selectedSymbol ? profiles[selectedSymbol] : null;
  const selectedSparkline = selectedSymbol ? sparklines1D[selectedSymbol] : null;

  const formattedSelectedStock = useMemo(() => {
    if (!selectedStock) return null;
    return formatStockQuote(
      selectedStock,
      selectedQuote,
      selectedProfile,
      selectedSparkline,
      marketStatus
    );
  }, [selectedStock, selectedQuote, selectedProfile, selectedSparkline, marketStatus]);

  const renderStockItem = useCallback(
    ({ item, drag, isActive }) => {
      return (
        <SwipeableStockItem
          itemId={item.id}
          onDelete={handleDeleteStock}
        >
          <WatchlistItem
            item={item}
            onPress={handleOpenStockDetail}
            isEditMode={isEditMode}
            drag={drag}
          />
        </SwipeableStockItem>
      );
    },
    [isEditMode, handleDeleteStock, handleOpenStockDetail]
  );

  return (
    <ScreenContainer
      title="Home"
      showSettingsButton={true}
      showEditButton={true}
      isEditMode={isEditMode}
      onEditPress={handleToggleEditMode}
    >
      <View style={layoutStyles.flex1}>
        {/* Watchlist Horizontal Drag Selector with Gradient Fades */}
        <TabSelector
          tabs={watchlists}
          activeTabId={activeWatchlistId}
          onSelectTab={setActiveWatchlistId}
          onAddTab={handleAddWatchlist}
          isEditMode={isEditMode}
          onReorderTabs={handleReorderWatchlists}
          onDeleteTab={handleDeleteWatchlist}
          onRenameTab={handleRenameWatchlist}
          itemTypeLabel="Watchlist"
        />

        {/* Stock Items List (Draggable in edit mode) */}
        <DraggableFlatList
          data={displayItems}
          keyExtractor={(item) => item.id || item.symbol}
          renderItem={renderStockItem}
          onDragEnd={({ data }) => handleReorderStocks(data)}
          activationDistance={isEditMode ? 0 : 999}
          showsVerticalScrollIndicator={false}
          containerStyle={layoutStyles.flex1}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            !isEditMode ? (
              <View style={styles.listFooter}>
                <TouchableOpacity
                  style={[
                    styles.addStockIconButton,
                    {
                      backgroundColor: isDark ? '#1C1F26' : '#E4E7EC',
                    },
                  ]}
                  onPress={() => setSearchStockModalVisible(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add stock to active watchlist"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="add" size={18} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={emptyStateStyles.container}>
              <AppText style={[emptyStateStyles.text, { color: theme.textSecondary }]}>
                No stocks in this watchlist yet.
              </AppText>
            </View>
          }
        />

        {/* Search Stock to Add Modal */}
        <SearchStockModal
          visible={searchStockModalVisible}
          watchlistTitle={activeWatchlist?.title || ''}
          onSelectStock={handleSelectStockToAdd}
          onClose={() => setSearchStockModalVisible(false)}
        />

        {/* Fullscreen Stock Detail Slide-Up Modal */}
        <StockDetailModal
          visible={!!selectedStock}
          stock={formattedSelectedStock}
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
  listContent: {
    flexGrow: 1,
    paddingTop: spacing.xs,
    paddingBottom: 16,
  },
  listFooter: {
    alignItems: 'flex-end',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingRight: spacing.xs,
  },
  addStockIconButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
