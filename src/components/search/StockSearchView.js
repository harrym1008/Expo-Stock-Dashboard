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
import AppText from '../common/AppText';
import SearchResultItem from './SearchResultItem';
import searchTickersData from '../../constants/searchTickers.json';
import { logoService } from '../../services/logoService';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
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
  const { profiles } = useMarketData();

  const [searchQuery, setSearchQuery] = useState('');

  // Filter tickers by symbol or name and sort by market cap descending (max 25 results)
  const filteredResults = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return DEFAULT_TOP_TICKERS;
    }

    const query = trimmedQuery.toLowerCase();
    const exactSymbol = trimmedQuery.toUpperCase();

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

    // Append exact searched ticker at bottom if not already included in results
    const alreadyIncluded = results.some((item) => item.symbol === exactSymbol);
    if (!alreadyIncluded) {
      const existingItem = ALL_TICKERS.find((item) => item.symbol === exactSymbol);
      results.push(
        existingItem || {
          symbol: exactSymbol,
          name: exactSymbol,
          marketCap: 0,
        }
      );
    }

    return results;
  }, [searchQuery]);

  // Preload static logos in background for visible search results
  useEffect(() => {
    logoService.preloadLogos(filteredResults);
  }, [filteredResults]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    Keyboard.dismiss();
  }, []);

  const isSearching = searchQuery.trim().length > 0;

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
            onPress={() => onSelectStock && onSelectStock(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={[emptyStateStyles.container, styles.emptyState]}>
            <View
              style={[
                emptyStateStyles.iconContainer,
                { backgroundColor: theme.surfaceSubtle },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={32}
                color={theme.textMuted}
              />
            </View>
            <AppText bold style={emptyStateStyles.title}>
              No stocks found
            </AppText>
            <AppText
              style={[emptyStateStyles.subtitle, { color: theme.textSecondary }]}
            >
              No results matching "{searchQuery}". Try searching for another ticker symbol or company name.
            </AppText>
          </View>
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
  emptyState: {
    paddingVertical: spacing.xxl * 1.5,
  },
});
