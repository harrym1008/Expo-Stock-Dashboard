import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { storageService } from '../services/storageService';
import { finnhubRestService } from '../services/finnhubRestService';
import { finnhubWebSocketService } from '../services/finnhubWebSocketService';
import { yahooFinanceService } from '../services/yahooFinanceService';
import { getMarketSessionStatus } from '../utils/marketHours';
import { ingestHolidayData } from '../utils/marketHolidays';

const MarketDataContext = createContext(null);

export function MarketDataProvider({ children }) {
  const [apiKey, setApiKey] = useState('');
  const [quotes, setQuotes] = useState({});
  const [profiles, setProfiles] = useState({});
  const [marketStatus, setMarketStatus] = useState(getMarketSessionStatus());

  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;

  // 1. High-precision 1-second timer for exact-second market session transitions (NY Time)
  useEffect(() => {
    const checkStatus = () => {
      const current = getMarketSessionStatus();
      setMarketStatus((prev) => {
        if (
          prev.session !== current.session ||
          prev.isOpen !== current.isOpen ||
          prev.label !== current.label ||
          prev.sublabel !== current.sublabel
        ) {
          console.log(`[Market Status] ⏱️ Market session flipped to: ${current.label} (${current.session})`);
          return current;
        }
        return prev;
      });
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Initialize API Key on startup
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

  // 3. Handle API Key Updates
  const updateApiKey = useCallback(async (newKey) => {
    const cleanKey = (newKey || '').trim();
    setApiKey(cleanKey);
    await storageService.setApiKey(cleanKey);
    finnhubWebSocketService.setApiKey(cleanKey);
  }, []);

  // 4. Fetch live Finnhub market holidays if year >= 2028
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    if (currentYear >= 2028 && apiKey) {
      finnhubRestService.fetchMarketHolidays(apiKey, 'US').then((res) => {
        if (res && Array.isArray(res.data)) {
          ingestHolidayData(res.data);
          console.log(`[Finnhub Holidays] 📅 Ingested ${res.data.length} live market holidays from API for year >= 2028`);
        }
      });
    }
  }, [apiKey]);

  // 5. Listen to 2Hz Trade Ticks from WebSocket
  useEffect(() => {
    const unsubscribe = finnhubWebSocketService.addListener((ticks) => {
      if (!Array.isArray(ticks) || ticks.length === 0) return;

      const sessionStatus = getMarketSessionStatus();

      setQuotes((prev) => {
        const next = { ...prev };
        let hasChanges = false;

        for (const tick of ticks) {
          const sym = tick.symbol;
          const current = next[sym] || {};
          const newPrice = tick.price;

          // Out-of-hours return must be relative to the MOST RECENT close (regularMarketPrice)
          // Intraday return during market open is relative to previous day close
          const refClose = sessionStatus.isOpen
            ? (current.previousClose || newPrice)
            : (current.regularMarketPrice || current.previousClose || newPrice);

          const change = newPrice - refClose;
          const changePercent = refClose !== 0 ? (change / refClose) * 100 : 0;

          next[sym] = {
            ...current,
            symbol: sym,
            price: newPrice,
            isLiveWs: true, // Mark verified real-time live WebSocket tick
            change,
            changePercent,
            previousClose: current.previousClose || refClose,
            regularMarketPrice: current.regularMarketPrice || refClose,
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

  // 6. Fetch Stock Quote via REST (does not override real WebSocket live ticks)
  const fetchQuote = useCallback(
    async (symbol) => {
      if (!symbol || !apiKey) return null;
      const sym = symbol.toUpperCase();

      const quote = await finnhubRestService.fetchQuote(sym, apiKey);
      if (quote) {
        setQuotes((prev) => {
          const existing = prev[sym] || {};
          return {
            ...prev,
            [sym]: {
              ...quote,
              ...existing,
              previousClose: quote.previousClose || existing.previousClose,
              regularMarketPrice: quote.price || existing.regularMarketPrice,
            },
          };
        });
      }
      return quote;
    },
    [apiKey]
  );

  // 7. Fetch Company Profile & Logo via REST (Cached)
  const fetchProfile = useCallback(
    async (symbol) => {
      if (!symbol || !apiKey) return null;
      const sym = symbol.toUpperCase();

      if (profilesRef.current[sym]) return profilesRef.current[sym];

      const profile = await finnhubRestService.fetchCompanyProfile(sym, apiKey);
      if (profile) {
        setProfiles((prev) => ({
          ...prev,
          [sym]: profile,
        }));
      }
      return profile;
    },
    [apiKey]
  );

  // 8. Fetch Historical Chart via Yahoo Finance with verified live WebSocket tick overlay only
  const fetchHistoricalChart = useCallback(async (symbol, timeframe = '1D') => {
    if (!symbol) return null;
    const sym = symbol.toUpperCase();
    const wsQuote = quotesRef.current[sym];
    const livePrice = wsQuote?.isLiveWs ? wsQuote.price : null;
    return await yahooFinanceService.fetchHistoricalData(sym, timeframe, livePrice);
  }, []);

  // 9. Watchlist & Active Modal Symbol Subscriptions
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
    marketStatus,
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
