import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import AppText from '../common/AppText';

export default function WatchlistTabSelector({
  watchlists = [],
  activeWatchlistId,
  onSelectWatchlist,
  onAddWatchlist,
}) {
  const { theme, isDark } = useTheme();

  const activeBg = isDark ? '#4A4A4A' : '#D0D5DD';
  const inactiveBg = isDark ? '#1C1F26' : '#E4E7EC';

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {watchlists.map((wl) => {
          const isActive = wl.id === activeWatchlistId;
          return (
            <TouchableOpacity
              key={wl.id}
              style={[
                styles.tabItem,
                {
                  backgroundColor: isActive ? activeBg : inactiveBg,
                },
              ]}
              onPress={() => onSelectWatchlist(wl.id)}
              activeOpacity={0.8}
            >
              <AppText
                bold={isActive}
                style={[
                  styles.tabText,
                  {
                    color: isActive
                      ? theme.textPrimary
                      : theme.textSecondary,
                  },
                ]}
              >
                {wl.title}
              </AppText>
            </TouchableOpacity>
          );
        })}

        {/* Add Watchlist Plus Button */}
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: inactiveBg }]}
          onPress={onAddWatchlist}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add new watchlist"
        >
          <Ionicons name="add" size={20} color={theme.textPrimary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Left Gradient Fade */}
      <LinearGradient
        colors={[theme.background, 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.leftGradient}
        pointerEvents="none"
      />

      {/* Right Gradient Fade */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', theme.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.rightGradient}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginVertical: spacing.sm,
    marginHorizontal: -spacing.lg,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  tabItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    borderRadius: borderRadius.sm + 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftGradient: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
    zIndex: 10,
  },
  rightGradient: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
    zIndex: 10,
  },
});
