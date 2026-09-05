import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
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
import { getDisplaySymbol } from '../utils/securityUtils';


// Home screen (with watchlists sparklnes CRUD and detail modals)
export default function HomeScreen() {

  // Mass retrieve theme and market data from context
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

  // Mass retrieve watchlist data and CRUD functions from context
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
  const [settledQuotes, setSettledQuotes] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchStockModalVisible, setSearchStockModalVisible] = useState(false);

  // Text input modal state
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [inputModalTitle, setInputModalTitle] = useState('');
  const [inputModalInitialValue, setInputModalInitialValue] = useState('');
  const [inputModalAction, setInputModalAction] = useState(null); // 'add' | 'rename'
  const [renameTargetId, setRenameTargetId] = useState(null);

  // Tracks which symbols sparklines have been fetched (avoiding duplicate fetches)
  const fetchedSparklinesRef = useRef(new Set());
  const [sparklineRefreshTrigger, setSparklineRefreshTrigger] = useState(0);

  // Auto-refresh sparklines every 2 minutes
  useEffect(() => {
    const TWO_MINUTES_MS = 2 * 60 * 1000;
    const timer = setInterval(() => {
      fetchedSparklinesRef.current.clear();
      setSparklineRefreshTrigger((prev) => prev + 1);
    }, TWO_MINUTES_MS);

    return () => clearInterval(timer);
  }, []);

  // Delete cached sparklines when the watchlist or market session changes
  useEffect(() => {
    fetchedSparklinesRef.current.clear();
  }, [activeWatchlistId, marketStatus.session]);

  // Safety timeout: stop showing loading spinners after 8s even if network hangs
  useEffect(() => {
    if (!activeWatchlist?.items || activeWatchlist.items.length === 0) return;
    const timer = setTimeout(() => {
      setSettledQuotes((prev) => {
        const next = { ...prev };
        for (const item of activeWatchlist.items) {
          const sym = item.symbol?.toUpperCase();
          if (sym) next[sym] = true;
        }
        return next;
      });
    }, 8000);
    return () => clearTimeout(timer);
  }, [activeWatchlistId, activeWatchlist?.items]);

  // Fetch sparklines, quotes, and profiles for all stocks in the active watchlist
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

      // Fetch live quote via Yahoo Finance
      fetchQuote(sym)
        .catch(() => {})
        .finally(() => {
          setSettledQuotes((prev) => (prev[sym] ? prev : { ...prev, [sym]: true }));
        });

      // Fetch Finnhub profile if API key is active
      if (hasValidKey) {
        fetchProfile(sym);
      }
    }
  }, [activeWatchlistId, marketStatus.session, sparklineRefreshTrigger, hasValidKey, fetchQuote, fetchProfile, fetchHistoricalChart, activeWatchlist?.items]);

  // Stock detail modal
  const handleOpenStockDetail = useCallback((item) => {
    setSelectedStock(item);
    setActiveModalSymbol(item?.symbol);
  }, [setActiveModalSymbol]);
  const handleCloseStockDetail = useCallback(() => {
    setSelectedStock(null);
    setActiveModalSymbol(null);
  }, [setActiveModalSymbol]);

  // Edit Mode
  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);


  //  Watchlist CRUD (create, rename, update(reorder), delete)
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


  // Stocks CRUD (create, delete, update(reorder)) no rename 
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

  // Add a searched stock to the active watchlist, then fetch its data
  const handleSelectStockToAdd = useCallback(
    (stockItem) => {
      if (activeWatchlistId && stockItem) {
        addStockToWatchlist(activeWatchlistId, stockItem);
        const sym = (stockItem.displaySymbol || stockItem.symbol)?.toUpperCase();
        if (sym) {
          fetchQuote(sym)
            .catch(() => {})
            .finally(() => {
              setSettledQuotes((prev) => ({ ...prev, [sym]: true }));
            });
          if (hasValidKey) {
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

  // Freeze background list items while the StockDetailModal is open to prevent accidental drag/reorder
  const displayItemsRef = useRef([]);
  const watchedQuotes = selectedStock ? null : quotes;
  const displayItems = useMemo(() => {
    if (selectedStock && displayItemsRef.current.length > 0) {
      return displayItemsRef.current;
    }
    const currentQuotes = watchedQuotes || {};
    const items = (activeWatchlist?.items || []).map((item) => {
      const sym = item.symbol?.toUpperCase();
      const displaySym = (item.displaySymbol || item.symbol)?.toUpperCase();
      const cleanSym = getDisplaySymbol(item.symbol || item.displaySymbol || '').toUpperCase();

      const liveQuote =
        currentQuotes[sym] ||
        currentQuotes[item.symbol] ||
        (cleanSym ? currentQuotes[cleanSym] : null) ||
        (displaySym ? currentQuotes[displaySym] : null);

      const y1D =
        sparklines1D[sym] ||
        (cleanSym ? sparklines1D[cleanSym] : null) ||
        (displaySym ? sparklines1D[displaySym] : null);

      const hasUpdated = Boolean(liveQuote || y1D);
      const isSettled = Boolean(
        settledQuotes[sym] ||
        (cleanSym && settledQuotes[cleanSym]) ||
        (displaySym && settledQuotes[displaySym])
      );
      const isLoading = !hasUpdated && !isSettled;

      // Ensure out-of-date cached sparkline from storage is not displayed
      const rawItem = (!y1D?.sparkline && !liveQuote?.sparkline)
        ? { ...item, sparkline: [] }
        : item;

      const formatted = formatStockQuote(
        rawItem,
        liveQuote,
        profiles[sym] || (cleanSym ? profiles[cleanSym] : null) || (displaySym ? profiles[displaySym] : null),
        y1D,
        marketStatus
      );

      return {
        ...formatted,
        isLoading,
      };
    });
    displayItemsRef.current = items;
    return items;
  }, [
    activeWatchlist,
    watchedQuotes,
    profiles,
    sparklines1D,
    settledQuotes,
    marketStatus,
    selectedStock,
  ]);

  // Resolve quote, profile, sparkline for the selected stock
  const selectedSymbol = selectedStock?.symbol?.toUpperCase();
  const selectedQuote = selectedSymbol ? (quotes[selectedSymbol] || quotes[selectedStock?.symbol]) : null;
  const selectedProfile = selectedSymbol ? profiles[selectedSymbol] : null;
  const selectedSparkline = selectedSymbol ? sparklines1D[selectedSymbol] : null;

  // Format the selected stock for the detail modal
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

  // Render a swipeable item containing a WatchlistItem
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
      title={
        <Image
          source={require('../../assets/logos/TextLogo.png')}
          style={styles.headerLogo}
          resizeMode="contain"
          accessibilityRole="header"
          accessibilityLabel="EXPOStock Home"
        />
      }
      showSettingsButton={true}
      showEditButton={true}
      isEditMode={isEditMode}
      onEditPress={handleToggleEditMode}
    >
      <View style={layoutStyles.flex1}>
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

        {/* Anchored footer warning when Finnhub API key is not valid */}
        {!hasValidKey && (
          <View style={styles.apiKeyWarningContainer}>
            <AppText style={styles.apiKeyWarningText}>
              The Finnhub API key is invalid or empty. Some values may be missing or inaccurate. Live prices will not be available. Please check your API key in Settings.
            </AppText>
          </View>
        )}

        {/* Search Stock modal, shows when the plus button is pressed */}
        {searchStockModalVisible && (
          <SearchStockModal
            visible={searchStockModalVisible}
            watchlistTitle={activeWatchlist?.title || ''}
            onSelectStock={handleSelectStockToAdd}
            onClose={() => setSearchStockModalVisible(false)}
          />
        )}

        {/* Stock Detail modal */}
        {Boolean(selectedStock) && (
          <StockDetailModal
            visible={Boolean(selectedStock)}
            stock={formattedSelectedStock}
            onClose={handleCloseStockDetail}
          />
        )}

        {/* Text input when adding/renaming a watchlist */}
        {inputModalVisible && (
          <TextInputModal
            visible={inputModalVisible}
            title={inputModalTitle}
            placeholder="Enter watchlist name"
            initialValue={inputModalInitialValue}
            onSubmit={handleInputModalSubmit}
            onCancel={handleInputModalCancel}
          />
        )}
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
  apiKeyWarningContainer: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiKeyWarningText: {
    fontSize: 10.5,
    textAlign: 'center',
    color: '#a42729',
    opacity: 0.75,
  },
  headerLogo: {
    width: 116,
    height: 31,
  },
});
