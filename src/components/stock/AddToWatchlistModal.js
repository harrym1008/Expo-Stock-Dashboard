import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useWatchlist } from '../../context/WatchlistContext';
import { spacing, borderRadius } from '../../constants/theme';
import AppText from '../common/AppText';
import CompanyLogo from '../common/CompanyLogo';

export default function AddToWatchlistModal({ visible, stock, onClose }) {
  const { theme, isDark } = useTheme();
  const {
    watchlists,
    isStockInWatchlist,
    toggleStockInWatchlist,
  } = useWatchlist();

  if (!stock) return null;

  const cardBg = isDark ? '#161920' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : theme.border;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Top Gap - Tap to dismiss */}
        <TouchableOpacity
          style={styles.topBackdropGap}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close modal"
        />

        {/* Bottom Sheet Container */}
        <View
          style={[
            styles.sheetContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <SafeAreaView
            style={[styles.safeArea, { backgroundColor: theme.background }]}
            edges={['bottom', 'left', 'right']}
          >
            {/* Header: Matches StockDetailModal layout with Logo, Ticker, Exchange & Company Name */}
            <View
              style={[
                styles.header,
                { borderBottomColor: theme.borderSubtle },
              ]}
            >
              <View style={styles.headerLeft}>
                <CompanyLogo
                  symbol={stock.symbol}
                  logoUri={stock.logo}
                  size={38}
                />

                <View style={styles.titleInfo}>
                  <View style={styles.symbolRow}>
                    <AppText bold style={styles.symbolText}>
                      {stock.symbol}
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
                    {stock.name}
                  </AppText>
                </View>
              </View>

              {/* Close Button: Cross icon matching other modals */}
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Vertical List of All Wishlists */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <AppText
                bold
                style={[
                  styles.sectionLabel,
                  { color: theme.textSecondary },
                ]}
              >
                SELECT WISHLISTS
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
                  const isChecked = isStockInWatchlist(wl.id, stock.symbol);
                  const itemCount = Array.isArray(wl.items) ? wl.items.length : 0;
                  const isLast = index === watchlists.length - 1;

                  return (
                    <TouchableOpacity
                      key={wl.id}
                      style={[
                        styles.wishlistRow,
                        !isLast && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : theme.borderSubtle,
                        },
                      ]}
                      onPress={() => toggleStockInWatchlist(wl.id, stock)}
                      activeOpacity={0.7}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isChecked }}
                      accessibilityLabel={`${wl.title}, ${isChecked ? 'selected' : 'not selected'}`}
                    >
                      {/* Left: Wishlist Title & Stock Count */}
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
                          {itemCount} {itemCount === 1 ? 'stock' : 'stocks'}
                        </AppText>
                      </View>

                      {/* Right: Checkbox */}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  topBackdropGap: {
    height: 120,
    width: '100%',
  },
  sheetContainer: {
    flex: 1,
    borderTopLeftRadius: borderRadius.md + 6,
    borderTopRightRadius: borderRadius.md + 6,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
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
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  content: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.1,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  listCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  wishlistRow: {
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
