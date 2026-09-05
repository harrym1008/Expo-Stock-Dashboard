import {Modal, View, StyleSheet, TouchableOpacity, SectionList, Animated} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../constants/theme';
import { modalStyles } from '../../styles';
import useSwipeDownToClose from '../../hooks/useSwipeDownToClose';
import AppText from '../common/AppText';
import SearchResultItem from './SearchResultItem';
import { getGroupedNonStockSecurities } from '../../utils/securityUtils';

// load the grouped non-stock securities data once at startup
const GROUPED_NON_STOCK_DATA = getGroupedNonStockSecurities();

// Slide-up modal listing non-stock securities grouped by category accessed in the search page
export default function NonStockSecuritiesModal({
  visible,
  onSelectStock,
  onClose,
}) {
  const { theme } = useTheme();
  const { panHandlers, animatedStyle } = useSwipeDownToClose({ visible, onClose });

  if (!visible) return null;

  // Close then hand the selected security back to caller
  const handleSelect = (item) => {
    if (onClose) onClose();
    if (onSelectStock) onSelectStock(item);
  };

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
                <AppText bold style={styles.headerTitle}>
                  Non-Stock Securities
                </AppText>
                <AppText style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                  Browse forex, indices, commodities, bonds & crypto
                </AppText>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={modalStyles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close non-stock securities modal"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Grouped SectionList: renders all 60 items at once without pagination/batching delay */}
            <SectionList
              sections={GROUPED_NON_STOCK_DATA}
              keyExtractor={(item) => item.displaySymbol}
              initialNumToRender={100}
              maxToRenderPerBatch={100}
              windowSize={10}
              removeClippedSubviews={false}
              renderSectionHeader={({ section: { title, data } }) => (
                <View
                  style={[
                    styles.sectionHeaderRow,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <AppText
                    bold
                    style={[styles.sectionHeaderText, { color: theme.textSecondary }]}
                  >
                    {title} ({data.length})
                  </AppText>
                </View>
              )}
              renderItem={({ item }) => (
                <SearchResultItem
                  item={{
                    ...item,
                    symbol: item.displaySymbol,
                    name: item.displayName,
                    logo: null,
                  }}
                  onPress={() => handleSelect(item)}
                />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              stickySectionHeadersEnabled={false}
            />
          </SafeAreaView>
        </View>
      </Animated.View>
    </Modal>
  );
}

// Modal layout: header, section headers, list padding
const styles = StyleSheet.create({
  headerLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionHeaderRow: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  sectionHeaderText: {
    fontSize: 12,
    letterSpacing: 0.8,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
