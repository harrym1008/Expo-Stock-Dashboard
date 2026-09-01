import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { storageService } from '../services/storageService';
import { useMarketData } from './MarketDataContext';

const WatchlistContext = createContext(null);

const DEFAULT_WATCHLISTS = [
  {
    id: 'watchlist-1',
    title: 'My Watchlist',
    items: [],
  },
];

export function WatchlistProvider({ children }) {
  const [watchlists, setWatchlists] = useState(DEFAULT_WATCHLISTS);
  const [activeWatchlistId, setActiveWatchlistId] = useState('watchlist-1');
  const hasLoadedFromStorage = useRef(false);
  const { setWatchlistSymbols } = useMarketData();

  // 1. Persistence: Load watchlists from AsyncStorage on mount
  useEffect(() => {
    storageService.getStoredWatchlists().then((stored) => {
      if (stored && Array.isArray(stored) && stored.length > 0) {
        setWatchlists(stored);
        setActiveWatchlistId((prev) => {
          const exists = stored.some((w) => w.id === prev);
          return exists ? prev : stored[0]?.id || 'watchlist-1';
        });
      }
      hasLoadedFromStorage.current = true;
    });
  }, []);

  // 2. Persistence: Save watchlists to AsyncStorage on every change
  useEffect(() => {
    if (hasLoadedFromStorage.current) {
      storageService.setStoredWatchlists(watchlists);
    }
  }, [watchlists]);

  // 3. Sync all unique symbols across all watchlists to WebSocket manager
  const allUniqueSymbols = useMemo(() => {
    const syms = new Set();
    for (const wl of watchlists) {
      if (Array.isArray(wl.items)) {
        for (const item of wl.items) {
          if (item?.symbol) syms.add(item.symbol.toUpperCase());
        }
      }
    }
    return Array.from(syms);
  }, [watchlists]);

  useEffect(() => {
    if (setWatchlistSymbols) {
      setWatchlistSymbols(allUniqueSymbols);
    }
  }, [allUniqueSymbols, setWatchlistSymbols]);

  // 4. Helper queries
  const isStockInWatchlist = useCallback(
    (watchlistId, symbol) => {
      if (!symbol) return false;
      const cleanSym = symbol.toUpperCase();
      const targetWl = watchlists.find((wl) => wl.id === watchlistId);
      if (!targetWl || !Array.isArray(targetWl.items)) return false;
      return targetWl.items.some((item) => item?.symbol?.toUpperCase() === cleanSym);
    },
    [watchlists]
  );

  const isStockInAnyWatchlist = useCallback(
    (symbol) => {
      if (!symbol) return false;
      const cleanSym = symbol.toUpperCase();
      for (const wl of watchlists) {
        if (Array.isArray(wl.items)) {
          if (wl.items.some((item) => item?.symbol?.toUpperCase() === cleanSym)) {
            return true;
          }
        }
      }
      return false;
    },
    [watchlists]
  );

  // 5. Stock mutations
  const addStockToWatchlist = useCallback((watchlistId, stockData) => {
    if (!stockData?.symbol) return;
    const cleanSym = stockData.symbol.toUpperCase();

    setWatchlists((prev) =>
      prev.map((wl) => {
        if (wl.id !== watchlistId) return wl;
        const items = Array.isArray(wl.items) ? wl.items : [];
        if (items.some((item) => item?.symbol?.toUpperCase() === cleanSym)) {
          return wl;
        }

        const newItem = {
          id: `stock-${cleanSym}-${Date.now()}`,
          symbol: cleanSym,
          name: stockData.name || cleanSym,
          price: stockData.price || stockData.regularMarketPrice || 0,
          change: stockData.change || 0,
          changePercent: stockData.changePercent || 0,
          currency: stockData.currency || '$',
          sparkline: stockData.sparkline || [],
          logo: stockData.logo || null,
          exchange: stockData.exchange || '...',
        };

        return {
          ...wl,
          items: [...items, newItem],
        };
      })
    );
  }, []);

  const removeStockFromWatchlist = useCallback((watchlistId, symbolOrId) => {
    if (!symbolOrId) return;
    const cleanSym = typeof symbolOrId === 'string' ? symbolOrId.toUpperCase() : '';

    setWatchlists((prev) =>
      prev.map((wl) => {
        if (wl.id !== watchlistId) return wl;
        const items = Array.isArray(wl.items) ? wl.items : [];
        return {
          ...wl,
          items: items.filter(
            (item) =>
              item.id !== symbolOrId &&
              item?.symbol?.toUpperCase() !== cleanSym
          ),
        };
      })
    );
  }, []);

  const toggleStockInWatchlist = useCallback(
    (watchlistId, stockData) => {
      if (!stockData?.symbol) return;
      const cleanSym = stockData.symbol.toUpperCase();
      const inWl = isStockInWatchlist(watchlistId, cleanSym);
      if (inWl) {
        removeStockFromWatchlist(watchlistId, cleanSym);
      } else {
        addStockToWatchlist(watchlistId, stockData);
      }
    },
    [isStockInWatchlist, addStockToWatchlist, removeStockFromWatchlist]
  );

  const deleteStock = useCallback((watchlistId, stockId) => {
    setWatchlists((prev) =>
      prev.map((wl) =>
        wl.id === watchlistId
          ? {
              ...wl,
              items: (wl.items || []).filter((item) => item.id !== stockId),
            }
          : wl
      )
    );
  }, []);

  const reorderStocks = useCallback((watchlistId, reorderedItems) => {
    setWatchlists((prev) =>
      prev.map((wl) =>
        wl.id === watchlistId
          ? { ...wl, items: reorderedItems }
          : wl
      )
    );
  }, []);

  // 6. Watchlist mutations
  const createWatchlist = useCallback((title) => {
    const trimmed = (title || '').trim();
    if (!trimmed) return null;
    const newId = `watchlist-${Date.now()}`;
    const newWatchlist = {
      id: newId,
      title: trimmed,
      items: [],
    };
    setWatchlists((prev) => [...prev, newWatchlist]);
    setActiveWatchlistId(newId);
    return newId;
  }, []);

  const renameWatchlist = useCallback((id, newTitle) => {
    const trimmed = (newTitle || '').trim();
    if (!trimmed) return;
    setWatchlists((prev) =>
      prev.map((wl) => (wl.id === id ? { ...wl, title: trimmed } : wl))
    );
  }, []);

  const deleteWatchlist = useCallback(
    (id) => {
      setWatchlists((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((wl) => wl.id !== id);
        if (id === activeWatchlistId && filtered.length > 0) {
          setActiveWatchlistId(filtered[0].id);
        }
        return filtered;
      });
    },
    [activeWatchlistId]
  );

  const reorderWatchlists = useCallback((reordered) => {
    if (Array.isArray(reordered)) {
      setWatchlists(reordered);
    }
  }, []);

  const activeWatchlist = useMemo(() => {
    return (
      watchlists.find((wl) => wl.id === activeWatchlistId) ||
      watchlists[0] ||
      null
    );
  }, [watchlists, activeWatchlistId]);

  const value = useMemo(
    () => ({
      watchlists,
      activeWatchlistId,
      setActiveWatchlistId,
      activeWatchlist,
      isStockInWatchlist,
      isStockInAnyWatchlist,
      addStockToWatchlist,
      removeStockFromWatchlist,
      toggleStockInWatchlist,
      deleteStock,
      reorderStocks,
      createWatchlist,
      renameWatchlist,
      deleteWatchlist,
      reorderWatchlists,
    }),
    [
      watchlists,
      activeWatchlistId,
      setActiveWatchlistId,
      activeWatchlist,
      isStockInWatchlist,
      isStockInAnyWatchlist,
      addStockToWatchlist,
      removeStockFromWatchlist,
      toggleStockInWatchlist,
      deleteStock,
      reorderStocks,
      createWatchlist,
      renameWatchlist,
      deleteWatchlist,
      reorderWatchlists,
    ]
  );

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
}
