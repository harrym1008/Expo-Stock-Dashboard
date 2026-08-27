import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useMarketData } from '../../context/MarketDataContext';
import { spacing, borderRadius } from '../../constants/theme';
import { getNextUpcomingHolidays } from '../../utils/marketHolidays';
import AppText from './AppText';

export default function MarketCalendarModal({ visible, onClose }) {
  const { theme, isDark } = useTheme();
  const { marketStatus } = useMarketData();

  // Live ticking clock for New York Time
  const [nyTimeStr, setNyTimeStr] = useState('');
  const [nyDateStr, setNyDateStr] = useState('');

  useEffect(() => {
    if (!visible) return;

    const updateClock = () => {
      const now = new Date();
      const timeFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      const dateFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      setNyTimeStr(timeFmt.format(now));
      setNyDateStr(dateFmt.format(now));
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  // Retrieve strictly the next 8 upcoming US exchange holidays
  const upcomingHolidays = useMemo(() => {
    if (!visible) return [];
    return getNextUpcomingHolidays(8);
  }, [visible]);

  const cardBg = isDark ? '#161920' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : theme.border;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Top Gap - Tap to dismiss */}
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
              <View>
                <AppText bold style={styles.title}>
                  Market Calendar
                </AppText>
                <AppText style={[styles.subtitle, { color: theme.textSecondary }]}>
                  NYSE & NASDAQ
                </AppText>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close Calendar"
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Ionicons name="close" size={24} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              {/* 1. Live Clock & Current Session Card */}
              <View
                style={[
                  styles.liveClockCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                  },
                ]}
              >
                <View style={styles.liveClockTopRow}>
                  <View style={styles.liveClockLeftGroup}>
                    <Ionicons name="time-outline" size={18} color={theme.primary} />
                    <AppText bold style={styles.liveClockTime}>
                      {nyTimeStr || '10:09:16 AM ET'}
                    </AppText>
                  </View>
                  <AppText style={[styles.liveClockDate, { color: theme.textSecondary }]}>
                    {nyDateStr || 'Thu, Aug 27, 2026'}
                  </AppText>
                </View>

                {/* Active Session Badge */}
                <View
                  style={[
                    styles.activeSessionBadge,
                    {
                      backgroundColor: isDark ? 'rgba(0, 208, 132, 0.12)' : 'rgba(0, 208, 132, 0.08)',
                      borderColor: marketStatus.color,
                    },
                  ]}
                >
                  <View style={[styles.activeStatusDot, { backgroundColor: marketStatus.color }]} />
                  <AppText bold style={[styles.activeStatusText, { color: marketStatus.color }]}>
                    {marketStatus.label}
                    {marketStatus.sublabel ? ` (${marketStatus.sublabel})` : ''}
                  </AppText>
                </View>
              </View>

              {/* 2. Standard Market Sessions */}
              <AppText bold style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                STANDARD MARKET SESSIONS
              </AppText>

              <View
                style={[
                  styles.standardSessionsCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                  },
                ]}
              >
                <AppText bold style={styles.daysHeader}>
                  Monday – Friday:
                </AppText>

                {/* Session Rows with colored bullet points */}
                <View style={styles.sessionItemRow}>
                  <View style={styles.sessionLeftCol}>
                    <View style={[styles.sessionBulletDot, { backgroundColor: '#FF9500' }]} />
                    <AppText bold style={[styles.sessionItemName, { color: '#FF9500' }]}>
                      Pre-Market
                    </AppText>
                  </View>
                  <AppText bold style={styles.sessionItemTime}>
                    04:00 - 09:30 ET
                  </AppText>
                </View>

                <View style={styles.sessionItemRow}>
                  <View style={styles.sessionLeftCol}>
                    <View style={[styles.sessionBulletDot, { backgroundColor: '#00D084' }]} />
                    <AppText bold style={[styles.sessionItemName, { color: '#00D084' }]}>
                      Market Open
                    </AppText>
                  </View>
                  <AppText bold style={styles.sessionItemTime}>
                    09:30 - 16:00 ET
                  </AppText>
                </View>

                <View style={styles.sessionItemRow}>
                  <View style={styles.sessionLeftCol}>
                    <View style={[styles.sessionBulletDot, { backgroundColor: '#D946EF' }]} />
                    <AppText bold style={[styles.sessionItemName, { color: '#D946EF' }]}>
                      After-Hours
                    </AppText>
                  </View>
                  <AppText bold style={styles.sessionItemTime}>
                    16:00 - 20:00 ET
                  </AppText>
                </View>

                <View style={styles.sessionItemRow}>
                  <View style={styles.sessionLeftCol}>
                    <View style={[styles.sessionBulletDot, { backgroundColor: '#00A3FF' }]} />
                    <AppText bold style={[styles.sessionItemName, { color: '#00A3FF' }]}>
                      Overnight (Closed)
                    </AppText>
                  </View>
                  <AppText bold style={styles.sessionItemTime}>
                    20:00 - 04:00 ET
                  </AppText>
                </View>

                {/* Weekend row */}
                <View style={styles.weekendRow}>
                  <AppText style={[styles.weekendLabel, { color: theme.textSecondary }]}>
                    Saturday & Sunday:{' '}
                    <AppText bold style={{ color: theme.textPrimary }}>
                      Closed
                    </AppText>
                  </AppText>
                </View>
              </View>

              {/* 3. Upcoming Market Holidays */}
              <AppText
                bold
                style={[
                  styles.sectionLabel,
                  { color: theme.textSecondary, marginTop: spacing.lg },
                ]}
              >
                UPCOMING MARKET HOLIDAYS
              </AppText>

              {upcomingHolidays.map((hol) => {
                const [y, m, d] = hol.atDate.split('-').map(Number);
                const dt = new Date(y, m - 1, d);
                const dateFormatted = new Intl.DateTimeFormat('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }).format(dt);

                const isFullyClosed = hol.isFullyClosed;

                // Format early close time e.g. 13:00
                const closeTime = hol.regularHours?.end
                  ? `${Math.floor(hol.regularHours.end / 3600)}:${String(Math.floor((hol.regularHours.end % 3600) / 60)).padStart(2, '0')}`
                  : '13:00';

                // Format post-market close time e.g. 17:00
                const postCloseTime = hol.postMarketHours?.end
                  ? `${Math.floor(hol.postMarketHours.end / 3600)}:${String(Math.floor((hol.postMarketHours.end % 3600) / 60)).padStart(2, '0')}`
                  : '17:00';

                return (
                  <View
                    key={hol.atDate}
                    style={[
                      styles.holidayCard,
                      {
                        backgroundColor: cardBg,
                        borderColor: cardBorder,
                      },
                    ]}
                  >
                    <View style={styles.holidayLeftCol}>
                      <AppText bold style={styles.holidayEventTitle}>
                        {hol.eventName}
                      </AppText>
                      <AppText style={[styles.holidayDateSub, { color: theme.textSecondary }]}>
                        {dateFormatted}
                      </AppText>
                    </View>

                    {isFullyClosed ? (
                      <View style={styles.closedPill}>
                        <AppText bold style={styles.closedPillText}>
                          Closed All Day
                        </AppText>
                      </View>
                    ) : (
                      <View style={styles.earlyClosePill}>
                        <AppText bold style={styles.earlyClosePillTitle}>
                          Early Close at {closeTime}
                        </AppText>
                        <AppText style={styles.earlyClosePillSub}>
                          Post-Market closes at {postCloseTime}
                        </AppText>
                      </View>
                    )}
                  </View>
                );
              })}
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  topBackdropGap: {
    height: 60,
    width: '100%',
  },
  sheetContainer: {
    flex: 1,
    borderTopLeftRadius: borderRadius.md + 6,
    borderTopRightRadius: borderRadius.md + 6,
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
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  liveClockCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  liveClockTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  liveClockLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveClockTime: {
    fontSize: 17,
    letterSpacing: 0.2,
  },
  liveClockDate: {
    fontSize: 13,
  },
  activeSessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  activeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeStatusText: {
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  standardSessionsCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  daysHeader: {
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  sessionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sessionLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionBulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sessionItemName: {
    fontSize: 14,
  },
  sessionItemTime: {
    fontSize: 14,
  },
  weekendRow: {
    marginTop: spacing.sm + 2,
    paddingTop: spacing.xs,
  },
  weekendLabel: {
    fontSize: 13,
  },
  holidayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.sm + 4,
    borderWidth: 1,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  holidayLeftCol: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  holidayEventTitle: {
    fontSize: 15,
  },
  holidayDateSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closedPill: {
    backgroundColor: '#8E2020',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 79, 0.4)',
    borderRadius: borderRadius.sm,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  closedPillText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  earlyClosePill: {
    backgroundColor: '#B35309',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.4)',
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 150,
  },
  earlyClosePillTitle: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  earlyClosePillSub: {
    color: '#FFD8A8',
    fontSize: 9.5,
    marginTop: 1,
  },
});
