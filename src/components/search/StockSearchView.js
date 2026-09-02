import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TextInput, TouchableOpacity, Keyboard, ActivityIndicator} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../common/AppText';
import SearchResultItem from './SearchResultItem';
import NonStockSecuritiesModal from './NonStockSecuritiesModal';
import searchTickersData from '../../constants/searchTickers.json';
import { getAllNonStockSecurities } from '../../utils/securityUtils';
import { logoService } from '../../services/logoService';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { finnhubRestService } from '../../services/finnhubRestService';
import { spacing, borderRadius, fonts } from '../../constants/theme';
import { layoutStyles, emptyStateStyles } from '../../styles';

// load all locally stored stock tickers from the JSON file
const ALL_STOCK_TICKERS = Object.entries(searchTickersData).map(([symbol, item]) => ({
  symbol: symbol.toUpperCase(),
  displaySymbol: symbol.toUpperCase(),
  name: item?.name || symbol,
  displayName: item?.name || symbol,
  marketCap: typeof item?.marketCap === 'number' ? item.marketCap : 0,
  isStock: true,
  decimals: 2,
  currency: '$',
}));

// Load all non-security tickers
const ALL_NON_STOCK_TICKERS = getAllNonStockSecurities().map((item) => ({
  symbol: item.displaySymbol,
  displaySymbol: item.displaySymbol,
  name: item.displayName,
  displayName: item.displayName,
  marketCap: 0,
  isStock: false,
  category: item.category,
  decimals: item.decimals,
  currency: item.currency,
  finnhubSymbol: item.finnhubSymbol,
  yahooSymbol: item.yahooSymbol,
}));

// Merge all into one list for local search (prioritise non-stock securities first, then stocks)
const ALL_TICKERS = [...ALL_STOCK_TICKERS, ...ALL_NON_STOCK_TICKERS];

// By default show the top 40 stocks by market cap when search bar is empty (non securities not included)
const DEFAULT_TOP_TICKERS = [...ALL_STOCK_TICKERS]
  .sort((a, b) => b.marketCap - a.marketCap)
  .slice(0, 40);

