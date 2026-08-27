import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/common/ScreenContainer';
import AppText from '../components/common/AppText';
import SearchResultItem from '../components/search/SearchResultItem';
import StockDetailModal from '../components/stock/StockDetailModal';
import searchTickersData from '../constants/searchTickers.json';
import { logoService } from '../services/logoService';
import { useTheme } from '../context/ThemeContext';
import { useMarketData } from '../context/MarketDataContext';
import { spacing, borderRadius, fonts } from '../constants/theme';

// Module-level memoized ticker entries
const ALL_TICKERS = Object.entries(searchTickersData).map(([symbol, item]) => ({
  symbol: symbol.toUpperCase(),
  name: item?.name || symbol,
  marketCap: typeof item?.marketCap === 'number' ? item.marketCap : 0,
}));

// Pre-sorted top 25 tickers by market cap for default view (marketCap is solely used for sorting)
const DEFAULT_TOP_TICKERS = [...ALL_TICKERS]
  .sort((a, b) => b.marketCap - a.marketCap)
  .slice(0, 25);

export default function SearchScreen() {
  const { theme } = useTheme();
  const {
    quotes,
    profiles,
    fetchQuote,
    fetchProfile,
    setActiveModalSymbol,
    hasValidKey,
  } = useMarketData();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);

  // Filter tickers by symbol or name and sort by market cap descending (max 25 results)
  const filteredResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return DEFAULT_TOP_TICKERS;
    }

    const matches = [];
    for (let i = 0; i < ALL_TICKERS.length; i++) {
      const item = ALL_TICKERS[i];
      if (
        item.symbol.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query)
      ) {
        matches.push(item);
      }
    }

    // Sort by marketCap highest to lowest
    matches.sort((a, b) => b.marketCap - a.marketCap);

    // Limit to max 25 results
    return matches.slice(0, 25);
  }, [searchQuery]);

  // Preload static logos in background for visible search results
  useEffect(() => {
    logoService.preloadLogos(filteredResults);
  }, [filteredResults]);

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

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    Keyboard.dismiss();
  }, []);

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

  const isSearching = searchQuery.trim().length > 0;

  return (
    <ScreenContainer title="Search">
      <View style={styles.container}>
        {/* Search Input Bar */}
        <View
          style={[
            styles.searchBarContainer,
            {
              backgroundColor: theme.surfaceSubtle,
              borderColor: theme.border,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color={theme.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: theme.textPrimary }]}
            placeholder="Search by ticker or company name..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={theme.primary}
            clearButtonMode="never"
            returnKeyType="search"
          />
          {isSearching && (
            <TouchableOpacity
              onPress={handleClearSearch}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel="Clear search text"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <AppText bold style={[styles.sectionHeaderText, { color: theme.textSecondary }]}>
            {isSearching
              ? `RESULTS (${filteredResults.length})`
              : 'TOP STOCKS'}
          </AppText>
        </View>

        {/* Search Results List */}
        <FlatList
          data={filteredResults}
          keyExtractor={(item) => item.symbol}
          renderItem={({ item }) => (
            <SearchResultItem
              item={{
                ...item,
                logo: profiles[item.symbol]?.logo || null,
              }}
              onPress={() => handleOpenStockDetail(item)}
            />
          )}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIconContainer,
                  { backgroundColor: theme.surfaceSubtle },
                ]}
              >
                <Ionicons
                  name="search-outline"
                  size={32}
                  color={theme.textMuted}
                />
              </View>
              <AppText bold style={styles.emptyTitle}>
                No stocks found
              </AppText>
              <AppText
                style={[styles.emptySubtitle, { color: theme.textSecondary }]}
              >
                No results matching "{searchQuery}". Try searching for another ticker symbol or company name.
              </AppText>
            </View>
          }
        />

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 46,
    marginBottom: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.regular,
    paddingVertical: 0,
    height: '100%',
  },
  clearButton: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionHeaderText: {
    fontSize: 12,
    letterSpacing: 0.8,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  emptyState: {
    paddingVertical: spacing.xxl * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
