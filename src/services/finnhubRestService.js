import { storageService } from './storageService';
import { finnhubRateLimiter } from '../utils/rateLimiter';
import { logoService } from './logoService';
import { persistentLruCache } from './persistentLruCache';

// Shared Finnhub REST API base URL
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';


export const finnhubRestService = {

  // Validate an API key via a single lightweight quote call for NVDA
  async validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return { valid: false, error: 'API key is required' };
    }
    const cleanKey = apiKey.trim();
    try {
      console.log('[FHub REST] Validating Finnhub API key via NVDA quote call...');
      const res = await fetch(
        `${FINNHUB_BASE_URL}/quote?symbol=NVDA&token=${encodeURIComponent(cleanKey)}`
      );

      if (res.status === 200) {
        const data = await res.json();
        if (typeof data?.c === 'number') {
          console.log('[FHub REST] Successfully validated API key!');
          return { valid: true };
        }
      }
      console.log('[FHub REST] Invalid or unauthorised API key, HTTP error ', res.status);

      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: 'Invalid or unauthorised Finnhub API key (HTTP ' + res.status + ')' };
      }

      return { valid: false, error: `Finnhub returned HTTP ${res.status}` };
    } catch (err) {
      console.log('[FHub REST] Failed to validate API key:', err.message || err);
      return { valid: false, error: err.message || 'Network error during validation' };
    }
  },


  // Fetch one company profile (cache --> Finnhub REST --> logo override --> cache)
  async fetchCompanyProfile(symbol, apiKey) {
    if (!symbol || !apiKey) return null;
    const cleanSymbol = symbol.trim().toUpperCase();

    // Check persistent LRU cache first
    const cached = await storageService.getCachedProfile(cleanSymbol);
    if (cached) {
      console.log(`[FHub REST] Using cached profile for: ${cleanSymbol} no call needed`);
      return cached;
    }

    // Not in cache, schedule through Finnhub rate limiter
    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[FHub REST] Fetching profile from Finnhub API for ${cleanSymbol}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(cleanSymbol)}&token=${encodeURIComponent(apiKey)}`
        );

        if (!res.ok) {
          console.log(`[FHub REST] Failed to fetch profile for ${cleanSymbol}, HTTP ${res.status}`);
          return null;
        }
        console.log(`[FHub REST] Successfully fetched profile for ${cleanSymbol} from Finnhub API`);

        const data = await res.json();
        if (!data || !data.name) {
          return null;
        }

        const rawLogo = data.logo;
        let localLogoUri = null;
        // Always override the logo if a raw logo URL is provided 
        if (rawLogo) {
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

        // Save to persistent LRU cache
        await storageService.setCachedProfile(cleanSymbol, profile);
        return profile;
      } catch (err) {
        console.log(`[FHub REST] Failed to fetch profile for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },

  // Search Finnhub for US common stocks matching a query (used in cases where the local ticker JSON is not unanimous)
  async searchSymbols(query, apiKey) {
    if (!query || !query.trim() || !apiKey) return [];

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[FHub REST] Searching symbols for: "${query}"`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query.trim())}&token=${encodeURIComponent(apiKey)}&exchange=US`
        );

        if (!res.ok) {
          console.log(`[FHub REST] Failed to search symbols for: "${query}", HTTP ${res.status}`);
          return [];
        }
        const data = await res.json();
        console.log(`[FHub REST] Search results for "${query}":`, data?.result?.length || 0, 'items');

        if (!data || !Array.isArray(data.result)) return [];

        return data.result
          .filter((item) => item.type === 'Common Stock' || !item.type)   // only want Common Stocks
          .map((item) => ({
            symbol: item.symbol,
            displaySymbol: item.displaySymbol || item.symbol,
            name: item.description,
            type: item.type,
          }));
      } catch (err) {
        console.log(`[FHub REST] Search error for query "${query}":`, err.message || err);
        return [];
      }
    });
  },

  // Fetch market holiday list for an exchange
  async fetchMarketHolidays(apiKey, exchange = 'US') {
    if (!apiKey) return null;

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[FHub REST] Fetching market holidays for exchange: ${exchange}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/stock/market-holiday?exchange=${encodeURIComponent(exchange)}&token=${encodeURIComponent(apiKey)}`
        );

        if (!res.ok) {
          console.log(`[FHub REST] Failed to fetch market holidays for exchange: ${exchange}, HTTP ${res.status}`);
          return null;
        }
        console.log(`[FHub REST] Successfully fetched market holidays for exchange: ${exchange}`);

        const data = await res.json();
        return data;
      } catch (err) {
        console.log('[FHub REST] Failed to fetch market holidays:', err.message || err);
        return null;
      }
    });
  },

  // Fetch full stock metrics
  async fetchStockMetrics(symbol, apiKey) {
    if (!symbol) return null;
    const key = apiKey || (await storageService.getApiKey());
    if (!key) return null;

    const cleanSymbol = symbol.trim().toUpperCase();
    const cacheKey = `metrics_${cleanSymbol}`;
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const cached = await persistentLruCache.getJson(cacheKey);
    if (cached) {
      console.log(`[FHub REST] Using cached metrics for: ${cleanSymbol}`);
      return cached;
    }

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[FHub REST] Fetching company metrics for: ${cleanSymbol}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(cleanSymbol)}&metric=all&token=${encodeURIComponent(key)}`
        );

        if (!res.ok) {
          console.log(`[FHub REST] Failed to fetch metrics for ${cleanSymbol}, HTTP ${res.status}`);
          return null;
        }
        console.log(`[FHub REST] Successfully fetched metrics for ${cleanSymbol} from Finnhub API`);

        const data = await res.json();
        const m = data?.metric;
        if (!m) return null;

        // Flatten Finnhub metric fields into a normalised shape
        const metrics = {
          symbol: cleanSymbol,
          ...m,
          marketCap: m.marketCapitalization ?? null,
          avgVolume3M: m['3MonthAverageTradingVolume'] ?? null,
          avgVolume10D: m['10DayAverageTradingVolume'] ?? null,
          fiftyTwoWeekHigh: m['52WeekHigh'] ?? null,
          fiftyTwoWeekLow: m['52WeekLow'] ?? null,
        };

        await persistentLruCache.setJson(cacheKey, metrics, ONE_HOUR_MS);
        return metrics;
      } catch (err) {
        console.log(`[FHub REST] Failed to fetch metrics for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },

  // Fetch recent company news (update every 30 min)
  async fetchCompanyNews(symbol, apiKey) {
    if (!symbol) return [];
    const key = apiKey || (await storageService.getApiKey());
    if (!key) return [];

    const cleanSymbol = symbol.trim().toUpperCase();
    const cacheKey = `news_${cleanSymbol}`;
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    const cached = await persistentLruCache.getJson(cacheKey);
    if (cached && Array.isArray(cached)) {
      console.log(`[FHub REST] Using cached news for: ${cleanSymbol}`);
      return cached;
    }

    // Last-month date window for the news query
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const fromDate = oneMonthAgo.toISOString().split('T')[0];

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[FHub REST] Fetching news for: ${cleanSymbol} (${fromDate} forwards)`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(cleanSymbol)}&from=${fromDate}&&token=${encodeURIComponent(key)}`
        );

        if (!res.ok) {
          console.log(`[FHub REST] Failed to fetch news for ${cleanSymbol}, HTTP ${res.status}`);
          return [];
        }

        const rawNews = await res.json();
        if (!Array.isArray(rawNews)) {
          console.log(`[FHub REST] Unexpected news response for ${cleanSymbol}:`, rawNews);
          return [];
        }

        const articles = rawNews
          .filter((item) => {
            if (!item.headline || !item.url) return false;
            const source = (item.source || '').toLowerCase();
            const headline = (item.headline || '').toLowerCase();
            if (source.includes('chartmill') || headline.includes('chartmill')) {
              return false; // Drop chartmill articles (they are spammy AI or predefined slop)
            }
            return true;
          })
          .slice(0, 6) // cap at 6 items
          .map((item) => ({
            id: item.id || String(item.datetime) + item.headline.slice(0, 10),
            headline: item.headline,
            summary: item.summary || '',
            source: item.source || 'News',
            url: item.url,
            image: item.image || null,
            datetime: item.datetime ? item.datetime * 1000 : Date.now(),
          }));

        if (articles.length > 0) {
          await persistentLruCache.setJson(cacheKey, articles, THIRTY_MINUTES_MS);
        }

        return articles;
      } catch (err) {
        console.log(`[FHub REST] Failed to fetch news for ${cleanSymbol}:`, err.message || err);
        return [];
      }
    });
  },

  // Fetch category market news (update every 30 min)
  async fetchMarketNews(apiKey, category = 'general', forceRefresh = false) {
    const key = apiKey || (await storageService.getApiKey());
    if (!key) return [];

    const cacheKey = `market_news_${category}`;
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    if (!forceRefresh) {
      const cached = await persistentLruCache.getJson(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        console.log(`[FHub REST] Using cached market news for category: ${category}`);
        return cached;
      }
    }

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[FHub REST] Fetching market news for category: ${category}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/news?category=${encodeURIComponent(category)}&token=${encodeURIComponent(key)}`
        );

        if (!res.ok) {
          console.log(`[FHub REST] Failed to fetch market news for category: ${category}, HTTP ${res.status}`);
          return [];
        }

        const rawNews = await res.json();
        if (!Array.isArray(rawNews)) {
          console.log(`[FHub REST] Unexpected market news response for category: ${category}:`, rawNews);
          return [];
        }

        const articles = rawNews
          .filter((item) => {
            if (!item.headline || !item.url) return false;
            const source = (item.source || '').toLowerCase();
            const headline = (item.headline || '').toLowerCase();
            if (source.includes('chartmill') || headline.includes('chartmill')) {
              return false;    // Drop chartmill articles here too
            }
            return true;
          })
          .map((item) => ({
            id: item.id || String(item.datetime) + item.headline.slice(0, 10),
            headline: item.headline,
            summary: item.summary || '',
            source: item.source || 'News',
            url: item.url,
            image: item.image || null,
            datetime: item.datetime ? item.datetime * 1000 : Date.now(),
            category: item.category || category,
          }));

        if (articles.length > 0) {
          await persistentLruCache.setJson(cacheKey, articles, THIRTY_MINUTES_MS);
        }

        return articles;
      } catch (err) {
        console.log('[FHub REST] Failed to fetch market news:', err.message || err);
        return [];
      }
    });
  },
};
