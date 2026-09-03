import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../constants/theme';
import { stockItemStyles } from '../../styles';
import AppText from '../common/AppText';
import CompanyLogo from '../common/CompanyLogo';

// Single search-result row: logo and symbol/name left, chevron right
function SearchResultItem({ item, onPress, onSelectStock }) {
  const { theme } = useTheme();

  // Fall back gracefully when display fields are missing
  const displaySymbol = item?.displaySymbol || item?.symbol || '';
  const displayName = item?.displayName || item?.name || displaySymbol;

  const handlePress = useCallback(() => {
    if (onSelectStock) {
      onSelectStock(item);
    } else if (onPress) {
      onPress(item);
    }
  }, [onSelectStock, onPress, item]);

  return (
    <TouchableOpacity
      style={[
        stockItemStyles.itemContainer,
        {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.borderSubtle,
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityLabel={`Select ${displaySymbol}, ${displayName}`}
    >
      <View style={styles.leftSection}>
        <CompanyLogo
          symbol={displaySymbol}
          logoUri={item?.logo}
          size={36}
        />

        <View style={styles.textWrapper}>
          <AppText bold style={stockItemStyles.symbolText}>
            {displaySymbol}
          </AppText>
          <AppText
            style={[stockItemStyles.nameText, styles.nameText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {displayName}
          </AppText>
        </View>
      </View>

      <View style={styles.rightSection}>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.textMuted}
        />
      </View>
    </TouchableOpacity>
  );
}

function areEqual(prevProps, nextProps) {
  if (prevProps.onSelectStock !== nextProps.onSelectStock) return false;
  if (prevProps.onPress !== nextProps.onPress) return false;
  const prev = prevProps.item;
  const next = nextProps.item;
  if (prev === next) return true;
  if (!prev || !next) return false;
  return (
    prev.symbol === next.symbol &&
    prev.displaySymbol === next.displaySymbol &&
    prev.name === next.name &&
    prev.displayName === next.displayName &&
    prev.logo === next.logo
  );
}

const styles = StyleSheet.create({
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    paddingRight: spacing.sm,
  },
  textWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  nameText: {
    letterSpacing: -0.2,
  },
  rightSection: {
    paddingLeft: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(SearchResultItem, areEqual);
