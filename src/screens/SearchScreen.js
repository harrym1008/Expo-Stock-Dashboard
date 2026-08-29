import React, { useState, useMemo, useCallback } from 'react';
import { View } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';
import StockSearchView from '../components/search/StockSearchView';
import StockDetailModal from '../components/stock/StockDetailModal';
import { useMarketData } from '../context/MarketDataContext';
import { layoutStyles } from '../styles';

export default function SearchScreen() {
  const {
    quotes,
    profiles,
    fetchQuote,
    fetchProfile,
    setActiveModalSymbol,
    hasValidKey,
  } = useMarketData();

  const [selectedStock, setSelectedStock] = useState(null);

  const handleOpenStockDetail = useCallback(
    (item) => {
      setSelectedStock(item);
      setActiveModalSymbol(item.symbol);
      if (hasValidKey) {
        fetchQuote(item.symbol);
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
    const sym = selectedStock.symbol;
    const liveQuote = quotes[sym];
    const liveProfile = profiles[sym];

    return {
      symbol: sym,
      name: liveProfile?.name || selectedStock.name,
      exchange: liveProfile?.exchange || '...',
      logo: liveProfile?.logo || null,
      price: (liveQuote?.isLiveWs ? liveQuote.price : null) ?? liveQuote?.price ?? null,
      change: liveQuote?.change ?? null,
      changePercent: liveQuote?.changePercent ?? null,
      previousClose: liveQuote?.previousClose ?? null,
      regularMarketPrice: liveQuote?.regularMarketPrice ?? null,
      lastUpdated: liveQuote?.lastTickTime || liveQuote?.timestamp,
    };
  }, [selectedStock, quotes, profiles]);

  return (
    <ScreenContainer title="Search">
      <View style={layoutStyles.flex1}>
        <StockSearchView onSelectStock={handleOpenStockDetail} />

        {/* Stock Detail Slide-Up Modal */}
        <StockDetailModal
          visible={Boolean(selectedStock)}
          stock={modalStock}
          onClose={handleCloseStockDetail}
        />
      </View>
    </ScreenContainer>
  );
}


