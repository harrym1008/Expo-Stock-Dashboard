// Mock storage dependencies to avoid native binary requirements during unit tests
jest.mock('../src/services/storageService', () => ({
  storageService: {
    getCachedProfile: jest.fn().mockResolvedValue(null),
    setCachedProfile: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/services/persistentLruCache', () => ({
  persistentLruCache: {
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/services/logoService', () => ({
  logoService: {
    overrideLogo: jest.fn().mockResolvedValue(null),
  },
}));

import { finnhubRestService } from '../src/services/finnhubRestService';
import { yahooFinanceService } from '../src/services/yahooFinanceService';

describe('Finnhub and Yahoo REST APIs', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('validates active Finnhub API tokens via lightweight quote check', async () => {
    global.fetch = jest.fn().mockResolvedValue({    // Mock a successful response from Finnhub API
      ok: true,
      status: 200,
      json: async () => ({ c: 135.5, d: 2.1, dp: 1.5 }),
    });

    const result = await finnhubRestService.validateApiKey('valid_test_token_123');
    expect(result.valid).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('token=valid_test_token_123')
    );
  });

  test('flags rejected or unauthorized Finnhub tokens upon 401 HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({    // Mock a 401 Unauthorized response from Finnhub API
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid API key' }),
    });

    const result = await finnhubRestService.validateApiKey('invalid_token');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('401');
  });

  test('searches Finnhub US equities and maps response properties', async () => {
    global.fetch = jest.fn().mockResolvedValue({    // Mock a successful response from Finnhub API
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          { symbol: 'AAPL', description: 'APPLE INC', type: 'Common Stock' },
          { symbol: 'MSFT', description: 'MICROSOFT CORP', type: 'Common Stock' },
        ],
      }),
    });

    const results = await finnhubRestService.searchSymbols('AAP', 'test_key');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results[0].symbol).toBe('AAPL');
    expect(results[0].name).toBe('APPLE INC');
  });

  test('fetches live Yahoo Finance quote and maps market prices', async () => {
    global.fetch = jest.fn().mockResolvedValue({    // Mock a successful response from Yahoo Finance API
      ok: true,
      status: 200,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                symbol: 'NVDA',
                regularMarketPrice: 125.5,
                previousClose: 120.0,
                currency: 'USD',
              },
              timestamp: [1700000000],
              indicators: {
                quote: [{ close: [125.5] }],
              },
            },
          ],
        },
      }),
    });

    const quote = await yahooFinanceService.fetchQuote('NVDA');
    expect(quote).not.toBeNull();
    expect(quote.price).toBe(125.5);
    expect(quote.symbol).toBe('NVDA');
  });

  test('parses historical Yahoo Finance chart intervals into candle coordinates', async () => {
    global.fetch = jest.fn().mockResolvedValue({    // Mock a successful response from Yahoo Finance API
      ok: true,
      status: 200,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 150.0,
                previousClose: 145.0,
              },
              timestamp: [1700000000, 1700003600],
              indicators: {
                quote: [
                  {
                    close: [146.0, 150.0],
                  },
                ],
              },
            },
          ],
        },
      }),
    });

    const chartData = await yahooFinanceService.fetchHistoricalData('AAPL', '1D');
    expect(chartData).not.toBeNull();
    expect(chartData.currentPrice).toBe(150.0);
    expect(Array.isArray(chartData.points)).toBe(true);
  });
});
