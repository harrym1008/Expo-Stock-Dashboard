import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { storageService } from '../services/storageService';
import { useMarketData } from './MarketDataContext';

// A global context holding all portfolios, active portfolio ID, and order execution logic
const PortfolioContext = createContext(null);

// Default portfolio data incase no portfolios are found in storage (first time users)
const defaultPortfolios = [
  {
    id: 'portfolio-1',
    title: 'Portfolio 1',
    startingCash: 10000.0,
    cash: 10000.0,
    positions: [],
    createdAt: Date.now(),
  },
];


// Provider component that wraps the app and provides portfolio state and actions
export function PortfolioProvider({ children }) {
  const [portfolios, setPortfolios] = useState(defaultPortfolios);
  const [activePortfolioId, setActivePortfolioIdState] = useState('portfolio-1');
  const hasLoadedFromStorage = useRef(false);
  const portfoliosRef = useRef(portfolios);
  portfoliosRef.current = portfolios;
  // Pull market-data helpers needed to refresh portfolio quotes/profiles
  const {
    setPortfolioSymbols,
    fetchQuote,
    fetchProfile,
    marketStatus,
    hasValidKey,
  } = useMarketData();

  // Load portfolios from persistent storage on mount
  useEffect(() => {
    Promise.all([
      storageService.getStoredPortfolios(),
      storageService.getStoredActivePortfolioId(),
    ]).then(([storedPortfolios, storedActiveId]) => {
      if (Array.isArray(storedPortfolios) && storedPortfolios.length > 0) {
        setPortfolios(storedPortfolios);
        if (
          storedActiveId &&
          storedPortfolios.some((p) => p.id === storedActiveId)
        ) {
          setActivePortfolioIdState(storedActiveId);
        } else {
          setActivePortfolioIdState(storedPortfolios[0].id);
        }
      }
      hasLoadedFromStorage.current = true;
    });
  }, []);

  // Set the portfolios & active ID inside persistent storage whenever state changes
  useEffect(() => {
    if (hasLoadedFromStorage.current) {
      storageService.setStoredPortfolios(portfolios);
    }
  }, [portfolios]);
  useEffect(() => {
    if (hasLoadedFromStorage.current) {
      storageService.setStoredActivePortfolioId(activePortfolioId);
    }
  }, [activePortfolioId]);


  // Set list of unique symbols across all portfolios for market data WS subscription 
  const allUniqueSymbols = useMemo(() => {
    const syms = new Set();
    for (const p of portfolios) {
      if (Array.isArray(p.positions)) {
        for (const pos of p.positions) {
          if (pos?.symbol) syms.add(pos.symbol.toUpperCase());
        }
      }
    }
    return Array.from(syms);
  }, [portfolios]);

  useEffect(() => {
    if (setPortfolioSymbols) {
      setPortfolioSymbols(allUniqueSymbols);
    }
  }, [allUniqueSymbols, setPortfolioSymbols]);


  // Automatically refresh portfolio quotes and profiles every 3 minutes (in case WS quotes are not available)
  const [portfolioRefreshTrigger, setPortfolioRefreshTrigger] = useState(0);

  useEffect(() => {
    const THREE_MINUTES_MS = 3 * 60 * 1000;
    const timer = setInterval(() => {
      setPortfolioRefreshTrigger((prev) => prev + 1);
    }, THREE_MINUTES_MS);

    return () => clearInterval(timer);
  }, []);


  // Download live quotes and company profiles for all portfolio positions
  useEffect(() => {
    if (!allUniqueSymbols || allUniqueSymbols.length === 0 || !fetchQuote) return;

    for (const sym of allUniqueSymbols) {
      fetchQuote(sym);
      if (hasValidKey && fetchProfile) {
        fetchProfile(sym);
      }
    }
  }, [
    allUniqueSymbols,
    marketStatus?.session,
    portfolioRefreshTrigger,
    fetchQuote,
    fetchProfile,
    hasValidKey,
  ]);

  const setActivePortfolioId = useCallback((id) => {
    setActivePortfolioIdState(id);
  }, []);

  const activePortfolio = useMemo(() => {
    return (
      portfolios.find((p) => p.id === activePortfolioId) ||
      portfolios[0] ||
      null
    );
  }, [portfolios, activePortfolioId]);


  // Query a symbol's position within a portfolio
  const getPosition = useCallback(
    (portfolioId, symbol) => {
      if (!symbol) return null;
      const cleanSym = symbol.toUpperCase();
      const targetP = portfolios.find(
        (p) => p.id === (portfolioId || activePortfolioId)  // Default to active portfolio
      );
      if (!targetP || !Array.isArray(targetP.positions)) return null;
      return (
        targetP.positions.find(
          (pos) => pos.symbol?.toUpperCase() === cleanSym
        ) || null
      );
    },
    [portfolios, activePortfolioId]
  );

  // Portfolio Create Rename Update/Reorder Delete actions (CRUD)
  const createPortfolio = useCallback(({ title, cash = 10000 }) => {
    const trimmed = (title || '').trim();
    if (!trimmed) return null;
    const initialCash = Number(cash) || 10000;
    const newId = `portfolio-${Date.now()}`;
    const newPortfolio = {
      id: newId,
      title: trimmed,
      startingCash: initialCash,
      cash: initialCash,
      positions: [],
      createdAt: Date.now(),
    };
    setPortfolios((prev) => [...prev, newPortfolio]);
    setActivePortfolioIdState(newId);
    return newId;
  }, []);

  const renamePortfolio = useCallback((id, newTitle) => {
    const trimmed = (newTitle || '').trim();
    if (!trimmed) return;
    setPortfolios((prev) =>
      prev.map((p) => (p.id === id ? { ...p, title: trimmed } : p))
    );
  }, []);

  const deletePortfolio = useCallback(
    (id) => {
      setPortfolios((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((p) => p.id !== id);
        if (id === activePortfolioId && filtered.length > 0) {
          setActivePortfolioIdState(filtered[0].id);
        }
        return filtered;
      });
    },
    [activePortfolioId]
  );

  const reorderPortfolios = useCallback((reordered) => {
    if (Array.isArray(reordered)) {
      setPortfolios(reordered);
    }
  }, []);

  // Order execution logic to buy and sell shares and update cash/positions accordingly
  const executeOrder = useCallback(
    ({
      portfolioId,
      symbol,
      name,
      mode = 'BUY', // 'BUY' | 'SELL'
      shares,
      price,
    }) => {
      const targetId = portfolioId || activePortfolioId;
      const cleanSym = (symbol || '').toUpperCase();
      const numShares = parseFloat(shares);
      const numPrice = parseFloat(price);

      if (!cleanSym || !(numShares > 0) || !(numPrice > 0)) {
        throw new Error('Invalid order arguments');
      }

      const targetPortfolio = portfoliosRef.current.find((p) => p.id === targetId);
      if (!targetPortfolio) {
        throw new Error('Target portfolio not found');
      }

      const orderCost = numShares * numPrice;
      const currentCash = targetPortfolio.cash || 0;
      const currentPositions = Array.isArray(targetPortfolio.positions)
        ? [...targetPortfolio.positions]
        : [];
      const existingPosIndex = currentPositions.findIndex(
        (pos) => pos.symbol?.toUpperCase() === cleanSym
      );
      const existingPos = existingPosIndex >= 0 ? currentPositions[existingPosIndex] : null;

      let newCash = currentCash;
      let newPositions = [...currentPositions];
      let resultantPosition = null;

      if (mode === 'BUY') {
        // Reject... cash can't cover the trade
        if (currentCash < orderCost) {
          throw new Error(`Insufficient funds: Required $${orderCost.toFixed(2)}, Available $${currentCash.toFixed(2)}`);
        }

        newCash = Math.max(0, currentCash - orderCost);

        if (existingPos) {
          // Add to existing position: blend avg cost across combined shares
          const oldShares = Number(existingPos.shares) || 0;
          const oldAvgCost = Number(existingPos.avgCost) || 0;
          const oldTotalCost = existingPos.totalCost ?? oldShares * oldAvgCost;

          const updatedShares = oldShares + numShares;
          const updatedTotalCost = oldTotalCost + orderCost;
          const updatedAvgCost = updatedTotalCost / updatedShares;

          resultantPosition = {
            ...existingPos,
            shares: Number(updatedShares.toFixed(4)),
            avgCost: Number(updatedAvgCost.toFixed(2)),
            totalCost: Number(updatedTotalCost.toFixed(2)),
            name: name || existingPos.name || cleanSym,
          };
          newPositions[existingPosIndex] = resultantPosition;
        } else {
          // Open a new position at the fill price
          resultantPosition = {
            id: `pos-${cleanSym}-${Date.now()}`,
            symbol: cleanSym,
            name: name || cleanSym,
            shares: Number(numShares.toFixed(4)),
            avgCost: Number(numPrice.toFixed(2)),
            totalCost: Number(orderCost.toFixed(2)),
          };
          newPositions.push(resultantPosition);
        }
      } else {
        // SELL
        const ownedShares = existingPos ? Number(existingPos.shares) || 0 : 0;
        if (ownedShares < numShares && Math.abs(ownedShares - numShares) > 0.0001) {
          // Reject... can't sell more shares than owned
          throw new Error(`Insufficient shares: Owned ${ownedShares}, Attempted to sell ${numShares}`);
        }

        newCash = currentCash + orderCost;
        const remainingShares = Math.max(0, ownedShares - numShares);

        if (remainingShares < 0.0001) {
          // Position fully closed: drop it from the list
          newPositions = newPositions.filter((_, idx) => idx !== existingPosIndex);
          resultantPosition = {
            symbol: cleanSym,
            name: name || existingPos?.name || cleanSym,
            shares: 0,
            avgCost: 0,
            totalCost: 0,
          };
        } else {
          const avgCost = Number(existingPos.avgCost) || numPrice;
          const updatedTotalCost = remainingShares * avgCost;

          resultantPosition = {
            ...existingPos,
            shares: Number(remainingShares.toFixed(4)),
            avgCost: Number(avgCost.toFixed(2)),
            totalCost: Number(updatedTotalCost.toFixed(2)),
          };
          newPositions[existingPosIndex] = resultantPosition;
        }
      }

      // Return summary of the order ready to be shown in the order receipt modal
      const executionSummary = {
        success: true,
        mode,
        symbol: cleanSym,
        name: name || cleanSym,
        shares: numShares,
        fillPrice: numPrice,
        orderCost,
        newPosition: resultantPosition,
        newCash,
        portfolioId: targetId,
        portfolioTitle: targetPortfolio.title,
      };

      setPortfolios((prevPortfolios) =>
        prevPortfolios.map((p) =>
          p.id === targetId
            ? {
                ...p,
                cash: newCash,
                positions: newPositions,
              }
            : p
        )
      );

      if (fetchQuote && cleanSym) {
        fetchQuote(cleanSym);
      }

      return executionSummary;
    },
    [activePortfolioId, fetchQuote]
  );

  const value = useMemo(
    () => ({
      portfolios,
      activePortfolioId,
      setActivePortfolioId,
      activePortfolio,
      getPosition,
      createPortfolio,
      renamePortfolio,
      deletePortfolio,
      reorderPortfolios,
      executeOrder,
    }),
    [
      portfolios,
      activePortfolioId,
      setActivePortfolioId,
      activePortfolio,
      getPosition,
      createPortfolio,
      renamePortfolio,
      deletePortfolio,
      reorderPortfolios,
      executeOrder,
    ]
  );

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  // Hook to consume portfolio state; throws if used outside provider
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
}
