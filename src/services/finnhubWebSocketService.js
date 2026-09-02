import { getFinnhubSymbol } from '../utils/securityUtils';

const MAX_TOTAL_BUDGET = 50;
const WATCHLIST_BUDGET = 45;
const ACTIVE_VIEW_BUDGET = 5;
const ROTATION_INTERVAL_MS = 15000; // 15 seconds
const THROTTLE_INTERVAL_MS = 500;   // 2 Hz update rate
const MAX_RECONNECT_ATTEMPTS = 5;

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
    this.allWishlistSymbols = new Set();
    this.activeViewSymbols = new Set();

    // Actual subscribed symbols on the Finnhub socket
    this.currentSocketSubscriptions = new Set();

    // High frequency trade tick buffer: { symbol: { price, volume, timestamp } }
    this.tickBuffer = new Map();

    // Listeners for 2Hz batch dispatch
    this.listeners = new Set();
  }

  // Update API key; reconnect when it changes
  setApiKey(key) {
    const trimmed = (key || '').trim();
    if (this.apiKey !== trimmed) {
      this.apiKey = trimmed;
      this.reconnectAttempts = 0;
      this.reconnect();
    }
  }

  // Register a 2Hz batch listener; returns unsubscribe fn
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Open the WS socket (guarded by key + reconnect cap + existing connection)
  connect() {
    if (!this.apiKey) {
      return;
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[Finnhub WS] ⏸️ Max reconnect attempts reached. Pausing WebSocket until API key or network refreshes.');
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      console.log('[Finnhub WS] 🔌 Connecting to real-time WebSocket stream...');
      this.ws = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(this.apiKey)}`);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.currentSocketSubscriptions.clear();
        console.log('[Finnhub WS] ✅ Connected successfully');
        this.syncSubscriptions();
        this.startTimers();
      };

      this.ws.onmessage = (event) => {
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
        // Socket errors trigger onclose automatically
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.currentSocketSubscriptions.clear();
        console.log('[Finnhub WS] 🔌 Disconnected');
        this.scheduleReconnect();
      };
    } catch (err) {
      console.log('[Finnhub WS] Connection initialization failed:', err.message || err);
      this.scheduleReconnect();
    }
  }

  // Backoff-scheduled reconnect (pauses past the attempt cap)
  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[Finnhub WS] ⏸️ WebSocket reconnect paused (verify your Finnhub token in Settings or .env).');
      return;
    }

    const backoffDelay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 20000);
    this.reconnectTimer = setTimeout(() => {
      if (this.apiKey) {
        this.connect();
      }
    }, backoffDelay);
  }

  // Force a full reconnect: stop timers, close socket, reconnect
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

  // Start the 2Hz flush interval and the 15s rotation interval
  startTimers() {
    if (!this.throttleTimer) {
      this.throttleTimer = setInterval(() => {
        this.flushTickBuffer();
      }, THROTTLE_INTERVAL_MS);
    }

    if (!this.rotationTimer) {
      this.rotationTimer = setInterval(() => {
        if (this.allWishlistSymbols.size > WATCHLIST_BUDGET) {
          this.rotateWatchlistSubscriptions();
        }
      }, ROTATION_INTERVAL_MS);
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
        console.log('[Finnhub WS] Error in tick listener:', e);
      }
    }
  }

  // --- Subscription Management ---

  // Replace the full watchlist symbol set and resync
  setWatchlistSymbols(symbols = []) {
    this.allWishlistSymbols = new Set(symbols.map((s) => getFinnhubSymbol(s)));
    this.syncSubscriptions();
  }

  // Set active-view symbols (capped to ACTIVE_VIEW_BUDGET) and resync
  setActiveViewSymbols(symbols = []) {
    const capped = symbols.slice(0, ACTIVE_VIEW_BUDGET).map((s) => getFinnhubSymbol(s));
    this.activeViewSymbols = new Set(capped);
    this.syncSubscriptions();
  }

  // Diff desired vs current socket subscriptions and subscribe/unsubscribe to match
  syncSubscriptions() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const targetSubscriptions = new Set();

    for (const sym of this.activeViewSymbols) {
      targetSubscriptions.add(sym);
    }

    const availableWatchlistBudget = MAX_TOTAL_BUDGET - targetSubscriptions.size;
    const wishlistArray = Array.from(this.allWishlistSymbols);

    if (wishlistArray.length <= availableWatchlistBudget) {
      // Budget fits all watchlist symbols
      for (const sym of wishlistArray) {
        targetSubscriptions.add(sym);
      }
    } else {
      // Oversubscribed: random subset within remaining budget
      const selected = this.getRandomSubset(wishlistArray, availableWatchlistBudget);
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
        `[Finnhub WS] 📡 Subscriptions synced (+${added}, -${removed}) | Total active: ${this.currentSocketSubscriptions.size}/${MAX_TOTAL_BUDGET} budget`
      );
    }
  }

  // Resample the watchlist subset every 15s (keeps 45-symbol rotation fresh)
  rotateWatchlistSubscriptions() {
    if (!this.isConnected || this.allWishlistSymbols.size <= WATCHLIST_BUDGET) {
      return;
    }

    const availableBudget = MAX_TOTAL_BUDGET - this.activeViewSymbols.size;
    const wishlistArray = Array.from(this.allWishlistSymbols);
    const newSubset = this.getRandomSubset(wishlistArray, availableBudget);

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
      `[Finnhub WS] 🔄 15s Rotation: Resubscribed ${newSubset.length} randomized stocks (${this.currentSocketSubscriptions.size}/${MAX_TOTAL_BUDGET})`
    );
  }

  // Fisher-Yates shuffle, take `size` (random watchlist rotation)
  getRandomSubset(array, size) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  // Send a subscribe/unsubscribe message over the live socket
  sendSocketMessage(type, symbol) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type, symbol }));
      } catch (err) {
        console.log(`[Finnhub WS] Failed to send ${type} for ${symbol}:`, err.message || err);
      }
    }
  }

  // Tear down socket, timers, listeners, and buffers
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
    console.log('[Finnhub WS] 🛑 Destroyed all sockets, listeners, and timers');
  }
}

export const finnhubWebSocketService = new FinnhubWebSocketManager();
