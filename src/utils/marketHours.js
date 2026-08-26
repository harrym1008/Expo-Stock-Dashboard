/**
 * Determines current US Market Session and Status in US Eastern Time (New York).
 * - 04:00 - 09:30 ET: Pre-Market (Orange)
 * - 09:30 - 16:00 ET: Market Open (Green)
 * - 16:00 - 20:00 ET: After-Hours (Purple)
 * - 20:00 - 04:00 ET & Weekends: Market Closed (Grey)
 */
export function getMarketSessionStatus() {
  const now = new Date();

  // Robust cross-platform New York timezone formatting using Intl formatToParts
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  });

  const parts = formatter.formatToParts(now);
  let weekday = 'Mon';
  let hour = 12;
  let minute = 0;

  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }

  if (hour === 24) hour = 0;

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const totalMinutes = hour * 60 + minute;

  if (isWeekend) {
    return {
      session: 'CLOSED',
      label: 'Market Closed',
      color: '#8E8E93',
      isOpen: false,
      isPreMarket: false,
      isAfterHours: false,
      suffix: 'at close',
    };
  }

  // Pre-Market: 04:00 (240 min) to 09:30 (570 min)
  if (totalMinutes >= 240 && totalMinutes < 570) {
    return {
      session: 'PRE_MARKET',
      label: 'Pre-Market',
      color: '#FF9500',
      isOpen: false,
      isPreMarket: true,
      isAfterHours: false,
      suffix: 'at close',
    };
  }

  // Regular Trading: 09:30 (570 min) to 16:00 (960 min)
  if (totalMinutes >= 570 && totalMinutes < 960) {
    return {
      session: 'OPEN',
      label: 'Market Open',
      color: '#00D084',
      isOpen: true,
      isPreMarket: false,
      isAfterHours: false,
      suffix: 'today',
    };
  }

  // After-Hours: 16:00 (960 min) to 20:00 (1200 min)
  if (totalMinutes >= 960 && totalMinutes < 1200) {
    return {
      session: 'AFTER_HOURS',
      label: 'After-Hours',
      color: '#D946EF',
      isOpen: false,
      isPreMarket: false,
      isAfterHours: true,
      suffix: 'at close',
    };
  }

  // Market Closed: 20:00 (1200 min) to 04:00 (240 min)
  return {
    session: 'CLOSED',
    label: 'Market Closed',
    color: '#8E8E93',
    isOpen: false,
    isPreMarket: false,
    isAfterHours: false,
    suffix: 'at close',
  };
}
