import { persistentLruCache } from './persistentLruCache';

// Finnhub static CDN base URL for stock logos (kinda naughty since it does not require an API key, but it is a public URL)
const STATIC_LOGO_BASE = 'https://static9.finnhub.io/file/publicdatany/finnhubimage/stock_logo';


// Placeholder image service base URL (placehold.co) for unknown/missing symbols
const PLACEHOLD_CO_BASE = 'https://placehold.co/128x128/555/FFF.png?text=';


class LogoService {
  constructor() {
    this.memoryCache = new Map(); // Maps symbol data to URI
    this.inFlight = new Map();
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

  // Read logo from the in-memory (RAM) cache only
  getCachedLogo(symbol) {
    if (!symbol) return null;
    return this.memoryCache.get(symbol.trim().toUpperCase()) || null;
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

  // Push a freshly-fetched logo to all subscribers for a symbol
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

  
  // Prioritised Logo Retrieval:   profile URI > disk cache > static CDN > placeholder
  async getLogo(symbol, overrideUrl = null) {
    if (!symbol) return this.getPlaceholderUri(symbol);
    const sym = symbol.trim().toUpperCase();
    const hasProfileUrl = Boolean(overrideUrl && typeof overrideUrl === 'string' && !overrideUrl.includes('placehold.co'));

    // First Check RAM cache
    if (!hasProfileUrl && this.memoryCache.has(sym)) {
      return this.memoryCache.get(sym);
    }

    // Check the LRU cache in persistent storage
    if (!hasProfileUrl) {
      const dataUri = await persistentLruCache.getCachedLogo(sym);
      if (dataUri) {
        this.memoryCache.set(sym, dataUri);
        this.notify(sym, dataUri);
        return dataUri;
      }
    }

    // Deduplicate in flight requests for the same symbol (so only one request per symbol is made at a time)
    const inFlightKey = hasProfileUrl ? `${sym}_profile` : sym;
    if (this.inFlight.has(inFlightKey)) {
      return await this.inFlight.get(inFlightKey);
    }

    const promise = (async () => {
      try {
        // Priority 1: Profile URL if supplied
        if (hasProfileUrl) {
          console.log(`[Logo Svc] Loading profile logo for ${sym}: ${overrideUrl.slice(0, 40)}...`);
          const profileDataUri = await persistentLruCache.getOrCacheImage(overrideUrl, sym);
          if (profileDataUri) {
            this.memoryCache.set(sym, profileDataUri);
            this.notify(sym, profileDataUri);
            return profileDataUri;
          }
        }

        // Priority 2: Common static Finnhub CDN URL
        const staticUrl = this.getStaticUrl(sym);
        console.log(`[Logo Svc] Checking static CDN for ${sym}: ${staticUrl.slice(0, 40)}...`);
        const staticDataUri = await persistentLruCache.getOrCacheImage(staticUrl, sym);
        if (staticDataUri) {
          this.memoryCache.set(sym, staticDataUri);
          this.notify(sym, staticDataUri);
          return staticDataUri;
        }

        // Priority 3: Fallback to placehold.co (do not cache)
        return this.getPlaceholderUri(sym);
      } catch (err) {
        return this.getPlaceholderUri(sym);
      } finally {
        this.inFlight.delete(inFlightKey);
      }
    })();

    this.inFlight.set(inFlightKey, promise);
    return await promise;
  }

  // Override the logo for a symbol with a custom profile URL
  async overrideLogo(symbol, profileUrl) {
    if (!symbol || !profileUrl || profileUrl.includes('placehold.co')) return null;
    const sym = symbol.trim().toUpperCase();

    console.log(`[Logo Svc] Profile logo override for ${sym}: ${profileUrl.slice(0, 40)}...`);
    const dataUri = await persistentLruCache.getOrCacheImage(profileUrl, sym);
    if (dataUri) {
      this.memoryCache.set(sym, dataUri);
      this.notify(sym, dataUri);
      return dataUri;
    }
    return null;
  }

  // Preload an array of symbols into the cache (non-blocking and async)
  preloadLogos(symbols = []) {
    if (!Array.isArray(symbols) || symbols.length === 0) return;
    for (const item of symbols) {
      const sym = typeof item === 'string' ? item : item?.symbol;
      if (!sym) continue;
      const upper = sym.trim().toUpperCase();
      if (!this.memoryCache.has(upper) && !this.inFlight.has(upper)) {
        this.getLogo(upper);
      }
    }
  }
}


// Global singleton instance of the LogoService
export const logoService = new LogoService();
