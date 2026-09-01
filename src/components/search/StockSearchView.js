import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../common/AppText';
import SearchResultItem from './SearchResultItem';
import searchTickersData from '../../constants/searchTickers.json';
import { logoService } from '../../services/logoService';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { finnhubRestService } from '../../services/finnhubRestService';
import { spacing, borderRadius, fonts } from '../../constants/theme';
import { layoutStyles, emptyStateStyles } from '../../styles';

// Module-level memoized ticker entries
const ALL_TICKERS = Object.entries(searchTickersData).map(([symbol, item]) => ({
  symbol: symbol.toUpperCase(),
  name: item?.name || symbol,
  marketCap: typeof item?.marketCap === 'number' ? item.marketCap : 0,
}));

// Pre-sorted top 25 tickers by market cap for default view
const DEFAULT_TOP_TICKERS = [...ALL_TICKERS]
  .sort((a, b) => b.marketCap - a.marketCap)
  .slice(0, 25);

export default function StockSearchView({
  onSelectStock,
  autoFocus = false,
  placeholder = 'Search by ticker or company name...',
  containerStyle,
}) {
  const { theme } = useTheme();
  const { profiles, apiKey } = useMarketData();

  const [searchQuery, setSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState([]);
  const [remoteSearchStatus, setRemoteSearchStatus] = useState('idle');

  // Search Finnhub only after the user has stopped typing for one second.
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    let isCurrentSearch = true;

    if (!trimmedQuery || !apiKey) {
      setRemoteResults([]);
      setRemoteSearchStatus('idle');
      return undefined;
    }

    // Do not show results from a previous query while waiting for this query.
    setRemoteResults([]);
    setRemoteSearchStatus('pending');

    const timeoutId = setTimeout(async () => {
      if (!isCurrentSearch) return;

      let results = [];
      try {
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
          name: item.name || item.displaySymbol || item.symbol,
          marketCap: 0,
        }));

      setRemoteResults(normalizedResults);
      setRemoteSearchStatus(normalizedResults.length > 0 ? 'success' : 'empty');
    }, 1000);

    return () => {
      isCurrentSearch = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, apiKey]);

  // Filter tickers by symbol or name and sort by market cap descending (max 25 results)
  const filteredResults = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return DEFAULT_TOP_TICKERS;
    }

    const query = trimmedQuery.toLowerCase();

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
    const results = matches.slice(0, 25);

    // Append Finnhub matches that are not already present in the local list.
    const existingSymbols = new Set(results.map((item) => item.symbol));
    remoteResults.forEach((item) => {
      if (!existingSymbols.has(item.symbol)) {
        results.push(item);
        existingSymbols.add(item.symbol);
      }
    });

    return results;
  }, [searchQuery, remoteResults]);

  // Preload static logos in background for visible search results
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
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }) => (
          <SearchResultItem
            item={{
              ...item,
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
                No results matching that search term. Try searching for another ticker symbol or company name.
              </AppText>
            </View>
          )
        }
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
