import { getFinnhubSymbol } from '../utils/securityUtils';

const MAX_TOTAL_BUDGET = 50;
const WATCHLIST_BUDGET = 45;
const ACTIVE_VIEW_BUDGET = 5;

const WEBSOCKET_URL = 'wss://ws.finnhub.io';


// Manages Finnhub Websocket connection/reconnection, limited subscriptions and rotation at a 2Hz dispatch rate
class FinnhubWebSocketManager {
  constructor() {
    this.ws = null;
    this.apiKey = '';
    this.isConnected = false;
    this.reconnectTimer = null;
    this.rotationTimer = null;
    this.throttleTimer = null;
    this.reconnectAttempts = 0;

    // Symbol sets (stored as Finnhub subscription symbols)
    this.allWatchlistSymbols = new Set();
    this.activeViewSymbols = new Set();

    // Actual subscribed symbols on the Finnhub socket
    this.currentSocketSubscriptions = new Set();

    // High frequency trade tick buffer: { symbol: { price, volume, timestamp } }
    this.tickBuffer = new Map();

    // Listeners for 2Hz batch dispatch
    this.listeners = new Set();
  }

  // Update API key and reconnect to WS upon change
  setApiKey(key) {
    const trimmed = (key || '').trim();
    if (this.apiKey !== trimmed) {
      this.apiKey = trimmed;
      this.reconnectAttempts = 0;
      this.reconnect();
    }
  }

  // Register a 2Hz batch listener; returns unsubscribe function
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Open the WS socket
  connect() {
    if (!this.apiKey) {
      return;
    }

    if (this.reconnectAttempts >= 5) {
      console.log('[FHub WSkt] Too many reconnect attempts, pausing... check API key.');
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      // Websocket is already open or in the process of opening
      return;
    }

    try {
      console.log('[FHub WSkt] Connecting to Finnhub WebSocket stream...');
      this.ws = new WebSocket(`${WEBSOCKET_URL}?token=${encodeURIComponent(this.apiKey)}`);

      this.ws.onopen = () => {
        // Successful connection: reset state, clear subscriptions, and sync
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.currentSocketSubscriptions.clear();
        console.log('[FHub WSkt] Successfully connected to the Finnhub websocket');
        this.syncSubscriptions();
        this.startTimers();
      };

      this.ws.onmessage = (event) => {
        // Handle incoming trade messages and buffer them for 2Hz dispatch
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'trade' && Array.isArray(message.data)) {
            // Buffer each trade tick by symbol (2Hz flush)
            for (const trade of message.data) {
              if (trade.s && typeof trade.p === 'number' && trade.p > 0) {
                const sym = trade.s.toUpperCase();
                const price = trade.p;
                const volume = trade.v;

                this.tickBuffer.set(sym, {
                  symbol: sym,
                  price,
                  volume,
                  timestamp: trade.t || Date.now(),
                });
              }
            }
          }
        } catch (e) {}
      };

