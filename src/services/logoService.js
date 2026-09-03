// Finnhub static CDN base URL for stock logos (public static asset CDN)
const STATIC_LOGO_BASE = 'https://static9.finnhub.io/file/publicdatany/finnhubimage/stock_logo';

// Placeholder image service base URL (placehold.co) for unknown/missing symbols
const PLACEHOLD_CO_BASE = 'https://placehold.co/128x128/555/FFF.png?text=';

class LogoService {
  constructor() {
    this.memoryCache = new Map(); // Maps symbol to URI string
    this.failedSymbols = new Set(); // Symbols that 404'd or errored on CDN
    this.listeners = new Map();
  }

  // Fallback placeholder image URL for unknown/missing symbols
  getPlaceholderUri(symbol) {
    const cleanSym = (symbol || 'ST').trim().toUpperCase();
    return `${PLACEHOLD_CO_BASE}${encodeURIComponent(cleanSym)}`;
  }

  // Static Finnhub CDN URL for a symbol
  getStaticUrl(symbol) {
    return `${STATIC_LOGO_BASE}/${symbol.trim().toUpperCase()}.png`;
  }

  // Read logo from in-memory cache
  getCachedLogo(symbol) {
    if (!symbol) return null;
    const sym = symbol.trim().toUpperCase();
    return this.memoryCache.get(sym) || null;
  }

  // Register a per-symbol callback; returns an unsubscribe function
  subscribe(symbol, callback) {
    if (!symbol || typeof callback !== 'function') return () => {};
    const sym = symbol.trim().toUpperCase();

    if (!this.listeners.has(sym)) {
      this.listeners.set(sym, new Set());
    }
    this.listeners.get(sym).add(callback);

    return () => {
      const set = this.listeners.get(sym);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(sym);
      }
    };
  }

  // Push a freshly-fetched or overridden logo to all subscribers for a symbol
  notify(symbol, uri) {
    const sym = (symbol || '').trim().toUpperCase();
    const callbacks = this.listeners.get(sym);
    if (callbacks && callbacks.size > 0) {
      callbacks.forEach((cb) => {
        try {
          cb(uri);
        } catch (e) {
          // Ignore failing callbacks
        }
      });
    }
  }

  // Mark a symbol's CDN logo as missing/failed so it immediately falls back to placeholder
  markFailed(symbol) {
    if (!symbol) return;
    const sym = symbol.trim().toUpperCase();
    this.failedSymbols.add(sym);
    const placeholder = this.getPlaceholderUri(sym);
    this.memoryCache.set(sym, placeholder);
    this.notify(sym, placeholder);
  }

  // Synchronously resolve best URI for a symbol (for initial state)
  resolveLogoUri(symbol, overrideUrl = null) {
    if (!symbol) return this.getPlaceholderUri(symbol);
    const sym = symbol.trim().toUpperCase();

    // Priority 1: Custom override / profile URL
    if (overrideUrl && typeof overrideUrl === 'string' && !overrideUrl.includes('placehold.co')) {
      return overrideUrl;
    }

    // Priority 2: Memory cache
    if (this.memoryCache.has(sym)) {
      return this.memoryCache.get(sym);
    }

    // Priority 3: If previously failed, return placeholder
    if (this.failedSymbols.has(sym)) {
      return this.getPlaceholderUri(sym);
    }

    // Priority 4: Static CDN URL (React Native Image will natively download and cache)
    const staticUrl = this.getStaticUrl(sym);
    this.memoryCache.set(sym, staticUrl);
    return staticUrl;
  }

  // Prioritised Logo Retrieval: returns Promise for backward compatibility
  async getLogo(symbol, overrideUrl = null) {
    const uri = this.resolveLogoUri(symbol, overrideUrl);
    return uri;
  }

  // Override the logo for a symbol with a custom profile URL
  async overrideLogo(symbol, profileUrl) {
    if (!symbol || !profileUrl || profileUrl.includes('placehold.co')) return null;
    const sym = symbol.trim().toUpperCase();

    this.memoryCache.set(sym, profileUrl);
    this.failedSymbols.delete(sym);
    this.notify(sym, profileUrl);
    return profileUrl;
  }

  // Preload logos (delegated to native Image caching where helpful, non-blocking)
  preloadLogos(symbols = []) {
    if (!Array.isArray(symbols) || symbols.length === 0) return;
    for (const item of symbols) {
      const sym = typeof item === 'string' ? item : item?.symbol;
      if (!sym) continue;
      this.resolveLogoUri(sym);
    }
  }
}

// Global singleton instance of the LogoService
export const logoService = new LogoService();
