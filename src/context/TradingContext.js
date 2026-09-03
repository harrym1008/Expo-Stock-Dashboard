import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { storageService } from '../services/storageService';

// Context holding simple on/off paper trading state
const TradingContext = createContext(null);


export function TradingProvider({ children }) {
  const [isPaperTradingEnabled, setIsPaperTradingEnabledState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load the persisted paper-trading flag on mount
  useEffect(() => {
    storageService.getPaperTradingEnabled().then((enabled) => {
      setIsPaperTradingEnabledState(Boolean(enabled));
      setIsLoading(false);
    });
  }, []);

  // Persist and set the paper-trading flag
  const setPaperTradingEnabled = useCallback(async (enabled) => {
    const value = Boolean(enabled);
    setIsPaperTradingEnabledState(value);
    await storageService.setPaperTradingEnabled(value);
  }, []);


  // Toggle flag and persist it
  const togglePaperTrading = useCallback(() => {
    setIsPaperTradingEnabledState((prev) => {
      const next = !prev;
      queueMicrotask(() => {
        storageService.setPaperTradingEnabled(next);
      });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      isPaperTradingEnabled,
      setIsPaperTradingEnabled: setPaperTradingEnabled,
      togglePaperTrading,
      isLoading,
    }),
    [isPaperTradingEnabled, setPaperTradingEnabled, togglePaperTrading, isLoading]
  );

  return (
    <TradingContext.Provider value={value}>
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
}
