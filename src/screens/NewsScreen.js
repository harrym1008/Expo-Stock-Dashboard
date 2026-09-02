import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/common/ScreenContainer';
import AppText from '../components/common/AppText';
import NewsCard from '../components/common/NewsCard';
import { useTheme } from '../context/ThemeContext';
import { useMarketData } from '../context/MarketDataContext';
import { spacing } from '../constants/theme';
import { layoutStyles, emptyStateStyles, newsStyles } from '../styles';

export default function NewsScreen() {
  const { theme, isDark } = useTheme();
  const { fetchMarketNews, apiKey, hasValidKey } = useMarketData();

  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNews = useCallback(async () => {
    setIsLoading(true);
    try {
      const articles = await fetchMarketNews('general');
      if (Array.isArray(articles)) {
        setNews(articles);
      }
    } catch (err) {
      console.log('[NewsScreen] Error loading market news:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchMarketNews]);

  useEffect(() => {
    loadNews();
  }, [loadNews, apiKey]);

  return (
    <ScreenContainer title="News">
      <View style={layoutStyles.flex1}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <FlatList
            data={news}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <NewsCard item={item} />}
            contentContainerStyle={[newsStyles.newsList, styles.listPadding]}
            showsVerticalScrollIndicator={true}
            indicatorStyle={isDark ? 'white' : 'black'}
            persistentScrollbar={true}
            ListEmptyComponent={
              <View style={[emptyStateStyles.container, styles.emptyState]}>
                <View
                  style={[
                    emptyStateStyles.iconContainer,
                    { backgroundColor: theme.surfaceSubtle },
                  ]}
                >
                  <Ionicons
                    name="newspaper-outline"
                    size={32}
                    color={theme.textMuted}
                  />
                </View>
                <AppText bold style={emptyStateStyles.title}>
                  {!hasValidKey ? 'API Key Required' : 'No Market News Available'}
                </AppText>
                <AppText
                  style={[emptyStateStyles.subtitle, { color: theme.textSecondary }]}
                >
                  {!hasValidKey
                    ? 'Please configure your Finnhub API key in Settings to view market news.'
                    : 'Check back later for the latest news stories.'}
                </AppText>
              </View>
            }
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listPadding: {
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyState: {
    paddingVertical: spacing.xxl * 1.5,
  },
});

