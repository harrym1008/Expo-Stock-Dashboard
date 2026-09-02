// Bundled 2023-2027 holiday data from JSON
import jsonHolidays from '../constants/usMarketHolidays.json';
// Live Finnhub data can supplement at runtime

// dateKey to holiday config map
const holidayRegistry = new Map();
let allSortedHolidays = [];

// Calculates second from midnight from a "HH:MM" string
function parseTimeSeconds(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  if (isNaN(h) || isNaN(m)) return null;
  return h * 3600 + m * 60;
}

// Parse a trading/post-market hour range ("09:30-13:00" or "09:30:00-13:00:00")
function parseRange(rangeStr) {
  if (!rangeStr || !rangeStr.trim()) return null;
  const clean = rangeStr.trim();
  let parts;
  if (clean.includes('-')) {
    parts = clean.split('-');
  } else {
    // 4-part "HH:MM:SS:SS" collapse into two HH:MM halves
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

// Ingest holiday data rows into the registry
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
      // No/empty tradingHour = exchange shut all day
      isFullyClosed: !item.tradingHour || item.tradingHour.trim() === '',
      regularHours: tradingRange, // e.g. { start: 34200 (09:30), end: 46800 (13:00) }
      postMarketHours: postRange, // e.g. { start: 46800 (13:00), end: 61200 (17:00) }
    });
  }

  // Keep a date-sorted array for upcoming-holiday queries
  allSortedHolidays = Array.from(holidayRegistry.values()).sort((a, b) =>
    a.atDate.localeCompare(b.atDate)
  );
}

// Preload JSON holiday data at module load time
ingestHolidayData(jsonHolidays?.data || []);


// Look up holiday config for a YYYY-MM-DD key (null if none)
export function getHolidayScheduleForDate(dateKey) {
  return holidayRegistry.get(dateKey) || null;
}

// Returns the next N holidays from a reference date or today if null
export function getNextUpcomingHolidays(count = 8, fromDate = new Date()) {
  // NY-tz date formatter for the reference date
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(fromDate).map(({ type, value }) => [type, value])
  );
  const todayKey = `${parts.year}-${parts.month}-${parts.day}`;

  // Filter upcoming holidays using >= todayKey
  return allSortedHolidays
    .filter((item) => item.atDate >= todayKey)
    .slice(0, count);
}
