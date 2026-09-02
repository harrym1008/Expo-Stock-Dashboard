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
import {
  getSecurityBySymbol,
  getDisplaySymbol,
  getDecimals,
} from '../utils/securityUtils';

// Context holding watchlists + active id
const WatchlistContext = createContext(null);

// Seed watchlist (used until storage loads)
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
  // Push watchlist symbols into the WS subscription manager
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
          const sym = item?.displaySymbol || item?.symbol;
          if (sym) syms.add(getDisplaySymbol(sym));
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
      const cleanSym = getDisplaySymbol(symbol).toUpperCase();
      const targetWl = watchlists.find((wl) => wl.id === watchlistId);
      if (!targetWl || !Array.isArray(targetWl.items)) return false;
      return targetWl.items.some(
        (item) => getDisplaySymbol(item?.displaySymbol || item?.symbol).toUpperCase() === cleanSym
      );
    },
    [watchlists]
  );

  const isStockInAnyWatchlist = useCallback(
    (symbol) => {
      if (!symbol) return false;
      const cleanSym = getDisplaySymbol(symbol).toUpperCase();
      for (const wl of watchlists) {
        if (Array.isArray(wl.items)) {
          if (
            wl.items.some(
              (item) => getDisplaySymbol(item?.displaySymbol || item?.symbol).toUpperCase() === cleanSym
            )
          ) {
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
    const cleanSym = getDisplaySymbol(stockData.displaySymbol || stockData.symbol);

    setWatchlists((prev) =>
      prev.map((wl) => {
        if (wl.id !== watchlistId) return wl;
        const items = Array.isArray(wl.items) ? wl.items : [];
        if (
          items.some(
            (item) => getDisplaySymbol(item?.displaySymbol || item?.symbol).toUpperCase() === cleanSym.toUpperCase()
          )
        ) {
          return wl;
        }

        // Resolve display fields from the global security registry
        const sec = getSecurityBySymbol(cleanSym);
        const displaySymbol = sec?.displaySymbol || stockData.displaySymbol || cleanSym;
        const displayName = sec?.displayName || stockData.displayName || stockData.name || cleanSym;
        const currency = sec?.currency !== undefined ? sec.currency : (stockData.currency !== undefined ? stockData.currency : '$');
        const decimals = getDecimals(cleanSym, stockData.price, stockData.decimals);
        const isStock = sec ? false : (stockData.isStock !== false);

        const newItem = {
          id: `stock-${cleanSym}-${Date.now()}`,
          symbol: displaySymbol,
          displaySymbol,
          name: displayName,
          displayName,
          price: stockData.price || stockData.regularMarketPrice || 0,
          change: stockData.change || 0,
          changePercent: stockData.changePercent || 0,
          currency,
          decimals,
          isStock,
          sparkline: stockData.sparkline || [],
          logo: stockData.logo || null,
          exchange: stockData.exchange || (sec ? sec.category.toUpperCase() : '...'),
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
    const cleanSym = typeof symbolOrId === 'string' ? getDisplaySymbol(symbolOrId).toUpperCase() : '';

    setWatchlists((prev) =>
      prev.map((wl) => {
        if (wl.id !== watchlistId) return wl;
        const items = Array.isArray(wl.items) ? wl.items : [];
        return {
          ...wl,
          items: items.filter(
            (item) =>
              item.id !== symbolOrId &&
              getDisplaySymbol(item?.displaySymbol || item?.symbol).toUpperCase() !== cleanSym
          ),
        };
      })
    );
  }, []);

  const toggleStockInWatchlist = useCallback(
    (watchlistId, stockData) => {
      if (!stockData?.symbol) return;
      const cleanSym = getDisplaySymbol(stockData.displaySymbol || stockData.symbol);
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
    {/* Provider exposes watchlists + all mutations */}
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  // Hook to consume watchlist state; throws if used outside provider
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
}
