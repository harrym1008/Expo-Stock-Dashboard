import { persistentLruCache } from './persistentLruCache';

const STATIC_LOGO_BASE = 'https://static9.finnhub.io/file/publicdatany/finnhubimage/stock_logo';

class LogoService {
  constructor() {
    this.memoryCache = new Map(); // Symbol -> data URI
    this.inFlight = new Map();
    this.listeners = new Map();
  }

  // Fallback placeholder image URL for unknown/missing symbols
  getPlaceholderUri(symbol) {
    const cleanSym = (symbol || 'ST').trim().toUpperCase();
    return `https://placehold.co/128x128/555/FFF.png?text=${encodeURIComponent(cleanSym)}`;
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
        } catch (e) {}
      });
    }
  }

  /**
   * Prioritised Logo Retrieval:
   * 1. If profile URL provided, attempt downloading and caching it first.
   * 2. Check disk / RAM cache.
   * 3. Download from standard static Finnhub CDN (https://static9.finnhub.io/.../{sym}.png).
   * 4. If all fail/404, return placehold.co and do NOT cache it.
   */
  async getLogo(symbol, overrideUrl = null) {
    if (!symbol) return this.getPlaceholderUri(symbol);
    const sym = symbol.trim().toUpperCase();
    const hasProfileUrl = Boolean(overrideUrl && typeof overrideUrl === 'string' && !overrideUrl.includes('placehold.co'));

    // 1. Check RAM Cache (if no fresh profile override URL supplied)
    if (!hasProfileUrl && this.memoryCache.has(sym)) {
      return this.memoryCache.get(sym);
    }

    // 2. Check the persisted single-file cache (if no fresh profile override URL supplied)
    if (!hasProfileUrl) {
      const dataUri = await persistentLruCache.getCachedLogo(sym);
      if (dataUri) {
        this.memoryCache.set(sym, dataUri);
        this.notify(sym, dataUri);
        return dataUri;
      }
    }

    // 3. Deduplicate in-flight requests
    const inFlightKey = hasProfileUrl ? `${sym}_profile` : sym;
    if (this.inFlight.has(inFlightKey)) {
      return await this.inFlight.get(inFlightKey);
    }

    const promise = (async () => {
      try {
        // Priority 1: Profile URL if supplied
        if (hasProfileUrl) {
          console.log(`[LogoService] 🥇 Prioritising profile logo for ${sym}: ${overrideUrl}`);
          const profileDataUri = await persistentLruCache.getOrCacheImage(overrideUrl, sym);
          if (profileDataUri) {
            this.memoryCache.set(sym, profileDataUri);
            this.notify(sym, profileDataUri);
            return profileDataUri;
          }
        }

        // Priority 2: Common static Finnhub CDN URL
        const staticUrl = this.getStaticUrl(sym);
        console.log(`[LogoService] 🥈 Checking static CDN for ${sym}: ${staticUrl}`);
        const staticDataUri = await persistentLruCache.getOrCacheImage(staticUrl, sym);
        if (staticDataUri) {
          this.memoryCache.set(sym, staticDataUri);
          this.notify(sym, staticDataUri);
          return staticDataUri;
        }

        // Priority 3: Fallback to placehold.co (do NOT cache)
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

  /**
   * Explicitly override with fresh profile URL when fetched from Finnhub API
   */
  async overrideLogo(symbol, profileUrl) {
    if (!symbol || !profileUrl || profileUrl.includes('placehold.co')) return null;
    const sym = symbol.trim().toUpperCase();

    console.log(`[LogoService] 👑 Profile logo override for ${sym}: ${profileUrl}`);
    const dataUri = await persistentLruCache.getOrCacheImage(profileUrl, sym);
    if (dataUri) {
      this.memoryCache.set(sym, dataUri);
      this.notify(sym, dataUri);
      return dataUri;
    }
    return null;
  }

  // Kick off logo fetch for a batch (skips cached/in-flight symbols)
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

export const logoService = new LogoService();
