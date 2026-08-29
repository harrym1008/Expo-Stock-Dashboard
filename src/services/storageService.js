import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistentLruCache } from './persistentLruCache';

const STORAGE_KEYS = {
  FINNHUB_API_KEY: '@stock_dashboard_finnhub_api_key',
  WATCHLISTS: '@stock_dashboard_watchlists',
  STOCK_TIMEFRAMES: '@stock_dashboard_stock_timeframes',
  PAPER_TRADING_ENABLED: '@stock_dashboard_paper_trading_enabled',
};

// 30 Days (1 Month) TTL for company profiles and logos
const PROFILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const storageService = {
  async getApiKey() {
    try {
      const storedKey = await AsyncStorage.getItem(STORAGE_KEYS.FINNHUB_API_KEY);
      if (storedKey && storedKey.trim()) {
        return storedKey.trim();
      }
      return process.env.EXPO_PUBLIC_FINNHUB_API_KEY || '';
    } catch (e) {
      console.warn('Failed to load API key from storage:', e);
      return process.env.EXPO_PUBLIC_FINNHUB_API_KEY || '';
    }
  },

  async setApiKey(key) {
    try {
      if (key && key.trim()) {
        await AsyncStorage.setItem(STORAGE_KEYS.FINNHUB_API_KEY, key.trim());
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.FINNHUB_API_KEY);
      }
    } catch (e) {
      console.warn('Failed to save API key to storage:', e);
    }
  },

  // --- 50MB Persistent LRU Cache Integration ---

  async getCachedProfile(symbol) {
    if (!symbol) return null;
    return await persistentLruCache.getJson(`profile_${symbol.toUpperCase()}`);
  },

  async setCachedProfile(symbol, profile) {
    if (!symbol || !profile) return;
    await persistentLruCache.setJson(`profile_${symbol.toUpperCase()}`, profile, PROFILE_TTL_MS);
  },

  async getCacheStats() {
    return await persistentLruCache.getCacheStats();
  },

  async clearCache() {
    return await persistentLruCache.clearAll();
  },

  // --- Watchlists Persistence ---

  async getStoredWatchlists() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.WATCHLISTS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  async setStoredWatchlists(watchlists) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.WATCHLISTS, JSON.stringify(watchlists));
    } catch (e) {
      console.warn('Failed to save watchlists to storage:', e);
    }
  },

  // --- Per-Stock Timeframe Memory ---

  async getStockTimeframes() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.STOCK_TIMEFRAMES);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  async setStockTimeframe(symbol, timeframe) {
    if (!symbol || !timeframe) return;
    try {
      const current = await this.getStockTimeframes();
      current[symbol.toUpperCase()] = timeframe;
      await AsyncStorage.setItem(STORAGE_KEYS.STOCK_TIMEFRAMES, JSON.stringify(current));
    } catch (e) {
      console.warn('Failed to save stock timeframe:', e);
    }
  },

  // --- Simulated Paper Trading ---

  async getPaperTradingEnabled() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.PAPER_TRADING_ENABLED);
      return raw !== null ? JSON.parse(raw) : false;
    } catch (e) {
      return false;
    }
  },

  async setPaperTradingEnabled(enabled) {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.PAPER_TRADING_ENABLED,
        JSON.stringify(Boolean(enabled))
      );
    } catch (e) {
      console.warn('Failed to save paper trading setting:', e);
    }
  },
};
