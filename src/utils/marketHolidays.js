import fallbackHolidays from '../constants/usMarketHolidays.json';

// In-memory holidays registry populated by bundled JSON and/or live Finnhub API
const holidayRegistry = new Map();
let allSortedHolidays = [];

function parseTimeSeconds(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  if (isNaN(h) || isNaN(m)) return null;
  return h * 3600 + m * 60;
}

function parseRange(rangeStr) {
  if (!rangeStr || !rangeStr.trim()) return null;
  const clean = rangeStr.trim();
  let parts;
  if (clean.includes('-')) {
    parts = clean.split('-');
  } else {
    const sub = clean.split(':');
    if (sub.length === 4) {
      parts = [`${sub[0]}:${sub[1]}`, `${sub[2]}:${sub[3]}`];
    } else {
      return null;
    }
  }

  if (parts.length === 2) {
    const start = parseTimeSeconds(parts[0]);
    const end = parseTimeSeconds(parts[1]);
    if (start !== null && end !== null) {
      return { start, end };
    }
  }
  return null;
}

/**
 * Ingests holiday items into the registry and keeps a sorted array
 */
export function ingestHolidayData(items = []) {
  if (!Array.isArray(items)) return;

  for (const item of items) {
    if (!item.atDate) continue;
    const dateKey = item.atDate.trim();
    const tradingRange = parseRange(item.tradingHour);
    const postRange = parseRange(item.postMarket);

    holidayRegistry.set(dateKey, {
      eventName: item.eventName || 'Market Holiday',
      atDate: dateKey,
      tradingHourRaw: item.tradingHour || '',
      postMarketRaw: item.postMarket || '',
      isFullyClosed: !item.tradingHour || item.tradingHour.trim() === '',
      regularHours: tradingRange, // e.g. { start: 34200 (09:30), end: 46800 (13:00) }
      postMarketHours: postRange, // e.g. { start: 46800 (13:00), end: 61200 (17:00) }
    });
  }

  allSortedHolidays = Array.from(holidayRegistry.values()).sort((a, b) =>
    a.atDate.localeCompare(b.atDate)
  );
}

// 1. Initialize immediately with the bundled 2023-2027 fallback dataset
ingestHolidayData(fallbackHolidays?.data || []);

/**
 * Checks if a given YYYY-MM-DD date has a market holiday configuration.
 */
export function getHolidayScheduleForDate(dateKey) {
  return holidayRegistry.get(dateKey) || null;
}

/**
 * Retrieves the next N upcoming holidays from a given reference date (default: today in NY)
 */
export function getNextUpcomingHolidays(count = 8, fromDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(fromDate);
  let y = '2026';
  let m = '01';
  let d = '01';
  for (const part of parts) {
    if (part.type === 'year') y = part.value;
    if (part.type === 'month') m = part.value;
    if (part.type === 'day') d = part.value;
  }
  const todayKey = `${y}-${m}-${d}`;

  return allSortedHolidays
    .filter((item) => item.atDate >= todayKey)
    .slice(0, count);
}
