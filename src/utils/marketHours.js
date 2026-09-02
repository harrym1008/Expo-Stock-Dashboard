import { getHolidayScheduleForDate } from './marketHolidays';


// NY-timezone formatter built once at module load
const NY_TZ_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

// Returns the current market session give a Date object (defaults to now)
export function getMarketSessionStatus(date = new Date()) {
  const parts = NY_TZ_FORMATTER.formatToParts(date).reduce((acc, { type, value }) => {
    acc[type] = value;
    return acc;
  }, {});

  const year = parseInt(parts.year, 10);
  const month = parseInt(parts.month, 10);
  const day = parseInt(parts.day, 10);
  const weekday = parts.weekday; // e.g., 'Mon'
  let hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const second = parseInt(parts.second, 10);

  if (hour === 24) hour = 0;

  const dateKey = `${year}-${month}-${day}`;
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';

  // Total seconds since midnight, for simple numeric range compares
  const totalSeconds = hour * 3600 + minute * 60 + second;

  // Weekend? Fully closed
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

  // Holiday? Check for special hours or full closure
  const holiday = getHolidayScheduleForDate(dateKey);

  if (holiday) {
    // Empty tradingHour = exchange is shut for the whole day
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

    // If we are here, the holiday has special hours
    const preStart = 4 * 3600; // Always 04:00:00
    const regStart = holiday.regularHours?.start ?? 9 * 3600 + 1800; // 09:30:00
    const regEnd = holiday.regularHours?.end ?? 16 * 3600;           // 16:00:00
    const postEnd = holiday.postMarketHours?.end ?? 20 * 3600;       // 20:00:00

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

  // Otherwise, it's a normal trading day
  const normalPreStart = 4 * 3600;        // 04:00:00
  const normalRegStart = 9 * 3600 + 1800; // 09:30:00
  const normalRegEnd = 16 * 3600;         // 16:00:00
  const normalPostEnd = 20 * 3600;        // 20:00:00

  // Pre-Market: 04:00 - 09:30
  if (totalSeconds >= normalPreStart && totalSeconds < normalRegStart) {
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
  if (totalSeconds >= normalRegStart && totalSeconds < normalRegEnd) {
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
  if (totalSeconds >= normalRegEnd && totalSeconds < normalPostEnd) {
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
