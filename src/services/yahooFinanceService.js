import { yahooRateLimiter } from '../utils/rateLimiter';
import { persistentLruCache } from './persistentLruCache';
import { getMarketSessionStatus } from '../utils/marketHours';

const TIMEFRAME_CONFIG = {
  '1H': { range: '1d', interval: '1m' },
  '1D': { range: '1d', interval: '2m' },
  '1W': { range: '5d', interval: '1h' },
  '3M': { range: '3mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1wk' },
  '5Y': { range: '5y', interval: '1mo' },
  'ALL': { range: '100y', interval: '1mo' },
};

const BOUNDARY_INTERVALS = {
  '1H': 1 * 60 * 1000,
  '1D': 2 * 60 * 1000,
  '1W': 60 * 60 * 1000,
  '3M': 24 * 60 * 60 * 1000,
  '1Y': 7 * 24 * 60 * 60 * 1000,
};

// Global in-memory cache to preserve the latest 1D after-hours trade price across all timeframe queries
const latestKnownAfterHoursPrices = {};

/**
 * Calculates cache TTL to expire exactly 3 seconds after the next candle boundary.
 * e.g. For 1H (1m candles): at 2:29:15, expires at 2:30:03 (+48s TTL).
 * e.g. For 1D (2m candles): at 2:29:15, expires at 2:30:03 (+48s TTL).
 */
export function getBoundaryAlignedTtl(timeframe) {
  const now = Date.now();
  const THREE_SECONDS = 3000;
  const intervalMs = BOUNDARY_INTERVALS[timeframe] || 30 * 24 * 60 * 60 * 1000;
  const nextBoundary = Math.ceil(now / intervalMs) * intervalMs;
  const remaining = nextBoundary - now;
  return (remaining <= 0 ? intervalMs : remaining) + THREE_SECONDS;
}

function applyLivePriceOverlay(chartData, latestLivePrice) {
  if (!chartData || !Array.isArray(chartData.sparkline) || chartData.sparkline.length === 0) {
    return chartData;
  }

  if (typeof latestLivePrice !== 'number' || latestLivePrice <= 0) {
    return chartData;
  }

  const sessionStatus = getMarketSessionStatus();
  const regClose = chartData.regularMarketPrice || chartData.currentPrice;

  // 1. If Market is OPEN: Update regular session price, left-hand calculations, and endmost sparkline
  if (sessionStatus.isOpen) {
    const updatedSparkline = [...chartData.sparkline.slice(0, -1), latestLivePrice];
    const startPrice = updatedSparkline[0] || latestLivePrice;
    const baseComparison = chartData.timeframe === '1D' ? (chartData.previousClose || startPrice) : startPrice;

    const priceChange = latestLivePrice - baseComparison;
    const priceChangePercent = baseComparison !== 0 ? (priceChange / baseComparison) * 100 : 0;

    const updatedPoints = Array.isArray(chartData.points) && chartData.points.length > 0
      ? [
          ...chartData.points.slice(0, -1),
          {
            time: Date.now(),
            price: latestLivePrice,
          },
        ]
      : chartData.points;

    return {
      ...chartData,
      sparkline: updatedSparkline,
      points: updatedPoints,
      currentPrice: latestLivePrice,
      regularMarketPrice: latestLivePrice,
      priceChange,
      priceChangePercent,
      lastUpdated: Date.now(),
      minPrice: Math.min(chartData.minPrice ?? latestLivePrice, latestLivePrice),
      maxPrice: Math.max(chartData.maxPrice ?? latestLivePrice, latestLivePrice),
    };
  }

  // 2. If Market is CLOSED / PRE-MARKET / AFTER-HOURS:
  const outOfHoursDiff = latestLivePrice - regClose;
  const outOfHoursDiffPercent = regClose !== 0 ? (outOfHoursDiff / regClose) * 100 : 0;

  const updatedSparkline = [...chartData.sparkline.slice(0, -1), latestLivePrice];

  return {
    ...chartData,
    sparkline: updatedSparkline,
    lastUpdated: Date.now(),
    currentPrice: latestLivePrice,
    postMarketPrice: sessionStatus.isPreMarket ? chartData.postMarketPrice : latestLivePrice,
    postMarketChange: sessionStatus.isPreMarket ? chartData.postMarketChange : outOfHoursDiff,
    postMarketChangePercent: sessionStatus.isPreMarket ? chartData.postMarketChangePercent : outOfHoursDiffPercent,
    preMarketPrice: sessionStatus.isPreMarket ? latestLivePrice : chartData.preMarketPrice,
    preMarketChange: sessionStatus.isPreMarket ? outOfHoursDiff : chartData.preMarketChange,
    preMarketChangePercent: sessionStatus.isPreMarket ? outOfHoursDiffPercent : chartData.preMarketChangePercent,
  };
}

