import { finnhubWebSocketService } from '../src/services/finnhubWebSocketService';

describe('Finnhub WebSocket Service', () => {
  beforeEach(() => {
    finnhubWebSocketService.destroy();
  });

  afterAll(() => {
    finnhubWebSocketService.destroy();
  });

  test('registers observer listeners and removes them on unsubscribe callback', () => {
    const mockListener1 = jest.fn();
    const mockListener2 = jest.fn();

    const unsub1 = finnhubWebSocketService.addListener(mockListener1);
    const unsub2 = finnhubWebSocketService.addListener(mockListener2);

    expect(finnhubWebSocketService.listeners.size).toBe(2);

    unsub1();
    expect(finnhubWebSocketService.listeners.size).toBe(1);
    expect(finnhubWebSocketService.listeners.has(mockListener2)).toBe(true);

    unsub2();
    expect(finnhubWebSocketService.listeners.size).toBe(0);
  });

  test('updates stored API token and resets reconnect attempt counters', () => {
    finnhubWebSocketService.reconnectAttempts = 3;
    finnhubWebSocketService.setApiKey('test_api_key_ws_999');

    expect(finnhubWebSocketService.apiKey).toBe('test_api_key_ws_999');
    expect(finnhubWebSocketService.reconnectAttempts).toBe(0);
  });

  test('enforces subscription caps on active-view symbols and tracks watchlist symbols', () => {
    finnhubWebSocketService.setWatchlistSymbols(['AAPL', 'MSFT', 'TSLA']);
    expect(finnhubWebSocketService.allWatchlistSymbols.size).toBe(3);
    expect(finnhubWebSocketService.allWatchlistSymbols.has('AAPL')).toBe(true);

    // Active view capped at budget limit of 5 symbols
    finnhubWebSocketService.setActiveViewSymbols(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(finnhubWebSocketService.activeViewSymbols.size).toBe(5);
  });

  test('buffers incoming trades and flushes batched ticks to active listeners', () => {
    const receivedTicks = [];
    const listener = jest.fn((updates) => {
      receivedTicks.push(...updates);
    });

    finnhubWebSocketService.addListener(listener);

    finnhubWebSocketService.tickBuffer.set('AAPL', {
      symbol: 'AAPL',
      price: 180.25,
      volume: 50,
      timestamp: 1700000000,
    });
    finnhubWebSocketService.tickBuffer.set('NVDA', {
      symbol: 'NVDA',
      price: 450.10,
      volume: 120,
      timestamp: 1700000001,
    });

    expect(finnhubWebSocketService.tickBuffer.size).toBe(2);

    finnhubWebSocketService.flushTickBuffer();

    expect(finnhubWebSocketService.tickBuffer.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(receivedTicks.length).toBe(2);
    expect(receivedTicks[0].symbol).toBe('AAPL');
    expect(receivedTicks[1].price).toBe(450.10);
  });
});
