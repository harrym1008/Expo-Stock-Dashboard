import React, { useState, useMemo, useCallback } from 'react';
import { View } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';
import StockSearchView from '../components/search/StockSearchView';
import StockDetailModal from '../components/stock/StockDetailModal';
import { useMarketData } from '../context/MarketDataContext';
import { layoutStyles } from '../styles';
import { formatStockQuote } from '../utils/formatters';

// Search screen, uses StockSearchView (shared with the SearchStockModal)
export default function SearchScreen() {
  const {
    quotes,
    profiles,
    marketStatus,
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

  // Stock object to pass to StockDetailModal with live overlay data if available
  const modalStock = useMemo(() => {
    if (!selectedStock) return null;
    const sym = selectedStock.symbol?.toUpperCase();
    return formatStockQuote(
      selectedStock,
      quotes[sym],
      profiles[sym],
      null,
      marketStatus
    );
  }, [selectedStock, quotes, profiles, marketStatus]);

  return (
    <ScreenContainer title="Search">
      <View style={layoutStyles.flex1}>
        <StockSearchView onSelectStock={handleOpenStockDetail} />

        {/* Slide up modal for when a security is selected */}
        <StockDetailModal
          visible={Boolean(selectedStock)}
          stock={modalStock}
          onClose={handleCloseStockDetail}
        />
      </View>
    </ScreenContainer>
  );
}


