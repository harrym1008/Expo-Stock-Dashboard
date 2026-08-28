import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import AppText from '../common/AppText';
import StockSearchView from '../search/StockSearchView';

export default function SearchStockModal({
  visible,
  watchlistTitle = '',
  onSelectStock,
  onClose,
}) {
  const { theme } = useTheme();

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

        {/* Sheet Container */}
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
            {/* Header: Title and Close Button */}
            <View
              style={[
                styles.header,
                { borderBottomColor: theme.borderSubtle },
              ]}
            >
              <View style={styles.headerLeft}>
                <AppText bold style={styles.headerTitle}>
                  {watchlistTitle ? `Add to ${watchlistTitle}` : 'Add Stock'}
                </AppText>
                <AppText style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                  Search and select a stock to add it to this list
                </AppText>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close search modal"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Embedded Reusable Search View */}
            <StockSearchView
              onSelectStock={onSelectStock}
              autoFocus={true}
              containerStyle={styles.searchContainer}
            />
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
    height: 70,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