// Search screen using the local list of tickers and also using Finnhub for a further more detailed search
export default function StockSearchView({
  onSelectStock,
  autoFocus = false,
  placeholder = 'Search by ticker, security or name...',
  containerStyle,
}) {
  const { theme } = useTheme();
  const { profiles, apiKey } = useMarketData();

  const [nonStockModalVisible, setNonStockModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState([]);
  const [remoteSearchStatus, setRemoteSearchStatus] = useState('idle');

  // Only search finnhub after the user has stopped typing for a second and query isnt empty
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    let isCurrentSearch = true;

    if (!trimmedQuery || !apiKey) {
      setRemoteResults([]);
      setRemoteSearchStatus('idle');
      return undefined;
    }

    setRemoteResults([]);
    setRemoteSearchStatus('pending');

    const timeoutId = setTimeout(async () => {
      if (!isCurrentSearch) return;

      let results = [];
      try {
        // Submit the search query to Finnhub and get the results
        results = await finnhubRestService.searchSymbols(trimmedQuery, apiKey);
      } catch (err) {
        if (isCurrentSearch) {
          setRemoteSearchStatus('error');
        }
        return;
      }

      if (!isCurrentSearch) return;

      const normalizedResults = (Array.isArray(results) ? results : [])
        .filter((item) => item?.symbol)
        .map((item) => ({
          symbol: item.symbol.trim().toUpperCase(),
          displaySymbol: item.displaySymbol || item.symbol.trim().toUpperCase(),
          name: item.name || item.displaySymbol || item.symbol,
          displayName: item.name || item.displaySymbol || item.symbol,
          marketCap: 0,
          isStock: true,
          currency: '$',
          decimals: 2,
        }));

      setRemoteResults(normalizedResults);
      setRemoteSearchStatus(normalizedResults.length > 0 ? 'success' : 'empty');
    }, 1000);

    return () => {
      isCurrentSearch = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, apiKey]);

  // Filter tickers by symbol or name
  const filteredResults = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return DEFAULT_TOP_TICKERS;
    }

    const query = trimmedQuery.toLowerCase();

    const matches = [];
    for (let i = 0; i < ALL_TICKERS.length; i++) {
      const item = ALL_TICKERS[i];
      const sym = item.displaySymbol ? item.displaySymbol.toLowerCase() : item.symbol.toLowerCase();
      const name = item.displayName ? item.displayName.toLowerCase() : item.name.toLowerCase();
      if (sym.includes(query) || name.includes(query)) {
        matches.push(item);
      }
    }

    // Sort by market cap (highest at top), always put non-stock securities above stocks
    matches.sort((a, b) => {
      if (!a.isStock && b.isStock) return -1;
      if (a.isStock && !b.isStock) return 1;

      const aSym = (a.displaySymbol || a.symbol).toLowerCase();
      const bSym = (b.displaySymbol || b.symbol).toLowerCase();
      const aName = (a.displayName || a.name).toLowerCase();
      const bName = (b.displayName || b.name).toLowerCase();

      // Exact symbol match
      if (aSym === query && bSym !== query) return -1;
      if (bSym === query && aSym !== query) return 1;

      // Exact name match
      if (aName === query && bName !== query) return -1;
      if (bName === query && aName !== query) return 1;

      // Prefix symbol match
      if (aSym.startsWith(query) && !bSym.startsWith(query)) return -1;
      if (bSym.startsWith(query) && !aSym.startsWith(query)) return 1;

      // Non-stocks sorted alphabetically by displaySymbol
      if (!a.isStock && !b.isStock) {
        return (a.displaySymbol || a.symbol).localeCompare(b.displaySymbol || b.symbol);
      }

      // Stocks sorted by marketCap highest to lowest
      return b.marketCap - a.marketCap;
    });

    // Limit to max 40 results
    const results = matches.slice(0, 40);

    // Append Finnhub matches that are not already present in the local list.
    const existingSymbols = new Set(results.map((item) => item.symbol.toUpperCase()));
    remoteResults.forEach((item) => {
      if (!existingSymbols.has(item.symbol.toUpperCase())) {
        results.push(item);
        existingSymbols.add(item.symbol.toUpperCase());
      }
    });

    return results.slice(0, 40);    // Once again limit to max 40 after appending from finnhub
  }, [searchQuery, remoteResults]);

  
  useEffect(() => {
    logoService.preloadLogos(filteredResults);
  }, [filteredResults]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    Keyboard.dismiss();
  }, []);

  const isSearching = searchQuery.trim().length > 0;
  const isRemoteSearchPending = isSearching && remoteSearchStatus === 'pending';

  return (
    <View style={[layoutStyles.flex1, containerStyle]}>
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
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          selectionColor={theme.primary}
          returnKeyType="search"
          clearButtonMode="never"
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

      {/* Non-Stock Securities header row */}
      {!isSearching && (
        <TouchableOpacity
          style={styles.nonStockHeaderButton}
          onPress={() => setNonStockModalVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open Non-Stock Securities"
        >
          <AppText bold style={[styles.sectionHeaderText, { color: theme.textSecondary }]}>
            NON-STOCK SECURITIES
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Section Header */}
      <View style={styles.sectionHeaderRow}>
        <AppText bold style={[styles.sectionHeaderText, { color: theme.textSecondary }]}>
          {isSearching
            ? isRemoteSearchPending
              ? 'SEARCHING...'
              : `RESULTS (${filteredResults.length})`
            : 'TOP STOCKS'}
        </AppText>
      </View>

      {/* Search Results List */}
      <FlatList
        data={filteredResults}
        keyExtractor={(item) => item.displaySymbol || item.symbol}
        renderItem={({ item }) => (
          <SearchResultItem
            item={{
              ...item,
              symbol: item.displaySymbol || item.symbol,
              name: item.displayName || item.name,
              logo: profiles[item.symbol]?.logo || null,
            }}
            onPress={() => onSelectStock && onSelectStock(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          isRemoteSearchPending && filteredResults.length > 0 ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isRemoteSearchPending ? (
            <View style={styles.loadingEmptyState}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : (
            <View style={[emptyStateStyles.container, styles.emptyState]}>
              <AppText
                style={[emptyStateStyles.subtitle, { color: theme.textSecondary }]}
              >
                No results matching that search term. Try searching for another ticker symbol, currency pair, or security name.
              </AppText>
            </View>
          )
        }
      />

      {/* Grouped Non-Stock Securities slide-up modal */}
      <NonStockSecuritiesModal
        visible={nonStockModalVisible}
        onSelectStock={onSelectStock}
        onClose={() => setNonStockModalVisible(false)}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 46,
    marginBottom: spacing.xs,
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
  nonStockHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 24,
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
  loadingFooter: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  loadingEmptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyState: {
    paddingVertical: spacing.xxl * 1.5,
  },
});
