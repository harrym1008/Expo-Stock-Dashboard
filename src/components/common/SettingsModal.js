import React from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import AppText from './AppText';

export default function SettingsModal({ visible, onClose }) {
  const { theme, isDark, toggleTheme } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={styles.container}>
          <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
            <AppText bold style={styles.title}>Settings</AppText>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close Settings"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
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
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginTop: spacing.xl,
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
});
