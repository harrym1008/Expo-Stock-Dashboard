import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../constants/theme';
import { stockItemStyles } from '../../styles';
import AppText from '../common/AppText';
import CompanyLogo from '../common/CompanyLogo';

export default function SearchResultItem({ item, onPress }) {
  const { theme } = useTheme();

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
      accessibilityLabel={`Select ${item.symbol}, ${item.name}`}
    >
      {/* Left: Cached Static Logo & Info */}
      <View style={styles.leftSection}>
        <CompanyLogo
          symbol={item.symbol}
          logoUri={item.logo}
          size={36}
        />

        <View style={styles.textWrapper}>
          <AppText bold style={stockItemStyles.symbolText}>
            {item.symbol}
          </AppText>
          <AppText
            style={[stockItemStyles.nameText, styles.nameText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {item.name}
          </AppText>
        </View>
      </View>

      {/* Right: Chevron Arrow */}
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

