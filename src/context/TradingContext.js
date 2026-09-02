import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { storageService } from '../services/storageService';

// Context holding paper-trading state
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

  // Persist + set the paper-trading flag (coerced to boolean)
  const setPaperTradingEnabled = useCallback(async (enabled) => {
    const value = Boolean(enabled);
    setIsPaperTradingEnabledState(value);
    await storageService.setPaperTradingEnabled(value);
  }, []);

  // Flip the flag; persist best-effort inside the updater
  const togglePaperTrading = useCallback(async () => {
    setIsPaperTradingEnabledState((prev) => {
      const next = !prev;
      storageService.setPaperTradingEnabled(next);
      return next;
    });
  }, []);

  const value = {
    isPaperTradingEnabled,
    setIsPaperTradingEnabled: setPaperTradingEnabled,
    togglePaperTrading,
    isLoading,
  };

  return (
    {/* Provider exposes paper-trading state + setters */}
    <TradingContext.Provider value={value}>
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  // Hook to consume paper-trading state; throws if used outside provider
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
}
