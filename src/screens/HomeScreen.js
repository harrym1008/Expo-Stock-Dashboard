import React, { useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';
import WatchlistTabSelector from '../components/home/WatchlistTabSelector';
import WatchlistItem from '../components/home/WatchlistItem';
import AppText from '../components/common/AppText';
import { mockWatchlists } from '../constants/mockData';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../constants/theme';

export default function HomeScreen() {
  const { theme } = useTheme();
  const [watchlists, setWatchlists] = useState(mockWatchlists);
  const [activeWatchlistId, setActiveWatchlistId] = useState(
    mockWatchlists[0]?.id || 'watchlist-1'
  );

  const activeWatchlist =
    watchlists.find((wl) => wl.id === activeWatchlistId) || watchlists[0];

  const handleAddWatchlist = () => {
    const newId = `watchlist-${watchlists.length + 1}`;
    const newWatchlist = {
      id: newId,
      title: `${watchlists.length + 1}th watchlist`,
      items: [
        {
          id: `stock-${Date.now()}`,
          symbol: 'AMZN',
          name: 'Amazon.com, Inc.',
          price: 182.40,
          changePercent: 0.94,
          change: 1.70,
          currency: '$',
          logoBg: '#FF9900',
          sparkline: [179, 180, 181.5, 180.8, 182, 181.2, 182.40],
        },
      ],
    };
    setWatchlists((prev) => [...prev, newWatchlist]);
    setActiveWatchlistId(newId);
  };

  return (
    <ScreenContainer title="Home" showSettingsButton={true}>
      <View style={styles.container}>
        {/* Watchlist Horizontal Drag Selector with Gradient Fades */}
        <WatchlistTabSelector
          watchlists={watchlists}
          activeWatchlistId={activeWatchlistId}
          onSelectWatchlist={setActiveWatchlistId}
          onAddWatchlist={handleAddWatchlist}
        />

        {/* Stock Items List */}
        <FlatList
          data={activeWatchlist?.items || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WatchlistItem
              item={item}
              onPress={() => {
                // Navigate to stock details or perform action
              }}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <AppText style={[styles.emptyText, { color: theme.textSecondary }]}>
                No stocks in this watchlist yet.
              </AppText>
            </View>
          }
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
});
