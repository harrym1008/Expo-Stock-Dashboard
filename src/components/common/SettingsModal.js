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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { storageService } from '../../services/storageService';
import { finnhubWebSocketService } from '../../services/finnhubWebSocketService';
import { spacing, borderRadius } from '../../constants/theme';
import AppText from './AppText';

export default function SettingsModal({ visible, onClose }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { apiKey, updateApiKey } = useMarketData();
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
      'Clear Cache & Exit',
      'This will wipe all cached company profiles and downloaded logos (128MB max), stop all background data services, and close the application.\n\nDo you want to proceed?',
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

            // 2. Wipe the 128MB persistent LRU disk cache
            await storageService.clearCache();

            // 3. Inform the user and close the application
            Alert.alert(
              'Cache Cleared',
              'Offline cache has been successfully wiped and all background services have stopped. The application will now close.',
              [
                {
                  text: 'Close App',
                  onPress: () => {
                    if (Platform.OS === 'android') {
                      BackHandler.exitApp();
                    } else {
                      onClose();
                    }
                  },
                },
              ],
              { cancelable: false }
            );
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
      <View style={styles.modalOverlay}>
        {/* Top Gap - Tapping here dismisses the modal */}
        <TouchableOpacity
          style={styles.topBackdropGap}
          activeOpacity={1}
          onPress={onClose}
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
            {/* Header */}
            <View
              style={[
                styles.header,
                { borderBottomColor: theme.borderSubtle },
              ]}
            >
              <AppText bold style={styles.title}>Settings</AppText>

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close Settings"
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Ionicons name="close" size={24} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              {/* Appearance Section */}
              <AppText bold style={[styles.sectionLabel, { color: theme.textSecondary }]}>
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

              {/* Market Data API Configuration Section */}
              <AppText bold style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: spacing.xl }]}>
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
                    {isSaved ? 'API Key Saved ✓' : 'Save Key'}
                  </AppText>
                </TouchableOpacity>
              </View>

              {/* Persistent 128MB LRU Storage Section */}
              <AppText bold style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: spacing.xl }]}>
                OFFLINE LRU STORAGE (128MB MAX)
              </AppText>
              <View style={[styles.apiKeyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cacheHeaderRow}>
                  <View style={styles.apiKeyHeader}>
                    <Ionicons name="server-outline" size={18} color={theme.primary} />
                    <AppText bold style={styles.apiKeyTitle}>Cache Status</AppText>
                  </View>
                  <AppText style={[styles.cacheUsageText, { color: theme.textSecondary }]}>
                    {cacheStats.totalMB} MB / 128 MB ({cacheStats.itemCount} items)
                  </AppText>
                </View>
                <AppText style={[styles.apiKeyDesc, { color: theme.textSecondary }]}>
                  Stores 128x128 brand logos and company profiles with 30-day (1 month) TTL for 0ms offline rendering.
                </AppText>

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  topBackdropGap: {
    height: 72,
    width: '100%',
  },
  sheetContainer: {
    flex: 1,
    borderTopLeftRadius: borderRadius.md + 4,
    borderTopRightRadius: borderRadius.md + 4,
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
  title: {
    fontSize: 20,
  },
  closeBtn: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
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
  },
  textGroup: {
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
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  clearCacheText: {
    fontSize: 13,
  },
});
