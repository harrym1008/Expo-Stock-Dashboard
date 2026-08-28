import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInLeft,
  FadeOutLeft,
  FadeInRight,
  FadeOutRight,
  LinearTransition,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import AppText from '../common/AppText';

export default function WatchlistTabSelector({
  watchlists = [],
  activeWatchlistId,
  onSelectWatchlist,
  onAddWatchlist,
  isEditMode = false,
  onReorderWatchlists,
  onDeleteWatchlist,
  onRenameWatchlist,
}) {
  const { theme, isDark } = useTheme();

  const activeBg = isDark ? '#4A4A4A' : '#D0D5DD';
  const inactiveBg = isDark ? '#1C1F26' : '#E4E7EC';

  const handleDeleteWatchlist = () => {
    if (watchlists.length <= 1) return;

    const activeWl = watchlists.find((wl) => wl.id === activeWatchlistId);
    const title = activeWl?.title || 'this watchlist';

    Alert.alert(
      'Delete Watchlist',
      `Are you sure you want to delete "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDeleteWatchlist?.(activeWatchlistId),
        },
      ]
    );
  };

  const handleRenameWatchlist = () => {
    onRenameWatchlist?.(activeWatchlistId);
  };

  // Move pill up in order (swap with previous)
  const handleMoveUp = useCallback((index) => {
    if (index <= 0 || !onReorderWatchlists) return;
    const reordered = [...watchlists];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    onReorderWatchlists(reordered);
  }, [watchlists, onReorderWatchlists]);

  // Move pill down in order (swap with next)
  const handleMoveDown = useCallback((index) => {
    if (index >= watchlists.length - 1 || !onReorderWatchlists) return;
    const reordered = [...watchlists];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    onReorderWatchlists(reordered);
  }, [watchlists, onReorderWatchlists]);

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {watchlists.map((wl, index) => {
          const isActiveWl = wl.id === activeWatchlistId;
          const isFirst = index === 0;
          const isLast = index === watchlists.length - 1;

          return (
            <Animated.View
              key={wl.id}
              layout={LinearTransition.duration(200)}
              style={styles.pillWrapper}
            >
              {/* Left arrow — move earlier in order (edit mode only) */}
              {isEditMode && (
                <Animated.View
                  entering={FadeInLeft.duration(200)}
                  exiting={FadeOutLeft.duration(150)}
                  layout={LinearTransition.duration(200)}
                >
                  <TouchableOpacity
                    onPress={() => handleMoveUp(index)}
                    disabled={isFirst}
                    style={styles.arrowBtn}
                    activeOpacity={0.6}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={14}
                      color={isFirst ? 'transparent' : theme.textSecondary}
                    />
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* Pill Body */}
              <TouchableOpacity
                style={[
                  styles.tabItem,
                  {
                    backgroundColor: isActiveWl ? activeBg : inactiveBg,
                  },
                ]}
                onPress={() => onSelectWatchlist(wl.id)}
                activeOpacity={0.8}
              >
                <AppText
                  bold={isActiveWl}
                  style={[
                    styles.tabText,
                    {
                      color: isActiveWl ? theme.textPrimary : theme.textSecondary,
                    },
                  ]}
                >
                  {wl.title}
                </AppText>
              </TouchableOpacity>

              {/* Right arrow — move later in order (edit mode only) */}
              {isEditMode && (
                <Animated.View
                  entering={FadeInRight.duration(200)}
                  exiting={FadeOutRight.duration(150)}
                  layout={LinearTransition.duration(200)}
                >
                  <TouchableOpacity
                    onPress={() => handleMoveDown(index)}
                    disabled={isLast}
                    style={styles.arrowBtn}
                    activeOpacity={0.6}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={isLast ? 'transparent' : theme.textSecondary}
                    />
                  </TouchableOpacity>
                </Animated.View>
              )}
            </Animated.View>
          );
        })}

        {/* Edit mode action icons inline after pills */}
        {isEditMode && (
          <Animated.View
            entering={FadeInRight.duration(250)}
            exiting={FadeOutRight.duration(180)}
            layout={LinearTransition.duration(200)}
            style={styles.editActions}
          >
            {/* Bin: Delete active watchlist */}
            {watchlists.length > 1 && (
              <TouchableOpacity
                style={styles.editActionBtn}
                onPress={handleDeleteWatchlist}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Delete watchlist"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={20} color="#FF4D4F" />
              </TouchableOpacity>
            )}

            {/* Pencil: Rename active watchlist */}
            <TouchableOpacity
              style={styles.editActionBtn}
              onPress={handleRenameWatchlist}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Rename watchlist"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="create-outline" size={20} color={theme.textPrimary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Add Watchlist Plus Button */}
        <Animated.View layout={LinearTransition.duration(200)}>
          <TouchableOpacity
            key="add-btn"
            style={[styles.addBtn, { backgroundColor: inactiveBg }]}
            onPress={onAddWatchlist}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add new watchlist"
          >
            <Ionicons name="add" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
        </Animated.View>
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
  pillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowBtn: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    borderRadius: borderRadius.sm + 2,
    justifyContent: 'center',
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
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editActionBtn: {
    padding: spacing.xs,
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
