import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/common/ScreenContainer';
import AppText from '../components/common/AppText';
import { useTheme } from '../context/ThemeContext';
import { useTrading } from '../context/TradingContext';
import { spacing, borderRadius } from '../constants/theme';
import { layoutStyles } from '../styles';

export default function PortfolioScreen() {
  const { theme } = useTheme();
  const { isPaperTradingEnabled, setIsPaperTradingEnabled } = useTrading();

  return (
    <ScreenContainer title="Portfolio" showSettingsButton={true}>
      <View style={layoutStyles.flex1}>
        {!isPaperTradingEnabled ? (
          <View style={styles.container}>

            <AppText bold style={styles.title}>
              Simulated Paper Trading
            </AppText>

            <AppText style={[styles.description, { color: theme.textSecondary }]}>
              Simulated Paper Trading is currently turned off. Activate it in settings to trade with virtual 
            </AppText>

            <TouchableOpacity
              style={[styles.activateButton, { backgroundColor: theme.primary }]}
              onPress={() => setIsPaperTradingEnabled(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Activate Simulated Paper Trading"
            >
              <AppText bold style={styles.activateButtonText}>
                Activate Paper Trading
              </AppText>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  activateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.sm,
    minWidth: 200,
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
});


