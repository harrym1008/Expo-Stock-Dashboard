import {
  formatMoney,
  formatLargeNum,
  formatShares,
  formatTimeAgo,
} from '../src/utils/formatters';
import {
  isNonStockSecurity,
  getDisplaySymbol,
  getFinnhubSymbol,
  getCurrency,
  getDecimals,
} from '../src/utils/securityUtils';
import { getMarketSessionStatus } from '../src/utils/marketHours';

describe('Utility Functions', () => {
  test('formats currency with default and custom currency symbols', () => {
    expect(formatMoney(150.75)).toBe('$150.75');
    expect(formatMoney(null)).toBe('-');
    expect(formatMoney(undefined)).toBe('-');
    expect(formatMoney(2500, '£')).toBe('£2,500.00');
  });

  test('formats fractional and whole share counts', () => {
    expect(formatShares(10)).toBe('10.00 shares');
    expect(formatShares(2.55432)).toBe('2.5543 shares');
    expect(formatShares(0)).toBe('0.00 shares');
  });

  test('formats large market caps using financial abbreviation suffixes', () => {
    expect(formatLargeNum(3.14e12, '$')).toBe('$3.14tn');
    expect(formatLargeNum(1.85e9, '$')).toBe('$1.85bn');
    expect(formatLargeNum(25.4e6, '$')).toBe('$25.40mn');
    expect(formatLargeNum(4200, '$')).toBe('$4.2k');
    expect(formatLargeNum(0)).toBe('-');
  });

  test('computes relative time elapsed from timestamps', () => {
    const now = Date.now();
    expect(formatTimeAgo(0)).toBe('0 secs ago');
    expect(formatTimeAgo(now - 5000)).toBe('5 secs ago');
    expect(formatTimeAgo(now - 120000)).toBe('2 mins ago');
    expect(formatTimeAgo(now - 7200000)).toBe('2 hrs ago');
  });

  test('classifies securities into stocks vs non-stock assets', () => {
    expect(isNonStockSecurity('AAPL')).toBe(false);
    expect(isNonStockSecurity('NVDA')).toBe(false);
    expect(isNonStockSecurity('OANDA:EUR_USD')).toBe(true);
    expect(isNonStockSecurity('BINANCE:BTCUSDT')).toBe(true);
  });

  test('translates broker-specific provider symbols to display symbols bidirectionally', () => {
    expect(getDisplaySymbol('OANDA:EUR_USD')).toBe('EUR/USD');
    expect(getFinnhubSymbol('EUR/USD')).toBe('OANDA:EUR_USD');
    expect(getDisplaySymbol('AAPL')).toBe('AAPL');
    expect(getFinnhubSymbol('AAPL')).toBe('AAPL');
  });

  test('determines decimal precision based on security price thresholds', () => {
    expect(getDecimals('AAPL', 150.0)).toBe(2);
    expect(getDecimals('PENNY', 0.5, null)).toBe(3);
    expect(getDecimals('MICRO', 0.05, null)).toBe(4);
  });

  test('detects weekend market closures from NY timestamp formatting', () => {
    const saturday = new Date('2026-09-05T14:00:00Z');
    const status = getMarketSessionStatus(saturday);
    expect(status.isOpen).toBe(false);
    expect(status.session).toBe('CLOSED');
    expect(status.label).toContain('Closed');
  });
});
