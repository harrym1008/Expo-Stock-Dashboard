import { storageService } from './storageService';
import { finnhubRateLimiter } from '../utils/rateLimiter';
import { logoService } from './logoService';
import { persistentLruCache } from './persistentLruCache';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export const finnhubRestService = {
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
        console.log(`[Finnhub REST] Failed to fetch profile for ${cleanSymbol}:`, err.message || err);
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
          `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query.trim())}&token=${encodeURIComponent(apiKey)}&exchange=US`
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
        console.log(`[Finnhub REST] Search error for query "${query}":`, err.message || err);
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
        console.log('[Finnhub REST] Failed to fetch market holidays:', err.message || err);
        return null;
      }
    });
  },

  async fetchStockMetrics(symbol, apiKey) {
    if (!symbol) return null;
    const key = apiKey || (await storageService.getApiKey());
    if (!key) return null;

    const cleanSymbol = symbol.trim().toUpperCase();
    const cacheKey = `metrics_${cleanSymbol}`;
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const cached = await persistentLruCache.getJson(cacheKey);
    if (cached) {
      console.log(`[Finnhub REST] ⚡ Using cached metrics for: ${cleanSymbol}`);
      return cached;
    }

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[Finnhub REST] 📊 Fetching metrics for: ${cleanSymbol}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(cleanSymbol)}&metric=all&token=${encodeURIComponent(key)}`
        );

        if (!res.ok) {
          if (res.status === 429) {
            console.log(`[Finnhub REST] ⚠️ 429 Rate limit for metrics: ${cleanSymbol}`);
          }
          return null;
        }

        const data = await res.json();
        const m = data?.metric;
        if (!m) return null;

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
        console.log(`[Finnhub REST] Failed to fetch metrics for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },

  async fetchCompanyNews(symbol, apiKey) {
    if (!symbol) return [];
    const key = apiKey || (await storageService.getApiKey());
    if (!key) return [];

    const cleanSymbol = symbol.trim().toUpperCase();
    const cacheKey = `news_${cleanSymbol}`;
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    const cached = await persistentLruCache.getJson(cacheKey);
    if (cached && Array.isArray(cached)) {
      console.log(`[Finnhub REST] ⚡ Using cached news for: ${cleanSymbol}`);
      return cached;
    }

    const now = new Date();
    const toDate = now.toISOString().split('T')[0];
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const fromDate = oneMonthAgo.toISOString().split('T')[0];

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[Finnhub REST] 📰 Fetching news for: ${cleanSymbol} (${fromDate} to ${toDate})`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(cleanSymbol)}&from=${fromDate}&to=${toDate}&token=${encodeURIComponent(key)}`
        );

        if (!res.ok) return [];
        const rawNews = await res.json();
        if (!Array.isArray(rawNews)) return [];

        const articles = rawNews
          .filter((item) => {
            if (!item.headline || !item.url) return false;
            const source = (item.source || '').toLowerCase();
            const headline = (item.headline || '').toLowerCase();
            if (source.includes('chartmill') || headline.includes('chartmill')) {
              return false;
            }
            return true;
          })
          .slice(0, 6)
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
        console.log(`[Finnhub REST] Failed to fetch news for ${cleanSymbol}:`, err.message || err);
        return [];
      }
    });
  },

  async fetchMarketNews(apiKey, category = 'general', forceRefresh = false) {
    const key = apiKey || (await storageService.getApiKey());
    if (!key) return [];

    const cacheKey = `market_news_${category}`;
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

    if (!forceRefresh) {
      const cached = await persistentLruCache.getJson(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        console.log(`[Finnhub REST] ⚡ Using cached market news for category: ${category}`);
        return cached;
      }
    }

    return finnhubRateLimiter.schedule(async () => {
      try {
        console.log(`[Finnhub REST] 📰 Fetching market news for category: ${category}`);
        const res = await fetch(
          `${FINNHUB_BASE_URL}/news?category=${encodeURIComponent(category)}&token=${encodeURIComponent(key)}`
        );

        if (!res.ok) {
          if (res.status === 429) {
            console.log(`[Finnhub REST] ⚠️ 429 Rate limit reached for market news`);
          }
          return [];
        }

        const rawNews = await res.json();
        if (!Array.isArray(rawNews)) return [];

        const articles = rawNews
          .filter((item) => {
            if (!item.headline || !item.url) return false;
            const source = (item.source || '').toLowerCase();
            const headline = (item.headline || '').toLowerCase();
            if (source.includes('chartmill') || headline.includes('chartmill')) {
              return false;
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
          await persistentLruCache.setJson(cacheKey, articles, FIFTEEN_MINUTES_MS);
        }

        return articles;
      } catch (err) {
        console.log('[Finnhub REST] Failed to fetch market news:', err.message || err);
        return [];
      }
    });
  },
};
