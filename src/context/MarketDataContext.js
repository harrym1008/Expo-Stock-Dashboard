import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { storageService } from '../services/storageService';
import { finnhubRestService } from '../services/finnhubRestService';
import { finnhubWebSocketService } from '../services/finnhubWebSocketService';
import { yahooFinanceService } from '../services/yahooFinanceService';

const MarketDataContext = createContext(null);

export function MarketDataProvider({ children }) {
  const [apiKey, setApiKey] = useState('');
  const [quotes, setQuotes] = useState({});
  const [profiles, setProfiles] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState({});
  const [loadingProfiles, setLoadingProfiles] = useState({});

  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;

  // 1. Initialize API Key on startup
  useEffect(() => {
    storageService.getApiKey().then((key) => {
      if (key) {
        setApiKey(key);
        finnhubWebSocketService.setApiKey(key);
      }
    });

    return () => {
      finnhubWebSocketService.destroy();
    };
  }, []);

  // 2. Handle API Key Updates
  const updateApiKey = useCallback(async (newKey) => {
    const cleanKey = (newKey || '').trim();
    setApiKey(cleanKey);
    await storageService.setApiKey(cleanKey);
    finnhubWebSocketService.setApiKey(cleanKey);
  }, []);

  // 3. Listen to 2Hz Trade Ticks from WebSocket
  useEffect(() => {
    const unsubscribe = finnhubWebSocketService.addListener((ticks) => {
      if (!Array.isArray(ticks) || ticks.length === 0) return;

      setQuotes((prev) => {
        const next = { ...prev };
        let hasChanges = false;

        for (const tick of ticks) {
          const sym = tick.symbol;
          const current = next[sym] || {};
          const prevClose = current.previousClose || tick.price;
          const newPrice = tick.price;
          const change = newPrice - prevClose;
          const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

          next[sym] = {
            ...current,
            symbol: sym,
            price: newPrice,
            change,
            changePercent,
            previousClose: prevClose,
            lastTickTime: tick.timestamp,
            sparkline: current.sparkline
              ? [...current.sparkline.slice(-30), newPrice]
              : [newPrice],
          };
          hasChanges = true;
        }

        return hasChanges ? next : prev;
      });
    });

    return unsubscribe;
  }, []);

  // 4. Fetch Stock Quote via REST
  const fetchQuote = useCallback(
    async (symbol) => {
      if (!symbol || !apiKey) return null;
      const sym = symbol.toUpperCase();

      setLoadingQuotes((prev) => ({ ...prev, [sym]: true }));
      try {
        const quote = await finnhubRestService.fetchQuote(sym, apiKey);
        if (quote) {
          setQuotes((prev) => ({
            ...prev,
            [sym]: {
              ...(prev[sym] || {}),
              ...quote,
            },
          }));
        }
        return quote;
      } finally {
        setLoadingQuotes((prev) => ({ ...prev, [sym]: false }));
      }
    },
    [apiKey]
  );

  // 5. Fetch Company Profile & Logo via REST (Cached) - Stable callback without profiles dependency
  const fetchProfile = useCallback(
    async (symbol) => {
      if (!symbol || !apiKey) return null;
      const sym = symbol.toUpperCase();

      if (profilesRef.current[sym]) return profilesRef.current[sym];

      setLoadingProfiles((prev) => ({ ...prev, [sym]: true }));
      try {
        const profile = await finnhubRestService.fetchCompanyProfile(sym, apiKey);
        if (profile) {
          setProfiles((prev) => ({
            ...prev,
            [sym]: profile,
          }));
        }
        return profile;
      } finally {
        setLoadingProfiles((prev) => ({ ...prev, [sym]: false }));
      }
    },
    [apiKey]
  );

  // 6. Fetch Historical Chart via Yahoo Finance with latest live WebSocket tick overlay
  const fetchHistoricalChart = useCallback(async (symbol, timeframe = '3M') => {
    if (!symbol) return null;
    const sym = symbol.toUpperCase();
    const livePrice = quotesRef.current[sym]?.price || null;
    return await yahooFinanceService.fetchHistoricalData(sym, timeframe, livePrice);
  }, []);

  // 7. Watchlist & Active Modal Symbol Subscriptions
  const setWatchlistSymbols = useCallback((symbols) => {
    finnhubWebSocketService.setWatchlistSymbols(symbols);
  }, []);

  const setActiveModalSymbol = useCallback((symbol) => {
    if (symbol) {
      finnhubWebSocketService.setActiveViewSymbols([symbol]);
    } else {
      finnhubWebSocketService.setActiveViewSymbols([]);
    }
  }, []);

  const value = {
    apiKey,
    hasValidKey: Boolean(apiKey && apiKey.length > 5),
    updateApiKey,
    quotes,
    profiles,
    loadingQuotes,
    loadingProfiles,
    fetchQuote,
    fetchProfile,
    fetchHistoricalChart,
    setWatchlistSymbols,
    setActiveModalSymbol,
  };

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  );
}

export function useMarketData() {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return context;
}
