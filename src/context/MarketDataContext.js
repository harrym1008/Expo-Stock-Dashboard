import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { storageService } from '../services/storageService';
import { finnhubRestService } from '../services/finnhubRestService';
import { finnhubWebSocketService } from '../services/finnhubWebSocketService';
import { yahooFinanceService } from '../services/yahooFinanceService';
import { getMarketSessionStatus } from '../utils/marketHours';
import { ingestHolidayData } from '../utils/marketHolidays';
import { getDisplaySymbol, getFinnhubSymbol, isNonStockSecurity } from '../utils/securityUtils';


// Recompute change/percent + append live price to sparkline for a single tick from the websocket feed
function calculateTickUpdate(current, sym, newPrice, timestamp, sessionStatus) {
  if (typeof newPrice !== 'number' || newPrice <= 0) {
    return current;
  }
  const currentQuote = current || {};
  const refClose = sessionStatus.isOpen
    ? (currentQuote.previousClose || newPrice)
    : (currentQuote.regularMarketPrice || currentQuote.previousClose || newPrice);

  const change = newPrice - refClose;
  const changePercent = refClose !== 0 ? (change / refClose) * 100 : 0;

  // Return a new quote object with updated price, change, and sparkline
  return {
    ...currentQuote,
    symbol: sym,
    price: newPrice,
    isLiveWs: true,
    change,
    changePercent,
    previousClose: currentQuote.previousClose || refClose,
    regularMarketPrice: currentQuote.regularMarketPrice || refClose,
    lastTickTime: timestamp,
    sparkline: currentQuote.sparkline
      ? [...currentQuote.sparkline.slice(-30), newPrice] 
      : [newPrice],
  };
}

// A global context for market data, including quotes, profiles, and market status
const MarketDataContext = createContext(null);


