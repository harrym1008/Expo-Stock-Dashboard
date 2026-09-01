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

const PortfolioContext = createContext(null);

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

export function PortfolioProvider({ children }) {
  const [portfolios, setPortfolios] = useState(defaultPortfolios);
  const [activePortfolioId, setActivePortfolioIdState] = useState('portfolio-1');
  const hasLoadedFromStorage = useRef(false);
  const { setPortfolioSymbols } = useMarketData();

  // 1. Load portfolios from AsyncStorage on mount
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

  // 2. Persist portfolios & active ID whenever state changes
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

  // 3. Sync all symbols across all portfolios to WebSocket manager
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

  // 4. Helper to query position of a symbol in a specific portfolio
  const getPosition = useCallback(
    (portfolioId, symbol) => {
      if (!symbol) return null;
      const cleanSym = symbol.toUpperCase();
      const targetP = portfolios.find(
        (p) => p.id === (portfolioId || activePortfolioId)
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

  // 5. Portfolio CRUD
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

  // 6. Zero-Fee Instant Order Execution
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

      if (!cleanSym || isNaN(numShares) || numShares <= 0 || isNaN(numPrice) || numPrice <= 0) {
        throw new Error('Invalid order arguments');
      }

      const orderCost = numShares * numPrice;
      let executionSummary = null;

      setPortfolios((prevPortfolios) => {
        const targetPortfolio = prevPortfolios.find((p) => p.id === targetId);
        if (!targetPortfolio) return prevPortfolios;

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
        let resultPosition = null;

        if (mode === 'BUY') {
          if (currentCash < orderCost) {
            throw new Error(`Insufficient funds: Required $${orderCost.toFixed(2)}, Available $${currentCash.toFixed(2)}`);
          }

          newCash = Math.max(0, currentCash - orderCost);

          if (existingPos) {
            const oldShares = Number(existingPos.shares) || 0;
            const oldAvgCost = Number(existingPos.avgCost) || 0;
            const oldTotalCost = existingPos.totalCost ?? oldShares * oldAvgCost;

            const updatedShares = oldShares + numShares;
            const updatedTotalCost = oldTotalCost + orderCost;
            const updatedAvgCost = updatedTotalCost / updatedShares;

            resultPosition = {
              ...existingPos,
              shares: Number(updatedShares.toFixed(4)),
              avgCost: Number(updatedAvgCost.toFixed(2)),
              totalCost: Number(updatedTotalCost.toFixed(2)),
              name: name || existingPos.name || cleanSym,
            };
            newPositions[existingPosIndex] = resultPosition;
          } else {
            resultPosition = {
              id: `pos-${cleanSym}-${Date.now()}`,
              symbol: cleanSym,
              name: name || cleanSym,
              shares: Number(numShares.toFixed(4)),
              avgCost: Number(numPrice.toFixed(2)),
              totalCost: Number(orderCost.toFixed(2)),
            };
            newPositions.push(resultPosition);
          }
        } else {
          // SELL
          const ownedShares = existingPos ? Number(existingPos.shares) || 0 : 0;
          if (ownedShares < numShares && Math.abs(ownedShares - numShares) > 0.0001) {
            throw new Error(`Insufficient shares: Owned ${ownedShares}, Attempted to sell ${numShares}`);
          }

          newCash = currentCash + orderCost;
          const remainingShares = Math.max(0, ownedShares - numShares);

          if (remainingShares <= 0.0001) {
            // Position closed completely
            newPositions = newPositions.filter((_, idx) => idx !== existingPosIndex);
            resultPosition = {
              symbol: cleanSym,
              name: name || existingPos?.name || cleanSym,
              shares: 0,
              avgCost: 0,
              totalCost: 0,
            };
          } else {
            const avgCost = Number(existingPos.avgCost) || numPrice;
            const updatedTotalCost = remainingShares * avgCost;

            resultPosition = {
              ...existingPos,
              shares: Number(remainingShares.toFixed(4)),
              avgCost: Number(avgCost.toFixed(2)),
              totalCost: Number(updatedTotalCost.toFixed(2)),
            };
            newPositions[existingPosIndex] = resultPosition;
          }
        }

        executionSummary = {
          success: true,
          mode,
          symbol: cleanSym,
          name: name || cleanSym,
          shares: numShares,
          fillPrice: numPrice,
          orderCost,
          newPosition: resultPosition,
          newCash,
          portfolioId: targetId,
          portfolioTitle: targetPortfolio.title,
        };

        return prevPortfolios.map((p) =>
          p.id === targetId
            ? {
                ...p,
                cash: newCash,
                positions: newPositions,
              }
            : p
        );
      });

      return executionSummary;
    },
    [activePortfolioId]
  );

  const value = {
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
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
}
