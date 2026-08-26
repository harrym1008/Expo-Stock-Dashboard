import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../constants/theme';
import AppText from './AppText';
import SettingsModal from './SettingsModal';

export default function ScreenContainer({
  title,
  children,
  scrollable = false,
  showSettingsButton = false,
}) {
  const { theme } = useTheme();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const content = (
    <View style={styles.content}>
      <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
        <AppText bold style={styles.title}>
          {title}
        </AppText>

        {showSettingsButton && (
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => setSettingsVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>{children}</View>

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'left', 'right']}
    >
      {scrollable ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    marginBottom: spacing.md,
  },
  title: {
    marginTop: 2,
    fontSize: 24,
    letterSpacing: 0.9,
  },
  settingsBtn: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
});
