import { storageService } from './storageService';
import { finnhubRateLimiter } from '../utils/rateLimiter';
import { logoService } from './logoService';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export const finnhubRestService = {
  async fetchQuote(symbol, apiKey) {
    if (!symbol || !apiKey) return null;
    const cleanSymbol = symbol.trim().toUpperCase();

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[Finnhub REST] 🌐 Fetching quote for: ${cleanSymbol}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(cleanSymbol)}&token=${encodeURIComponent(apiKey)}`
        );

        if (!res.ok) {
          if (res.status === 429) {
            console.warn(`[Finnhub REST] ⚠️ 429 Rate limit reached for quote: ${cleanSymbol}`);
          }
          return null;
        }

        const data = await res.json();
        if (!data || (data.c === 0 && data.pc === 0)) {
          return null;
        }

        return {
          symbol: cleanSymbol,
          price: data.c,
          change: data.d,
          changePercent: data.dp,
          high: data.h,
          low: data.l,
          open: data.o,
          previousClose: data.pc,
          timestamp: data.t ? data.t * 1000 : Date.now(),
        };
      } catch (err) {
        console.warn(`[Finnhub REST] Failed to fetch quote for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },

  async fetchCompanyProfile(symbol, apiKey) {
    if (!symbol || !apiKey) return null;
    const cleanSymbol = symbol.trim().toUpperCase();

    // 1. Check persistent 50MB LRU cache first (30-day TTL)
    const cached = await storageService.getCachedProfile(cleanSymbol);
    if (cached) {
      console.log(`[Finnhub REST] ⚡ Using cached profile for: ${cleanSymbol} (No network call needed)`);
      return cached;
    }

    // 2. Schedule through Finnhub rate limiter
    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[Finnhub REST] 🌐 Fetching profile from Finnhub API for: ${cleanSymbol}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(cleanSymbol)}&token=${encodeURIComponent(apiKey)}`
        );

        if (!res.ok) {
          return null;
        }

        const data = await res.json();
        if (!data || !data.name) {
          return null;
        }

        const rawLogo = data.logo;
        let localLogoUri = null;
        if (rawLogo && !rawLogo.includes('placehold.co')) {
          localLogoUri = await logoService.overrideLogo(cleanSymbol, rawLogo);
        }

        const rawEx = (data.exchange || '').toUpperCase();
        const exchange = rawEx.includes('NASDAQ') ? 'NASDAQ' : rawEx.includes('NEW YORK STOCK EXCHANGE') ? 'NYSE' : rawEx || 'Unknown';

        const profile = {
          symbol: cleanSymbol,
          name: data.name,
          exchange,
          logo: localLogoUri || rawLogo || logoService.getPlaceholderUri(cleanSymbol),
          currency: data.currency || 'USD',
          country: data.country || 'US',
          marketCap: data.marketCapitalization || 0,
          weburl: data.weburl || '',
        };

        // 4. Save to persistent LRU cache with 30-day TTL
        await storageService.setCachedProfile(cleanSymbol, profile);
        return profile;
      } catch (err) {
        console.warn(`[Finnhub REST] Failed to fetch profile for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },

  async searchSymbols(query, apiKey) {
    if (!query || !query.trim() || !apiKey) return [];

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[Finnhub REST] 🔎 Searching symbols for: "${query}"`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query.trim())}&token=${encodeURIComponent(apiKey)}`
        );

        if (!res.ok) return [];
        const data = await res.json();

        if (!data || !Array.isArray(data.result)) return [];

        return data.result
          .filter((item) => item.type === 'Common Stock' || !item.type)
          .map((item) => ({
            symbol: item.symbol,
            displaySymbol: item.displaySymbol || item.symbol,
            name: item.description,
            type: item.type,
          }));
      } catch (err) {
        console.warn(`[Finnhub REST] Search error for query "${query}":`, err.message || err);
        return [];
      }
    });
  },

  async fetchMarketHolidays(apiKey, exchange = 'US') {
    if (!apiKey) return null;

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[Finnhub REST] 📅 Fetching market holidays for exchange: ${exchange}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/stock/market-holiday?exchange=${encodeURIComponent(exchange)}&token=${encodeURIComponent(apiKey)}`
        );

        if (!res.ok) return null;
        const data = await res.json();
        return data;
      } catch (err) {
        console.warn('[Finnhub REST] Failed to fetch market holidays:', err.message || err);
        return null;
      }
    });
  },
};
