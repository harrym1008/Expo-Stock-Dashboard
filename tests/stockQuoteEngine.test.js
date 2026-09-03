import { formatStockQuote } from '../src/utils/formatters';

describe('Stock Quote Formatting Engine', () => {
  // Reused mock base item for multiple tests
  const mockBaseItem = {
    symbol: 'AAPL',
    name: 'Apple Inc',
    price: 150.0,
    regularMarketPrice: 150.0,
    previousClose: 145.0,
  };

  test('calculates live price and percentage gain when market is open', () => {
    const liveQuote = {
      price: 155.0,
      regularMarketPrice: 150.0,
      previousClose: 150.0,
    };
    const marketStatus = {
      isOpen: true,
      session: 'REGULAR',
      isPreMarket: false,
      isAfterHours: false,
    };

    const formatted = formatStockQuote(mockBaseItem, liveQuote, null, null, marketStatus);

    expect(formatted.price).toBe(155.0);
    expect(formatted.change).toBe(5.0);
    expect(formatted.changePercent).toBeCloseTo(3.33, 1);
  });

  test('falls back to regular close when market is closed without extended trading', () => {
    const closedQuote = {
      regularMarketPrice: 150.0,
      previousClose: 145.0,
    };
    const marketStatus = {
      isOpen: false,
      session: 'CLOSED',
      isPreMarket: false,
      isAfterHours: false,
    };

    const formatted = formatStockQuote(mockBaseItem, closedQuote, null, null, marketStatus);

    expect(formatted.price).toBe(150.0);
    expect(formatted.change).toBe(5.0);
    expect(formatted.changePercent).toBeCloseTo(3.45, 1);
  });

  test('preserves intraday sparkline coordinate points', () => {
    const y1D = {
      sparkline: [148.0, 149.2, 150.5, 152.0],
      regularMarketPrice: 152.0,
      previousClose: 148.0,
    };
    const marketStatus = {
      isOpen: true,
      session: 'REGULAR',
    };

    const formatted = formatStockQuote(mockBaseItem, null, null, y1D, marketStatus);

    expect(Array.isArray(formatted.sparkline)).toBe(true);
    expect(formatted.sparkline.length).toBe(4);
    // Tail of sparkline tracks current display price
    expect(formatted.sparkline[3]).toBe(formatted.price);
  });
});
