import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../constants/theme';
import { stockItemStyles } from '../../styles';
import AppText from '../common/AppText';
import CompanyLogo from '../common/CompanyLogo';

// Single search-result row: logo and symbol/name left, chevron right
export default function SearchResultItem({ item, onPress }) {
  const { theme } = useTheme();

  // Fall back gracefully when display fields are missing
  const displaySymbol = item?.displaySymbol || item?.symbol || '';
  const displayName = item?.displayName || item?.name || displaySymbol;

  return (
    <TouchableOpacity
      style={[
        stockItemStyles.itemContainer,
        {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.borderSubtle,
        },
      ]}
      onPress={onPress}
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