      this.ws.onerror = () => {
        console.log('[FHub WSkt] WebSocket error occurred! ');
        // Socket errors trigger onclose automatically
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.currentSocketSubscriptions.clear();
        console.log('[FHub WSkt] Disconnected from WebSocket');
        this.scheduleReconnect();
      };
    } catch (err) {
      console.log('[FHub WSkt] Connection initialisation failed:', err.message || err);
      this.scheduleReconnect();
    }
  }

  // Backoff-scheduled reconnect (pauses past the attempt cap)
  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[FHub WSkt] WebSocket reconnect paused (verify your Finnhub token in Settings or .env).');
      return;
    }

    // Exponential backoff 300 ms -> 450ms -> 675ms up to 20 seconds
    const backoffDelay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 20000);
    this.reconnectTimer = setTimeout(() => {
      if (this.apiKey) {
        this.connect();
      }
    }, backoffDelay);
  }

  // Force a full reconnect... stop timers, close socket, reconnect
  reconnect() {
    this.stopTimers();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.currentSocketSubscriptions.clear();
    this.connect();
  }

  // Start the 2Hz tick buffer flush interval and the 15s rotation interval
  startTimers() {
    if (!this.throttleTimer) {
      this.throttleTimer = setInterval(() => {
        this.flushTickBuffer();
      }, 500);
    }

    if (!this.rotationTimer) {
      this.rotationTimer = setInterval(() => {
        if (this.allWatchlistSymbols.size > WATCHLIST_BUDGET) {
          this.rotateWatchlistSubscriptions();
        }
      }, 15000);
    }
  }

  // Kill both intervals
  stopTimers() {
    if (this.throttleTimer) {
      clearInterval(this.throttleTimer);
      this.throttleTimer = null;
    }
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  // Flush buffered ticks to listeners (2Hz)
  flushTickBuffer() {
    if (this.tickBuffer.size === 0 || this.listeners.size === 0) return;

    const updates = Array.from(this.tickBuffer.values());
    this.tickBuffer.clear();

    for (const listener of this.listeners) {
      try {
        listener(updates);
      } catch (e) {
        console.log('[FHub WSkt] Error in tick listener:', e);
      }
    }
  }

  

  // Replace the full watchlist symbol set and resync
  setWatchlistSymbols(symbols = []) {
    this.allWatchlistSymbols = new Set(symbols.map((s) => getFinnhubSymbol(s)));
    this.syncSubscriptions();
  }

  // Set active-view symbols and resync
  setActiveViewSymbols(symbols = []) {
    const capped = symbols.slice(0, ACTIVE_VIEW_BUDGET).map((s) => getFinnhubSymbol(s));
    this.activeViewSymbols = new Set(capped);
    this.syncSubscriptions();
  }

  // Different desired vs current socket subscriptions... subscribe/unsubscribe to sync them
  syncSubscriptions() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const targetSubscriptions = new Set();

    for (const sym of this.activeViewSymbols) {
      targetSubscriptions.add(sym);
    }

    const availableWatchlistBudget = MAX_TOTAL_BUDGET - targetSubscriptions.size;
    const watchlistArray = Array.from(this.allWatchlistSymbols);

    if (watchlistArray.length <= availableWatchlistBudget) {
      // Budget fits all watchlist symbols
      for (const sym of watchlistArray) {
        targetSubscriptions.add(sym);
      }
    } else {
      // Oversubscribed: random subset within remaining budget
      const selected = this.getRandomSubset(watchlistArray, availableWatchlistBudget);
      for (const sym of selected) {
        targetSubscriptions.add(sym);
      }
    }

    let added = 0;
    let removed = 0;

    for (const current of this.currentSocketSubscriptions) {
      if (!targetSubscriptions.has(current)) {
        this.sendSocketMessage('unsubscribe', current);
        this.currentSocketSubscriptions.delete(current);
        removed++;
      }
    }

    for (const target of targetSubscriptions) {
      if (!this.currentSocketSubscriptions.has(target)) {
        this.sendSocketMessage('subscribe', target);
        this.currentSocketSubscriptions.add(target);
        added++;
      }
    }

    if (added > 0 || removed > 0) {
      console.log(
        `[FHub WSkt] Subscriptions synced (+${added}, -${removed}), ${this.currentSocketSubscriptions.size} subs active of ${MAX_TOTAL_BUDGET} permitted`
      );
    }
  }

  // Resample the watchlist subset every 15s (keeps 45-symbol rotation fresh)
  rotateWatchlistSubscriptions() {
    if (!this.isConnected || this.allWatchlistSymbols.size <= WATCHLIST_BUDGET) {
      return;
    }

    const availableBudget = MAX_TOTAL_BUDGET - this.activeViewSymbols.size;
    const watchlistArray = Array.from(this.allWatchlistSymbols);
    const newSubset = this.getRandomSubset(watchlistArray, availableBudget);

    const newTargetSubscriptions = new Set([...this.activeViewSymbols, ...newSubset]);

    for (const current of this.currentSocketSubscriptions) {
      if (!newTargetSubscriptions.has(current)) {
        this.sendSocketMessage('unsubscribe', current);
        this.currentSocketSubscriptions.delete(current);
      }
    }

    for (const target of newTargetSubscriptions) {
      if (!this.currentSocketSubscriptions.has(target)) {
        this.sendSocketMessage('subscribe', target);
        this.currentSocketSubscriptions.add(target);
      }
    }

    console.log(
      `[FHub WSkt] 15s subbed symbols rotation, now: ${this.currentSocketSubscriptions.size} subs active of ${MAX_TOTAL_BUDGET} permitted`
    );
  }

  // Fisher-Yates shuffle then slice to get a random subset
  getRandomSubset(array, size) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  // Send a sub/unsub message over the live socket
  sendSocketMessage(type, symbol) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type, symbol }));
      } catch (err) {
        console.log(`[FHub WSkt] Failed to send ${type} for ${symbol}:`, err.message || err);
      }
    }
  }

  // Destroy the socket, timers, and listeners
  destroy() {
    this.stopTimers();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
    this.listeners.clear();
    this.tickBuffer.clear();
    this.currentSocketSubscriptions.clear();
    console.log('[FHub WSkt] Destroyed all sockets, listeners, and timers');
  }
}

// Global singleton instance of the FinnhubWebSocketManager
export const finnhubWebSocketService = new FinnhubWebSocketManager();