export const yahooFinanceService = {
  async fetchHistoricalData(symbol, timeframe = '1D', latestLivePrice = null) {
    if (!symbol) return null;
    const cleanSymbol = symbol.trim().toUpperCase();
    const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['1D'];
    const cacheKey = `chart_${timeframe}_${cleanSymbol}`;

    // 1. Check persistent 50MB LRU cache first (with boundary-aligned TTL)
    const cached = await persistentLruCache.getJson(cacheKey);
    if (cached && Array.isArray(cached.sparkline) && cached.sparkline.length > 0) {
      if (latestKnownAfterHoursPrices[cleanSymbol] && (!cached.postMarketPrice || Math.abs(cached.postMarketPrice - cached.regularMarketPrice) < 0.001)) {
        cached.postMarketPrice = latestKnownAfterHoursPrices[cleanSymbol];
        cached.postMarketChange = cached.postMarketPrice - cached.regularMarketPrice;
        cached.postMarketChangePercent = cached.regularMarketPrice !== 0 ? (cached.postMarketChange / cached.regularMarketPrice) * 100 : 0;
      }

      const withLiveOverlay = applyLivePriceOverlay(cached, latestLivePrice);

      if (typeof latestLivePrice === 'number' && latestLivePrice > 0) {
        console.log(
          `[Yahoo Finance] ⚡ Cache HIT (${timeframe} Chart) for ${cleanSymbol} | Overlaid live endmost price: $${latestLivePrice.toFixed(2)}`
        );
      } else {
        console.log(`[Yahoo Finance] ⚡ Cache HIT (${timeframe} Chart) for ${cleanSymbol} (No network call needed)`);
      }

      return withLiveOverlay;
    }

    // 2. Normalize ticker for Yahoo Finance (e.g. BRK.B -> BRK-B, BF.B -> BF-B)
    const yahooSymbol = cleanSymbol.replace(/\./g, '-');

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol
    )}?interval=${config.interval}&range=${config.range}&includePrePost=true&events=div%2Csplit`;

    return yahooRateLimiter.schedule(async () => {
      try {
        console.log(
          `[Yahoo Finance] 📈 Fetching fresh ${timeframe} candles (${config.interval} resolution with pre/post) for: ${cleanSymbol} (API symbol: ${yahooSymbol})`
        );
        const requestSentTime = Date.now();
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          },
        });

        if (!res.ok) {
          console.warn(`[Yahoo Finance] Failed to fetch chart for ${cleanSymbol} (${yahooSymbol}): HTTP ${res.status}`);
          return null;
        }

        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (!result) return null;

        const meta = result.meta || {};
        const rawTimestamps = result.timestamp || [];
        const rawQuotes = result.indicators?.quote?.[0] || {};
        const rawCloses = rawQuotes.close || [];

        let points = [];
        if (Array.isArray(rawCloses) && rawCloses.length > 0) {
          const validIndices = [];
          for (let i = 0; i < rawCloses.length; i++) {
            const v = rawCloses[i];
            if (typeof v === 'number' && !isNaN(v) && v > 0) validIndices.push(i);
          }
          if (validIndices.length > 0) {
            for (const i of validIndices) {
              const t = (rawTimestamps[i] || 0) * 1000;
              let price = rawCloses[i];
              points.push({ time: t, price: Number(price.toFixed(2)) });
            }
          }
        }

        if (points.length === 0) return null;

        // For 1H timeframe: Slice to the last 60 minutes of trades
        if (timeframe === '1H') {
          const lastPointTime = points[points.length - 1]?.time || Date.now();
          const oneHourAgo = lastPointTime - 60 * 60 * 1000;
          const filtered = points.filter((p) => p.time >= oneHourAgo);
          points = filtered.length >= 10 ? filtered : points.slice(-60);
        }

        const prices = points.map((p) => p.price);
        const previousClose = meta.previousClose || meta.chartPreviousClose || prices[0];
        const startPrice = prices[0];
        const endmostPrice = prices[prices.length - 1];
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        // Official regular session close price
        const regularMarketPrice = typeof meta.regularMarketPrice === 'number'
          ? meta.regularMarketPrice
          : endmostPrice;

        // Extract and globally preserve after-hours trade prices
        if (timeframe === '1D' || timeframe === '1W' || timeframe === '1H') {
          if (Math.abs(endmostPrice - regularMarketPrice) > 0.001) {
            latestKnownAfterHoursPrices[cleanSymbol] = endmostPrice;
          }
        }

        let postMarketPrice =
          latestKnownAfterHoursPrices[cleanSymbol] ||
          (typeof meta.postMarketPrice === 'number' ? meta.postMarketPrice : endmostPrice);

        let preMarketPrice =
          latestKnownAfterHoursPrices[cleanSymbol] ||
          (typeof meta.preMarketPrice === 'number' ? meta.preMarketPrice : endmostPrice);

        const postMarketChange = postMarketPrice - regularMarketPrice;
        const postMarketChangePercent = regularMarketPrice !== 0 ? (postMarketChange / regularMarketPrice) * 100 : 0;

        const preMarketChange = preMarketPrice - regularMarketPrice;
        const preMarketChangePercent = regularMarketPrice !== 0 ? (preMarketChange / regularMarketPrice) * 100 : 0;

        // Price comparison base: 1D compares against previousClose, 1H/1W/3M/1Y/5Y/ALL compares against startPrice
        const baseComparison = timeframe === '1D' ? previousClose : startPrice;
        const priceChange = regularMarketPrice - baseComparison;
        const priceChangePercent = baseComparison !== 0 ? (priceChange / baseComparison) * 100 : 0;

        const lastUpdated = meta.regularMarketTime ? meta.regularMarketTime * 1000 : requestSentTime;
        const firstTradeDate = meta.firstTradeDate ? meta.firstTradeDate * 1000 : (points[0]?.time || null);

        const chartData = {
          symbol: cleanSymbol,
          timeframe,
          currency: meta.currency || 'USD',
          previousClose,
          startPrice,
          currentPrice: endmostPrice,
          regularMarketPrice,
          regularMarketDayHigh: typeof meta.regularMarketDayHigh === 'number' ? meta.regularMarketDayHigh : maxPrice,
          regularMarketDayLow: typeof meta.regularMarketDayLow === 'number' ? meta.regularMarketDayLow : minPrice,
          regularMarketVolume: typeof meta.regularMarketVolume === 'number' ? meta.regularMarketVolume : (rawQuotes.volume ? rawQuotes.volume.reduce((a, b) => a + (b || 0), 0) : null),
          fiftyTwoWeekHigh: typeof meta.fiftyTwoWeekHigh === 'number' ? meta.fiftyTwoWeekHigh : null,
          fiftyTwoWeekLow: typeof meta.fiftyTwoWeekLow === 'number' ? meta.fiftyTwoWeekLow : null,
          priceChange,
          priceChangePercent,
          lastUpdated,
          firstTradeDate,
          postMarketPrice,
          postMarketChange,
          postMarketChangePercent,
          preMarketPrice,
          preMarketChange,
          preMarketChangePercent,
          minPrice,
          maxPrice,
          points,
          sparkline: prices,
        };

        // 3. Save to persistent LRU cache with boundary-aligned TTL
        const alignedTtl = getBoundaryAlignedTtl(timeframe);
        // Persist independently of rendering. A slow native database write must
        // not delay an already-completed market-data request reaching the UI.
        persistentLruCache.setJson(cacheKey, chartData, alignedTtl).catch(() => {});

        const ttlSecs = Math.round(alignedTtl / 1000);
        console.log(
          `[Yahoo Finance] 💾 Cached ${points.length} candles for ${cleanSymbol} (${timeframe}) | RegClose: $${regularMarketPrice} | Post: $${postMarketPrice} | Aligned TTL: ${ttlSecs}s`
        );

        // 4. Always apply live price overlay if available
        return applyLivePriceOverlay(chartData, latestLivePrice);
      } catch (err) {
        console.warn(`[Yahoo Finance] Error fetching data for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },

  /**
   * Retrieves or refreshes Yahoo Finance cookie and crumb session auth.
   */
  async getSession(forceRefresh = false) {
    const cacheKey = 'yahoo_auth_session';
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const USER_AGENT =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    if (!forceRefresh) {
      const cached = await persistentLruCache.getJson(cacheKey);
      if (cached && cached.cookie && cached.crumb) {
        return cached;
      }
    }

    try {
      console.log('[Yahoo Finance] 🔑 Fetching fresh session cookie & crumb...');
      // 1. Fetch cookie from fc.yahoo.com
      const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': USER_AGENT },
      });

      let cookie = cookieRes.headers.get('set-cookie');
      if (!cookie && typeof cookieRes.headers.getSetCookie === 'function') {
        const rawArr = cookieRes.headers.getSetCookie();
        if (Array.isArray(rawArr) && rawArr.length > 0) {
          cookie = rawArr.join('; ');
        }
      }

      if (!cookie) {
        // Fallback request to finance.yahoo.com
        const fallbackRes = await fetch('https://finance.yahoo.com', {
          headers: { 'User-Agent': USER_AGENT },
        });
        cookie = fallbackRes.headers.get('set-cookie');
      }

      // 2. Fetch crumb using the session cookie
      const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': USER_AGENT,
          'Cookie': cookie || '',
        },
      });

      let crumb = null;
      if (crumbRes.ok) {
        crumb = (await crumbRes.text()).trim();
      }

      // If query2 failed, try query1
      if (!crumb || crumb.includes('<') || crumb.includes('error')) {
        const crumbRes1 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
          headers: {
            'User-Agent': USER_AGENT,
            'Cookie': cookie || '',
          },
        });
        if (crumbRes1.ok) {
          crumb = (await crumbRes1.text()).trim();
        }
      }

      if (crumb && !crumb.includes('<') && !crumb.includes('error')) {
        const session = { cookie: cookie || '', crumb };
        await persistentLruCache.setJson(cacheKey, session, ONE_DAY_MS);
        console.log(`[Yahoo Finance] 🔑 Obtained session crumb: ${crumb.slice(0, 4)}...`);
        return session;
      }

      console.warn('[Yahoo Finance] Failed to obtain valid crumb from Yahoo Finance');
      return null;
    } catch (err) {
      console.warn('[Yahoo Finance] Error getting session cookie/crumb:', err.message || err);
      return null;
    }
  },

  async fetchCompanyDescription(symbol, isRetry = false) {
    if (!symbol) return null;
    const cleanSymbol = symbol.trim().toUpperCase();
    const cacheKey = `company_desc_${cleanSymbol}`;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const USER_AGENT =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    // 1. Check persistent LRU cache
    const cached = await persistentLruCache.getJson(cacheKey);
    if (cached && (cached.description || cached.sector || cached.industry)) {
      console.log(`[Yahoo Finance] ⚡ Cache HIT for company description: ${cleanSymbol}`);
      return cached;
    }

    const yahooSymbol = cleanSymbol.replace(/\./g, '-');

    return yahooRateLimiter.schedule(async () => {
      try {
        const session = await this.getSession(isRetry);
        const crumbParam = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
        const cookieHeader = session?.cookie ? { 'Cookie': session.cookie } : {};

        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
          yahooSymbol
        )}?modules=summaryProfile,assetProfile,defaultKeyStatistics,financialData${crumbParam}`;

        console.log(`[Yahoo Finance] 🏢 Fetching company profile/description for: ${cleanSymbol}`);
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            ...cookieHeader,
          },
        });

        if (res.status === 401 && !isRetry) {
          console.warn(`[Yahoo Finance] 401 for ${cleanSymbol}, refreshing cookie + crumb session and retrying...`);
          return this.fetchCompanyDescription(symbol, true);
        }

        if (!res.ok) {
          console.warn(`[Yahoo Finance] Failed to fetch profile summary for ${cleanSymbol}: HTTP ${res.status}`);
          return null;
        }

        const json = await res.json();
        const quoteSummary = json?.quoteSummary?.result?.[0];
        const profile = quoteSummary?.summaryProfile || quoteSummary?.assetProfile || {};
        const stats = quoteSummary?.defaultKeyStatistics || {};
        const fin = quoteSummary?.financialData || {};

        const data = {
          symbol: cleanSymbol,
          description: profile.longBusinessSummary || profile.description || '',
          sector: profile.sector || '',
          industry: profile.industry || '',
          website: profile.website || '',
          employees: profile.fullTimeEmployees || null,
          city: profile.city || '',
          state: profile.state || '',
          country: profile.country || '',
          // Financial statistics fallbacks
          peRatio: stats.trailingPE?.raw ?? stats.forwardPE?.raw ?? null,
          forwardPE: stats.forwardPE?.raw ?? null,
          eps: stats.trailingEps?.raw ?? stats.forwardEps?.raw ?? null,
          profitMargin: fin.profitMargins?.raw ? fin.profitMargins.raw * 100 : null,
          beta: stats.beta?.raw ?? null,
          dividendYield: stats.dividendYield?.raw ?? stats.yield?.raw ?? null,
        };

        if (data.description || data.sector || data.industry || data.peRatio) {
          persistentLruCache.setJson(cacheKey, data, SEVEN_DAYS_MS).catch(() => {});
        }

        return data;
      } catch (err) {
        console.warn(`[Yahoo Finance] Error fetching description for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },
};
