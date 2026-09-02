import { getHolidayScheduleForDate } from './marketHolidays';

/**
 * Determines current US Market Session and Status in US Eastern Time (New York)
 * evaluated down to the EXACT SECOND, powered by Finnhub market-holiday dataset & API.
 *
 * Rules:
 * - Empty tradingHour: Fully closed (no pre-market, regular, or post-market).
 * - Populated tradingHour (e.g. 09:30-13:00):
 *     - Pre-market exists: 04:00:00 to tradingHour.start
 *     - Regular market: tradingHour.start to tradingHour.end
 *     - Post-market: tradingHour.end to postMarket.end (or 20:00:00)
 * - Standard weekday:
 *     - 04:00:00 - 09:30:00 ET: Pre-Market (Orange #FF9500)
 *     - 09:30:00 - 16:00:00 ET: Market Open (Green #00D084)
 *     - 16:00:00 - 20:00:00 ET: After-Hours (Purple #D946EF)
 *     - 20:00:00 - 04:00:00 ET & Weekends: Market Closed (Grey #8E8E93)
 */
// NY-tz formatter built once at module load (getMarketSessionStatus runs every 1s)
const NY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

// Current US market session, evaluated to the exact second in NY time
export function getMarketSessionStatus(date = new Date()) {
  const parts = NY_FORMATTER.formatToParts(date);
  // Defaults avoid crashes if a field is missing
  let year = date.getFullYear();
  let month = '01';
  let day = '01';
  let weekday = 'Mon';
  let hour = 12;
  let minute = 0;
  let second = 0;

  // Pull each field out of the formatted parts
  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
    if (part.type === 'second') second = parseInt(part.value, 10);
  }

  if (hour === 24) hour = 0;

  const dateKey = `${year}-${month}-${day}`;
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  // Total seconds since midnight, for simple numeric range compares
  const totalSeconds = hour * 3600 + minute * 60 + second;

  // 1. Weekend -> fully closed
  if (isWeekend) {
    return {
      session: 'CLOSED',
      label: 'Market Closed',
      sublabel: 'Weekend',
      color: '#8E8E93',
      isOpen: false,
      isPreMarket: false,
      isAfterHours: false,
      suffix: 'at close',
    };
  }

  // 2. Holiday from Finnhub dataset (may be fully closed or early-close)
  const holiday = getHolidayScheduleForDate(dateKey);

  if (holiday) {
    // Empty tradingHour => exchange shut for the whole day
    if (holiday.isFullyClosed) {
      return {
        session: 'CLOSED',
        label: 'Market Closed',
        sublabel: holiday.eventName,
        color: '#8E8E93',
        isOpen: false,
        isPreMarket: false,
        isAfterHours: false,
        suffix: 'at close',
      };
    }

    // Holiday hour boundaries (fall back to normal times if a field is absent)
    const preStart = 4 * 3600; // 04:00:00
    const regStart = holiday.regularHours?.start ?? 9 * 3600 + 1800; // 09:30:00
    const regEnd = holiday.regularHours?.end ?? 13 * 3600;           // e.g. 13:00:00 (early close)
    const postEnd = holiday.postMarketHours?.end ?? (holiday.postMarketHours ? holiday.postMarketHours.end : 20 * 3600);

    // Pre-Market window on an early-close day
    if (totalSeconds >= preStart && totalSeconds < regStart) {
      return {
        session: 'PRE_MARKET',
        label: 'Pre-Market',
        sublabel: holiday.eventName,
        color: '#FF9500',
        isOpen: false,
        isPreMarket: true,
        isAfterHours: false,
        suffix: 'at close',
      };
    }

    // Regular window (possibly shortened) on an early-close day
    if (totalSeconds >= regStart && totalSeconds < regEnd) {
      return {
        session: 'OPEN',
        label: 'Market Open',
        sublabel: `${holiday.eventName} (Early Close)`,
        color: '#00D084',
        isOpen: true,
        isPreMarket: false,
        isAfterHours: false,
        suffix: 'today',
      };
    }

    // Post-market window on an early-close day
    if (holiday.postMarketHours && totalSeconds >= regEnd && totalSeconds < postEnd) {
      return {
        session: 'AFTER_HOURS',
        label: 'After-Hours',
        sublabel: holiday.eventName,
        color: '#D946EF',
        isOpen: false,
        isPreMarket: false,
        isAfterHours: true,
        suffix: 'at close',
      };
    }

    // Any holiday time outside the windows above is closed
    return {
      session: 'CLOSED',
      label: 'Market Closed',
      sublabel: holiday.eventName,
      color: '#8E8E93',
      isOpen: false,
      isPreMarket: false,
      isAfterHours: false,
      suffix: 'at close',
    };
  }

  // 3. Normal weekday schedule (no holiday)
  const stdPreStart = 4 * 3600;        // 04:00:00
  const stdRegStart = 9 * 3600 + 1800; // 09:30:00
  const stdRegEnd = 16 * 3600;         // 16:00:00
  const stdPostEnd = 20 * 3600;        // 20:00:00

  // Pre-Market: 04:00 - 09:30
  if (totalSeconds >= stdPreStart && totalSeconds < stdRegStart) {
    return {
      session: 'PRE_MARKET',
      label: 'Pre-Market',
      sublabel: null,
      color: '#FF9500',
      isOpen: false,
      isPreMarket: true,
      isAfterHours: false,
      suffix: 'at close',
    };
  }

  // Regular session: 09:30 - 16:00
  if (totalSeconds >= stdRegStart && totalSeconds < stdRegEnd) {
    return {
      session: 'OPEN',
      label: 'Market Open',
      sublabel: null,
      color: '#00D084',
      isOpen: true,
      isPreMarket: false,
      isAfterHours: false,
      suffix: 'today',
    };
  }

  // After-hours: 16:00 - 20:00
  if (totalSeconds >= stdRegEnd && totalSeconds < stdPostEnd) {
    return {
      session: 'AFTER_HOURS',
      label: 'After-Hours',
      sublabel: null,
      color: '#D946EF',
      isOpen: false,
      isPreMarket: false,
      isAfterHours: true,
      suffix: 'at close',
    };
  }

  // Overnight (20:00 - 04:00) and anything outside windows
  return {
    session: 'CLOSED',
    label: 'Market Closed',
    sublabel: null,
    color: '#8E8E93',
    isOpen: false,
    isPreMarket: false,
    isAfterHours: false,
    suffix: 'at close',
  };
}
