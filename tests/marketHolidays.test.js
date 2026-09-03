import {
  getHolidayScheduleForDate,
  getNextUpcomingHolidays,
  ingestHolidayData,
} from '../src/utils/marketHolidays';

describe('Market Holidays Engine', () => {
  test('recognizes major scheduled US market closures', () => {
    // Christmas 2025 closure
    const christmas = getHolidayScheduleForDate('2025-12-25');
    expect(christmas).not.toBeNull();
    expect(christmas.isFullyClosed).toBe(true);
  });

  test('retrieves upcoming scheduled holidays in chronological order', () => {
    const fromDate = new Date('2025-01-01T00:00:00Z');
    const holidays = getNextUpcomingHolidays(5, fromDate);

    expect(Array.isArray(holidays)).toBe(true);
    expect(holidays.length).toBeLessThanOrEqual(5);
    expect(holidays.length).toBeGreaterThan(0);

    // Verify chronological ordering
    for (let i = 1; i < holidays.length; i++) {
      expect(holidays[i].atDate >= holidays[i - 1].atDate).toBe(true);
    }
  });
});
