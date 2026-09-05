import { Modal, View, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useWatchlist } from '../../context/WatchlistContext';
import { spacing, borderRadius } from '../../constants/theme';
import { modalStyles } from '../../styles';
import useSwipeDownToClose from '../../hooks/useSwipeDownToClose';
import AppText from '../common/AppText';
import CompanyLogo from '../common/CompanyLogo';

// Modal to toggle a stock's presence inside each watchlist
export default function AddToWatchlistModal({ visible, stock, onClose }) {
  const { theme, isDark } = useTheme();
  const { panHandlers, animatedStyle } = useSwipeDownToClose({ visible, onClose });
  const {
    watchlists,
    isStockInWatchlist,
    toggleStockInWatchlist,
  } = useWatchlist();

  if (!stock) return null;

  const displaySymbol = stock.displaySymbol || stock.symbol || '';
  const displayName = stock.displayName || stock.name || displaySymbol;

  // Theme-aware card colors
  const cardBg = isDark ? '#161920' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : theme.border;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <Animated.View style={[modalStyles.modalOverlay, animatedStyle]}>
        <TouchableOpacity
          style={modalStyles.topBackdropGap}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close modal"
        />

        <View
          style={[
            modalStyles.sheetContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <SafeAreaView
            style={[modalStyles.safeArea, { backgroundColor: theme.background }]}
            edges={['bottom', 'left', 'right']}
          >
            <View
              style={[
                modalStyles.header,
                { borderBottomColor: theme.borderSubtle },
              ]}
              {...panHandlers}
            >
              <View style={styles.headerLeft}>
                <CompanyLogo
                  symbol={displaySymbol}
                  logoUri={stock.logo}
                  size={38}
                />

                <View style={styles.titleInfo}>
                  <View style={styles.symbolRow}>
                    <AppText bold style={styles.symbolText}>
                      {displaySymbol}
                    </AppText>
                    <AppText
                      style={[styles.exchangeText, { color: theme.textSecondary }]}
                    >
                      {' - '}{stock.exchange || '...'}
                    </AppText>
                  </View>
                  <AppText
                    style={[styles.companyText, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {displayName}
                  </AppText>
                </View>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={[modalStyles.closeBtn, styles.closeBtn]}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={modalStyles.content}
            >
              <AppText
                bold
                style={[
                  modalStyles.sectionLabel,
                  styles.sectionLabel,
                  { color: theme.textSecondary },
                ]}
              >
                SELECT WATCHLISTS
              </AppText>

              <View
                style={[
                  styles.listCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                  },
                ]}
              >
                {watchlists.map((wl, index) => {
                  // For each watchlist, determine if the stock is already present and how many items are in the watchlist
                  const isChecked = isStockInWatchlist(wl.id, displaySymbol);
                  const itemCount = Array.isArray(wl.items) ? wl.items.length : 0;
                  const isLast = index === watchlists.length - 1;

                  return (
                    <TouchableOpacity
                      key={wl.id}
                      style={[
                        styles.watchlistRow,
                        !isLast && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : theme.borderSubtle,
                        },
                      ]}
                      onPress={() => toggleStockInWatchlist(wl.id, {
                        ...stock,
                        symbol: displaySymbol,
                        displaySymbol,
                        name: displayName,
                        displayName,
                      })}
                      activeOpacity={0.7}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isChecked }}
                      accessibilityLabel={`${wl.title}, ${isChecked ? 'selected' : 'not selected'}`}
                    >
                      <View style={styles.rowLeft}>
                        <AppText bold style={styles.rowTitle}>
                          {wl.title}
                        </AppText>
                        <AppText
                          style={[
                            styles.rowCount,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </AppText>
                      </View>

                      <View
                        style={[
                          styles.checkbox,
                          isChecked
                            ? {
                                backgroundColor: theme.primary,
                                borderColor: theme.primary,
                              }
                            : {
                                backgroundColor: isDark
                                  ? 'transparent'
                                  : '#FFFFFF',
                                borderColor: isDark
                                  ? 'rgba(255, 255, 255, 0.25)'
                                  : theme.border,
                              },
                        ]}
                      >
                        {isChecked && (
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color="#FFFFFF"
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  titleInfo: {
    flex: 1,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  symbolText: {
    fontSize: 20,
    letterSpacing: 0.3,
  },
  exchangeText: {
    fontSize: 12,
  },
  companyText: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    marginLeft: spacing.sm,
  },
  sectionLabel: {
    letterSpacing: 1.1,
    marginLeft: spacing.xs,
  },
  listCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  watchlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 58,
  },
  rowLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    letterSpacing: 0.2,
  },
  rowCount: {
    fontSize: 12,
    marginTop: 3,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
});
