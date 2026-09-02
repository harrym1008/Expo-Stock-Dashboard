import { Modal, View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../constants/theme';
import { modalStyles } from '../../styles';
import AppText from '../common/AppText';
import StockSearchView from '../search/StockSearchView';

// Full-screen search modal for adding a stock/security to a watchlist
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
      <View style={modalStyles.modalOverlay}>
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
                style={modalStyles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close search modal"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

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
  searchContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
