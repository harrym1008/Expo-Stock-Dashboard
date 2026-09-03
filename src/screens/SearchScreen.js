import React, { useState, useMemo, useCallback } from 'react';
import { View } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';
import StockSearchView from '../components/search/StockSearchView';
import StockDetailModal from '../components/stock/StockDetailModal';
import { useMarketData } from '../context/MarketDataContext';
import { layoutStyles } from '../styles';
import { formatStockQuote } from '../utils/formatters';

// Subscribes to live quote updates ONLY when a stock detail modal is open
function SearchStockDetailModal({ stock, onClose }) {
  const { quotes, profiles, marketStatus } = useMarketData();

  const modalStock = useMemo(() => {
    if (!stock) return null;
    const sym = (stock.displaySymbol || stock.symbol)?.toUpperCase();
    const rawSym = stock.symbol?.toUpperCase();
    const quote = (sym && quotes[sym]) || (rawSym && quotes[rawSym]) || null;
    const profile = (sym && profiles[sym]) || (rawSym && profiles[rawSym]) || null;
    return formatStockQuote(
      stock,
      quote,
      profile,
      null,
      marketStatus
    );
  }, [stock, quotes, profiles, marketStatus]);

  return (
    <StockDetailModal
      visible={Boolean(stock)}
      stock={modalStock}
      onClose={onClose}
    />
  );
}

// Search screen, uses StockSearchView (shared with the SearchStockModal)
export default function SearchScreen() {
  const {
    fetchQuote,
    fetchProfile,
    setActiveModalSymbol,
    hasValidKey,
  } = useMarketData();

  const [selectedStock, setSelectedStock] = useState(null);

  // Open detail modal and fetch live quote/profile for the picked stock
  const handleOpenStockDetail = useCallback(
    (item) => {
      setSelectedStock(item);
      setActiveModalSymbol(item.symbol);
      fetchQuote(item.symbol);
      if (hasValidKey) {
        fetchProfile(item.symbol);
      }
    },
    [setActiveModalSymbol, hasValidKey, fetchQuote, fetchProfile]
  );

  const handleCloseStockDetail = useCallback(() => {
    setSelectedStock(null);
    setActiveModalSymbol(null);
  }, [setActiveModalSymbol]);

  return (
    <ScreenContainer title="Search">
      <View style={layoutStyles.flex1}>
        <StockSearchView onSelectStock={handleOpenStockDetail} />

        {/* Slide up modal only mounts and subscribes to live quote ticks when a security is picked */}
        {Boolean(selectedStock) && (
          <SearchStockDetailModal
            stock={selectedStock}
            onClose={handleCloseStockDetail}
          />
        )}
      </View>
    </ScreenContainer>
  );
}