// MarketDataProvider wraps the app and provides market data state and methods to children components
export function MarketDataProvider({ children }) {
  const [apiKey, setApiKey] = useState('');
  const [quotes, setQuotes] = useState({});
  const [profiles, setProfiles] = useState({});
  const [marketStatus, setMarketStatus] = useState(getMarketSessionStatus());

  // Refs mirror state for use inside the 2Hz tick callback without re-subscribing
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;

  // 3s timer checks market session changes and updates marketStatus state if needed
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
          return current;
        }
        return prev;
      });
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);


  //  Load stored API key on mount and destroy websocket on unmount
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

  // Update the API key when the user changes it inside the settings
  const updateApiKey = useCallback(async (newKey) => {
    const cleanKey = (newKey || '').trim();
    setApiKey(cleanKey);
    await storageService.setApiKey(cleanKey);   // Persist the new key in storage
    finnhubWebSocketService.setApiKey(cleanKey);
  }, []);

  // Local cache of US market holidays is only fetched up to 2027
  // If the current year is 2028 (unlikely) or later, fetch the latest holidays from Finnhub REST API
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    if (currentYear >= 2028 && apiKey) {
      finnhubRestService.fetchMarketHolidays(apiKey, 'US').then((res) => {
        if (res && Array.isArray(res.data)) {
          ingestHolidayData(res.data);
        }
      });
    }
  }, [apiKey]);

  
  // 2Hz websocket trade messages update quote map with live price, change, percent, and sparkline for each symbol
  useEffect(() => {
    const unsubscribe = finnhubWebSocketService.addListener((ticks) => {
      if (!Array.isArray(ticks) || ticks.length === 0) return;

      const sessionStatus = getMarketSessionStatus();

      setQuotes((prev) => {
        const next = { ...prev };
        let hasChanges = false;

        for (const tick of ticks) {
          const sym = tick.symbol;
          const displaySym = getDisplaySymbol(sym);

          const update = calculateTickUpdate(
            next[displaySym] || next[sym],
            displaySym,
            tick.price,
            tick.timestamp,
            sessionStatus
          );

          next[sym] = update;
          next[displaySym] = update;
          hasChanges = true;
        }

        return hasChanges ? next : prev;
      });
    });

    return unsubscribe;
  }, []);

  // Func to fetch Stock Quote via Yahoo Finance  (no API key and better pre/post accuracy)
  const fetchQuote = useCallback(
    async (symbol) => {
      if (!symbol) return null;
      const cleanSym = getDisplaySymbol(symbol);
      const finnhubSym = getFinnhubSymbol(symbol);

      const quote = await yahooFinanceService.fetchQuote(cleanSym);
      if (quote?.price > 0) {
        setQuotes((prev) => {
          const existing = prev[cleanSym] || prev[finnhubSym] || {};
          // Keep live WS price when present; otherwise take fetched price
          const isLiveWs = Boolean(existing.isLiveWs && existing.price > 0);
          const merged = {
            ...quote,
            ...existing,
            price: isLiveWs ? existing.price : quote.price,
            previousClose: quote.previousClose || existing.previousClose,
            regularMarketPrice: quote.regularMarketPrice || existing.regularMarketPrice || quote.price,
            preMarketPrice: quote.preMarketPrice || existing.preMarketPrice,
            postMarketPrice: quote.postMarketPrice || existing.postMarketPrice,
          };
          return {
            ...prev,
            [finnhubSym]: merged,
            [cleanSym]: merged,
          };
        });
        return quote;
      }
      return null;
    },
    []
  );

  // Func to fetch Company Profile & Logo via Finnhub REST (data is cached and accessed from this cache if it exists)
  const fetchProfile = useCallback(
    async (symbol) => {
      if (!symbol || !apiKey) return null;
      if (isNonStockSecurity(symbol)) return null;

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

  // Func to fetch Historical Chart via Yahoo Finance
  const fetchHistoricalChart = useCallback(async (symbol, timeframe = '1D') => {
    if (!symbol) return null;
    const cleanSym = getDisplaySymbol(symbol);
    const wsQuote = quotesRef.current[cleanSym] || quotesRef.current[symbol];
    const livePrice = wsQuote?.isLiveWs ? wsQuote.price : null;
    return await yahooFinanceService.fetchHistoricalData(cleanSym, timeframe, livePrice);
  }, []);

  // Func to fetch company metrics from Finnhub (such as PE ratio, EPS, market cap, etc.)
  const fetchStockMetrics = useCallback(
    async (symbol) => {
      if (!symbol || !apiKey) return null;
      if (isNonStockSecurity(symbol)) return null;
      return await finnhubRestService.fetchStockMetrics(symbol, apiKey);
    },
    [apiKey]
  );

  // Func to fetch Company Description via Yahoo Finance
  const fetchCompanyDescription = useCallback(async (symbol) => {
    if (!symbol) return null;
    const cleanSym = getDisplaySymbol(symbol);
    return await yahooFinanceService.fetchCompanyDescription(cleanSym);
  }, []);

  // Func to fetch Company News via Finnhub REST (also cached)
  const fetchCompanyNews = useCallback(
    async (symbol) => {
      if (!symbol || !apiKey) return [];
      if (isNonStockSecurity(symbol)) return [];
      return await finnhubRestService.fetchCompanyNews(symbol, apiKey);
    },
    [apiKey]
  );

  // Func to download Market News via Finnhub REST (cached)
  const fetchMarketNews = useCallback(
    async (category = 'general', forceRefresh = false) => {
      if (!apiKey) return [];
      return await finnhubRestService.fetchMarketNews(apiKey, category, forceRefresh);
    },
    [apiKey]
  );


  // Watchlist, portfolio & active modal symbol subscriptions
  const [watchlistSymbolsList, setWatchlistSymbolsList] = useState([]);
  const [portfolioSymbolsList, setPortfolioSymbolsList] = useState([]);

  useEffect(() => {
    const combined = Array.from(new Set([...watchlistSymbolsList, ...portfolioSymbolsList]));
    finnhubWebSocketService.setWatchlistSymbols(combined);
  }, [watchlistSymbolsList, portfolioSymbolsList]);

  const setWatchlistSymbols = useCallback((symbols) => {
    setWatchlistSymbolsList(Array.isArray(symbols) ? symbols : []);
  }, []);

  const setPortfolioSymbols = useCallback((symbols) => {
    setPortfolioSymbolsList(Array.isArray(symbols) ? symbols : []);
  }, []);

  const setActiveModalSymbol = useCallback((symbol) => {
    if (symbol) {
      finnhubWebSocketService.setActiveViewSymbols([symbol]);
    } else {
      finnhubWebSocketService.setActiveViewSymbols([]);
    }
  }, []);


  // Inject a live price update into the quotes state (used after quoting for a paper trade)
  const injectLivePrice = useCallback((symbol, newPrice, timestamp = Date.now()) => {
    if (!symbol || !(newPrice > 0)) return;
    const displaySym = getDisplaySymbol(symbol);
    const finnhubSym = getFinnhubSymbol(symbol);
    const sessionStatus = getMarketSessionStatus();

    setQuotes((prev) => {
      const update = calculateTickUpdate(prev[displaySym] || prev[finnhubSym], displaySym, newPrice, timestamp, sessionStatus);
      return {
        ...prev,
        [displaySym]: update,
        [finnhubSym]: update,
      };
    });
  }, []);

  const hasValidKey = Boolean(apiKey && apiKey.length > 5);

  const value = useMemo(
    () => ({
      apiKey,
      hasValidKey,
      updateApiKey,
      quotes,
      profiles,
      marketStatus,
      fetchQuote,
      fetchProfile,
      fetchHistoricalChart,
      fetchStockMetrics,
      fetchCompanyDescription,
      fetchCompanyNews,
      fetchMarketNews,
      setWatchlistSymbols,
      setPortfolioSymbols,
      setActiveModalSymbol,
      injectLivePrice,
    }),
    [
      apiKey,
      hasValidKey,
      updateApiKey,
      quotes,
      profiles,
      marketStatus,
      fetchQuote,
      fetchProfile,
      fetchHistoricalChart,
      fetchStockMetrics,
      fetchCompanyDescription,
      fetchCompanyNews,
      fetchMarketNews,
      setWatchlistSymbols,
      setPortfolioSymbols,
      setActiveModalSymbol,
      injectLivePrice,
    ]
  );

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  );
}

export function useMarketData() {
  // Hook to consume market data; throws if used outside provider
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return context;
}
