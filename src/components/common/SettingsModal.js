import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Switch,
  TextInput,
  ScrollView,
  Alert,
  BackHandler,
  Platform,
} from 'react-native';
import * as Updates from 'expo-updates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { useTrading } from '../../context/TradingContext';
import { storageService } from '../../services/storageService';
import { finnhubWebSocketService } from '../../services/finnhubWebSocketService';
import { spacing, borderRadius } from '../../constants/theme';
import { modalStyles } from '../../styles';
import AppText from './AppText';

export default function SettingsModal({ visible, onClose }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { apiKey, updateApiKey } = useMarketData();
  const { isPaperTradingEnabled, setIsPaperTradingEnabled } = useTrading();
  const [inputKey, setInputKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [cacheStats, setCacheStats] = useState({ totalMB: '0.00', itemCount: 0 });

  const loadStats = () => {
    storageService.getCacheStats().then(setCacheStats);
  };

  useEffect(() => {
    if (visible) {
      setInputKey(apiKey || '');
      setIsSaved(false);
      loadStats();
    }
  }, [visible, apiKey]);

  const handleSaveKey = async () => {
    await updateApiKey(inputKey.trim());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache & Restart',
      'This will wipe the offline cache and restart the application.\n\nDo you want to proceed?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear & Close',
          style: 'destructive',
          onPress: async () => {
            // 1. Stop all WebSocket & background services
            finnhubWebSocketService.destroy();

            // 2. Wipe the single 50MB persistent LRU cache file
            await storageService.clearCache();

            // 3. Reload the app
            await Updates.reloadAsync(); 
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={modalStyles.modalOverlayLight}>
        {/* Top Gap - Tapping here dismisses the modal */}
        <TouchableOpacity
          style={modalStyles.topBackdropGap}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Sheet Container */}
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
            {/* Header */}
            <View
              style={[
                modalStyles.header,
                { borderBottomColor: theme.borderSubtle },
              ]}
            >
              <AppText bold style={styles.title}>Settings</AppText>

              <TouchableOpacity
                onPress={onClose}
                style={modalStyles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close Settings"
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Ionicons name="close" size={24} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={modalStyles.content}>
              {/* Appearance Section */}
              <AppText bold style={[modalStyles.sectionLabel, { color: theme.textSecondary }]}>
                APPEARANCE
              </AppText>
              <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.rowLeft}>
                  <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={theme.primary} />
                  <View style={styles.textGroup}>
                    <AppText bold style={styles.rowTitle}>Dark Mode</AppText>
                    <AppText style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                      {isDark ? 'Dark Mode' : 'Light Mode'} is currently enabled
                    </AppText>
                  </View>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: '#D4D4D4', true: 'rgba(0, 163, 255, 0.3)' }}
                  thumbColor={isDark ? theme.primary : '#5C6A7E'}
                />
              </View>

              {/* Simulated Paper Trading Section */}
              <AppText bold style={[modalStyles.sectionLabel, { color: theme.textSecondary, marginTop: spacing.xl }]}>
                SIMULATED TRADING
              </AppText>
              <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.rowLeft}>
                  <Ionicons name="trending-up-outline" size={20} color={theme.primary} />
                  <View style={styles.textGroup}>
                    <AppText bold style={styles.rowTitle}>Simulated Paper Trading</AppText>
                    <AppText style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                      {isPaperTradingEnabled ? 'Simulated trading is enabled' : 'Practice trading with virtual funds'}
                    </AppText>
                  </View>
                </View>
                <Switch
                  value={isPaperTradingEnabled}
                  onValueChange={setIsPaperTradingEnabled}
                  trackColor={{ false: '#D4D4D4', true: 'rgba(0, 163, 255, 0.3)' }}
                  thumbColor={isPaperTradingEnabled ? theme.primary : '#5C6A7E'}
                />
              </View>

              {/* Market Data API Configuration Section */}
              <AppText bold style={[modalStyles.sectionLabel, { color: theme.textSecondary, marginTop: spacing.xl }]}>
                FINNHUB API CONFIGURATION
              </AppText>
              <View style={[styles.apiKeyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.apiKeyHeader}>
                  <Ionicons name="key-outline" size={18} color={theme.primary} />
                  <AppText bold style={styles.apiKeyTitle}>Finnhub API Key</AppText>
                </View>
                <AppText style={[styles.apiKeyDesc, { color: theme.textSecondary }]}>
                  Used for real-time WebSocket ticks, company profiles, and logos.
                </AppText>

                <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <TextInput
                    style={[styles.input, { color: theme.textPrimary }]}
                    placeholder="Enter your Finnhub API Key"
                    placeholderTextColor={theme.textMuted}
                    value={inputKey}
                    onChangeText={setInputKey}
                    secureTextEntry={!showKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowKey((prev) => !prev)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showKey ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={theme.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: isSaved ? '#00D084' : theme.primary }]}
                  onPress={handleSaveKey}
                  activeOpacity={0.8}
                >
                  <AppText bold style={styles.saveBtnText}>
                    {isSaved ? 'API Key Saved' : 'Save Key'}
                  </AppText>
                </TouchableOpacity>
              </View>

              {/* Persistent cache section */}
              <AppText
                bold
                style={[modalStyles.sectionLabel, { color: theme.textSecondary, marginTop: spacing.xl }]}
              >
                OFFLINE CACHE
              </AppText>
              <View style={[styles.apiKeyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cacheHeaderRow}>
                  <View style={styles.apiKeyHeader}>
                    <Ionicons name="server-outline" size={18} color={theme.primary} />
                    <AppText bold style={styles.apiKeyTitle}>Cache Status</AppText>
                  </View>
                  <AppText style={[styles.cacheUsageText, { color: theme.textSecondary }]}>
                    {cacheStats.totalMB} MB / 50 MB ({cacheStats.itemCount} items)
                  </AppText>
                </View>

                <TouchableOpacity
                  style={[styles.clearCacheBtn, { borderColor: '#FF4D4F', backgroundColor: theme.background }]}
                  onPress={handleClearCache}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={16} color="#FF4D4F" />
                  <AppText style={[styles.clearCacheText, { color: '#FF4D4F' }]}>
                    Clear Cache & Exit
                  </AppText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    marginRight: spacing.sm,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
  },
  rowSubtitle: {
    fontSize: 12,
  },
  apiKeyCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  apiKeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  apiKeyTitle: {
    fontSize: 15,
  },
  apiKeyDesc: {
    fontSize: 12,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    height: 42,
    fontSize: 14,
  },
  eyeBtn: {
    padding: spacing.xs,
  },
  saveBtn: {
    paddingVertical: spacing.md - 2,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  cacheHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cacheUsageText: {
    fontSize: 12,
  },
  clearCacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1
  },
  clearCacheText: {
    fontSize: 13,
  },
});

