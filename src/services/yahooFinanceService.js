import { yahooRateLimiter } from '../utils/rateLimiter';
import { persistentLruCache } from './persistentLruCache';
import { getMarketSessionStatus } from '../utils/marketHours';
import { getYahooSymbol, getDecimals, getDisplaySymbol } from '../utils/securityUtils';

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

// Global in-memory cache to preserve the latest 1D after-hours and pre-market trade prices across all timeframe queries
const latestKnownAfterHoursPrices = {};
const latestKnownPreMarketPrices = {};
const latestKnownPreviousCloses = {};

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

/**
 * Executes a fetch request with automatic handling for HTTP 429 (Too Many Requests),
 * exponential/header backoff, rate limiter notification, and retries.
 */
async function fetchWithBackoff(url, options = {}, { maxRetries = 2, tag = 'Yahoo Finance' } = {}) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, options);

      if (res.status === 429) {
        let retryAfterSeconds = null;
        if (res.headers?.get) {
          const headerVal = res.headers.get('Retry-After');
          if (headerVal) {
            const parsed = parseInt(headerVal, 10);
            if (!isNaN(parsed) && parsed > 0) {
              retryAfterSeconds = parsed;
            }
          }
        }

        const backoffMs = yahooRateLimiter.handle429(retryAfterSeconds);

        if (attempt < maxRetries) {
          attempt++;
          console.warn(
            `[${tag}] ⚠️ HTTP 429 (Rate Limited). Easing off for ${Math.round(backoffMs)}ms before retry (${attempt}/${maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        } else {
          console.error(
            `[${tag}] ❌ HTTP 429 (Rate Limited). Exhausted all ${maxRetries} retries.`
          );
          return res;
        }
      }

      if (res.ok) {
        yahooRateLimiter.notifySuccess();
      }

      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        const backoffMs = 1000 * attempt;
        console.warn(`[${tag}] Network error (${err.message || err}). Retrying in ${backoffMs}ms (${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw err;
    }
  }
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
    const cleanSymbol = getDisplaySymbol(symbol);
    const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['1D'];
    const cacheKey = `chart_${timeframe}_${cleanSymbol}`;

    // 1. Check persistent 50MB LRU cache first (with boundary-aligned TTL)
    const cached = await persistentLruCache.getJson(cacheKey);
    if (cached && Array.isArray(cached.sparkline) && cached.sparkline.length > 0) {
      if (latestKnownAfterHoursPrices[cleanSymbol] && (!cached.postMarketPrice || Math.abs(cached.postMarketPrice - cached.regularMarketPrice) < 0.000001)) {
        cached.postMarketPrice = latestKnownAfterHoursPrices[cleanSymbol];
        cached.postMarketChange = cached.postMarketPrice - cached.regularMarketPrice;
        cached.postMarketChangePercent = cached.regularMarketPrice !== 0 ? (cached.postMarketChange / cached.regularMarketPrice) * 100 : 0;
      }
      if (latestKnownPreMarketPrices[cleanSymbol] && (!cached.preMarketPrice || Math.abs(cached.preMarketPrice - cached.regularMarketPrice) < 0.000001)) {
        cached.preMarketPrice = latestKnownPreMarketPrices[cleanSymbol];
        cached.preMarketChange = cached.preMarketPrice - cached.regularMarketPrice;
        cached.preMarketChangePercent = cached.regularMarketPrice !== 0 ? (cached.preMarketChange / cached.regularMarketPrice) * 100 : 0;
      }
      if (typeof cached.previousClose === 'number' && cached.previousClose > 0) {
        latestKnownPreviousCloses[cleanSymbol] = cached.previousClose;
      } else if (latestKnownPreviousCloses[cleanSymbol]) {
        cached.previousClose = latestKnownPreviousCloses[cleanSymbol];
      }

      const withLiveOverlay = applyLivePriceOverlay(cached, latestLivePrice);

      if (typeof latestLivePrice === 'number' && latestLivePrice > 0) {
        console.log(
          `[Yahoo Finance] ⚡ Cache HIT (${timeframe} Chart) for ${cleanSymbol} | Overlaid live endmost price: ${latestLivePrice}`
        );
      } else {
        console.log(`[Yahoo Finance] ⚡ Cache HIT (${timeframe} Chart) for ${cleanSymbol} (No network call needed)`);
      }

      return withLiveOverlay;
    }

    // 2. Resolve Yahoo Finance symbol (e.g. EUR/USD -> EURUSD=X, US500 -> ^GSPC, BRK.B -> BRK-B)
    const yahooSymbol = getYahooSymbol(cleanSymbol);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol
    )}?interval=${config.interval}&range=${config.range}&includePrePost=true&events=div%2Csplit`;

    return yahooRateLimiter.schedule(async () => {
      try {
        console.log(
          `[Yahoo Finance] 📈 Fetching fresh ${timeframe} candles (${config.interval} resolution with pre/post) for: ${cleanSymbol} (API symbol: ${yahooSymbol})`
        );
        const requestSentTime = Date.now();
        const res = await fetchWithBackoff(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          },
        }, { tag: `Yahoo Finance ${timeframe} Chart (${cleanSymbol})` });

        if (!res.ok) {
          console.log(`[Yahoo Finance] Failed to fetch chart for ${cleanSymbol} (${yahooSymbol}): HTTP ${res.status}`);
          return null;
        }

        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (!result) return null;

        let meta = result.meta || {};
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
              const price = rawCloses[i];
              const dec = getDecimals(cleanSymbol, price);
              points.push({ time: t, price: Number(price.toFixed(dec)) });
            }
          }
        }

        // Fallback for indices and sessions where 1d has 0 candles yet today (e.g. US indices in pre-market or holidays)
        if (points.length === 0 && (timeframe === '1D' || timeframe === '1H')) {
          console.log(
            `[Yahoo Finance] ℹ️ 0 intraday candles for ${cleanSymbol} (${yahooSymbol}) on ${timeframe}. Fetching 5d fallback for last active session...`
          );
          const fallbackUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            yahooSymbol
          )}?interval=${config.interval}&range=5d&includePrePost=true&events=div%2Csplit`;

          try {
            const fbRes = await fetchWithBackoff(fallbackUrl, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
              },
            }, { tag: `Yahoo Finance 5d Fallback (${cleanSymbol})` });

            if (fbRes.ok) {
              const fbJson = await fbRes.json();
              const fbResult = fbJson?.chart?.result?.[0];
              if (fbResult) {
                meta = { ...fbResult.meta, ...meta, previousClose: fbResult.meta?.previousClose ?? meta.previousClose };
                const fbTimestamps = fbResult.timestamp || [];
                const fbQuotes = fbResult.indicators?.quote?.[0] || {};
                const fbCloses = fbQuotes.close || [];

                if (Array.isArray(fbCloses) && fbCloses.length > 0) {
                  let lastValidTs = null;
                  for (let i = fbCloses.length - 1; i >= 0; i--) {
                    if (typeof fbCloses[i] === 'number' && !isNaN(fbCloses[i]) && fbCloses[i] > 0) {
                      lastValidTs = fbTimestamps[i];
                      break;
                    }
                  }

                  if (lastValidTs) {
                    const lastDateStr = new Date(lastValidTs * 1000).toDateString();
                    for (let i = 0; i < fbCloses.length; i++) {
                      const v = fbCloses[i];
                      const t = (fbTimestamps[i] || 0) * 1000;
                      if (typeof v === 'number' && !isNaN(v) && v > 0) {
                        if (new Date(t).toDateString() === lastDateStr) {
                          const dec = getDecimals(cleanSymbol, v);
                          points.push({ time: t, price: Number(v.toFixed(dec)) });
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.warn(`[Yahoo Finance] 5d fallback fetch failed for ${cleanSymbol}:`, e?.message || e);
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
        const startPrice = prices[0];
        const endmostPrice = prices[prices.length - 1];
        const chartPreviousClose = typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : startPrice;
        let previousClose = typeof meta.previousClose === 'number'
          ? meta.previousClose
          : (timeframe === '1D' || timeframe === '1H'
              ? chartPreviousClose
              : (latestKnownPreviousCloses[cleanSymbol] ?? null));

        if (
          typeof previousClose !== 'number' &&
          typeof meta.regularMarketPrice === 'number' &&
          typeof meta.regularMarketChangePercent === 'number' &&
          meta.regularMarketChangePercent !== -100
        ) {
          const calculatedDec = getDecimals(cleanSymbol, meta.regularMarketPrice);
          const computedPrev = Number(
            (meta.regularMarketPrice / (1 + meta.regularMarketChangePercent / 100)).toFixed(calculatedDec)
          );
          if (typeof computedPrev === 'number' && !isNaN(computedPrev) && computedPrev > 0) {
            previousClose = computedPrev;
          }
        }

        if (typeof previousClose === 'number' && previousClose > 0) {
          latestKnownPreviousCloses[cleanSymbol] = previousClose;
        }
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        // Official regular session close price
        const regularMarketPrice = typeof meta.regularMarketPrice === 'number'
          ? meta.regularMarketPrice
          : endmostPrice;

        // Extract and globally preserve after-hours and pre-market trade prices
        const sessionStatus = getMarketSessionStatus();
        if (timeframe === '1D' || timeframe === '1W' || timeframe === '1H') {
          if (Math.abs(endmostPrice - regularMarketPrice) > 0.000001 && endmostPrice > 0) {
            if (sessionStatus.isPreMarket) {
              latestKnownPreMarketPrices[cleanSymbol] = endmostPrice;
            } else {
              latestKnownAfterHoursPrices[cleanSymbol] = endmostPrice;
            }
          }
        }

        const validMetaPost = typeof meta.postMarketPrice === 'number' && meta.postMarketPrice > 0 ? meta.postMarketPrice : null;
        const validMetaPre = typeof meta.preMarketPrice === 'number' && meta.preMarketPrice > 0 ? meta.preMarketPrice : null;

        let postMarketPrice =
          validMetaPost ||
          latestKnownAfterHoursPrices[cleanSymbol] ||
          (sessionStatus.isPreMarket ? regularMarketPrice : endmostPrice);

        let preMarketPrice =
          validMetaPre ||
          latestKnownPreMarketPrices[cleanSymbol] ||
          (sessionStatus.isPreMarket ? endmostPrice : regularMarketPrice);

        const postMarketChange = postMarketPrice - regularMarketPrice;
        const postMarketChangePercent = regularMarketPrice !== 0 ? (postMarketChange / regularMarketPrice) * 100 : 0;

        const preMarketChange = preMarketPrice - regularMarketPrice;
        const preMarketChangePercent = regularMarketPrice !== 0 ? (preMarketChange / regularMarketPrice) * 100 : 0;

        // Price comparison base: 1D compares against previousClose, 1H/1W/3M/1Y/5Y/ALL compares against startPrice
        const baseComparison = timeframe === '1D' ? (previousClose || chartPreviousClose) : startPrice;
        const priceChange = regularMarketPrice - baseComparison;
        const priceChangePercent = baseComparison !== 0 ? (priceChange / baseComparison) * 100 : 0;

        const lastUpdated = meta.regularMarketTime ? meta.regularMarketTime * 1000 : requestSentTime;
        const firstTradeDate = meta.firstTradeDate ? meta.firstTradeDate * 1000 : (points[0]?.time || null);

        const chartData = {
          symbol: cleanSymbol,
          timeframe,
          currency: meta.currency || 'USD',
          previousClose,
          chartPreviousClose,
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
          `[Yahoo Finance] 💾 Cached ${points.length} candles for ${cleanSymbol} (${timeframe}) | RegClose: ${regularMarketPrice} | Post: ${postMarketPrice} | Aligned TTL: ${ttlSecs}s`
        );

        // 4. Always apply live price overlay if available
        return applyLivePriceOverlay(chartData, latestLivePrice);
      } catch (err) {
        console.log(`[Yahoo Finance] Error fetching data for ${cleanSymbol}:`, err.message || err);
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
      const cookieRes = await fetchWithBackoff('https://fc.yahoo.com', {
        headers: { 'User-Agent': USER_AGENT },
      }, { tag: 'Yahoo Finance Cookie (fc)' });

      let cookie = cookieRes?.headers?.get ? cookieRes.headers.get('set-cookie') : null;
      if (!cookie && typeof cookieRes?.headers?.getSetCookie === 'function') {
        const rawArr = cookieRes.headers.getSetCookie();
        if (Array.isArray(rawArr) && rawArr.length > 0) {
          cookie = rawArr.join('; ');
        }
      }

      if (!cookie) {
        // Fallback request to finance.yahoo.com
        const fallbackRes = await fetchWithBackoff('https://finance.yahoo.com', {
          headers: { 'User-Agent': USER_AGENT },
        }, { tag: 'Yahoo Finance Cookie (finance)' });
        cookie = fallbackRes?.headers?.get ? fallbackRes.headers.get('set-cookie') : null;
      }

      // 2. Fetch crumb using the session cookie
      const crumbRes = await fetchWithBackoff('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': USER_AGENT,
          'Cookie': cookie || '',
        },
      }, { tag: 'Yahoo Finance Crumb (q2)' });

      let crumb = null;
      if (crumbRes && crumbRes.ok) {
        crumb = (await crumbRes.text()).trim();
      }

      // If query2 failed, try query1
      if (!crumb || crumb.includes('<') || crumb.includes('error')) {
        const crumbRes1 = await fetchWithBackoff('https://query1.finance.yahoo.com/v1/test/getcrumb', {
          headers: {
            'User-Agent': USER_AGENT,
            'Cookie': cookie || '',
          },
        }, { tag: 'Yahoo Finance Crumb (q1)' });
        if (crumbRes1 && crumbRes1.ok) {
          crumb = (await crumbRes1.text()).trim();
        }
      }

      if (crumb && !crumb.includes('<') && !crumb.includes('error')) {
        const session = { cookie: cookie || '', crumb };
        await persistentLruCache.setJson(cacheKey, session, ONE_DAY_MS);
        console.log(`[Yahoo Finance] 🔑 Obtained session crumb: ${crumb.slice(0, 4)}...`);
        return session;
      }

      console.log('[Yahoo Finance] Failed to obtain valid crumb from Yahoo Finance');
      return null;
    } catch (err) {
      console.log('[Yahoo Finance] Error getting session cookie/crumb:', err.message || err);
      return null;
    }
  },

  async fetchCompanyDescription(symbol, isRetry = false) {
    if (!symbol) return null;
    const cleanSymbol = getDisplaySymbol(symbol);
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

    const yahooSymbol = getYahooSymbol(cleanSymbol);

    return yahooRateLimiter.schedule(async () => {
      try {
        const session = await this.getSession(isRetry);
        const crumbParam = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
        const cookieHeader = session?.cookie ? { 'Cookie': session.cookie } : {};

        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
          yahooSymbol
        )}?modules=summaryProfile,assetProfile,defaultKeyStatistics,financialData${crumbParam}`;

        console.log(`[Yahoo Finance] 🏢 Fetching company profile/description for: ${cleanSymbol}`);
        const res = await fetchWithBackoff(url, {
          headers: {
            'User-Agent': USER_AGENT,
            ...cookieHeader,
          },
        }, { tag: `Yahoo Finance Profile (${cleanSymbol})` });

        if (res?.status === 401 && !isRetry) {
          console.log(`[Yahoo Finance] 401 for ${cleanSymbol}, refreshing cookie + crumb session and retrying...`);
          return this.fetchCompanyDescription(symbol, true);
        }

        if (!res || !res.ok) {
          console.log(`[Yahoo Finance] Failed to fetch profile summary for ${cleanSymbol}: HTTP ${res?.status}`);
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
        console.log(`[Yahoo Finance] Error fetching description for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },

  /**
   * Fetches the single most recent 1-minute trade/close price for instant order execution.
   * Mirrors: curl -s "https://query1.finance.yahoo.com/v8/finance/chart/SYMBOL?range=1d&interval=1m&includePrePost=true" | jq '.chart.result[0].indicators.quote[0].close | map(select(. != null)) | last'
   */
  async getMostRecentPrice(symbol) {
    if (!symbol) return null;
    const cleanSymbol = getDisplaySymbol(symbol);
    const yahooSymbol = getYahooSymbol(cleanSymbol);
    const dec = getDecimals(cleanSymbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol
    )}?range=1d&interval=1m&includePrePost=true`;

    return yahooRateLimiter.schedule(async () => {
      try {
        console.log(`[Yahoo Finance] ⚡ Fetching most recent price for ${cleanSymbol} (API symbol: ${yahooSymbol})`);
        const res = await fetchWithBackoff(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          },
        }, { tag: `Yahoo Finance Recent Price (${cleanSymbol})` });

        if (!res || !res.ok) {
          console.log(`[Yahoo Finance] Failed to fetch most recent price for ${cleanSymbol}: HTTP ${res?.status}`);
          return null;
        }

        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (!result) return null;

        const rawCloses = result.indicators?.quote?.[0]?.close || [];
        const validCloses = rawCloses.filter(
          (c) => typeof c === 'number' && !isNaN(c) && c > 0
        );

        if (validCloses.length > 0) {
          const lastClose = validCloses[validCloses.length - 1];
          const calculatedDec = getDecimals(cleanSymbol, lastClose, dec);
          return Number(lastClose.toFixed(calculatedDec));
        }

        // Fallback to meta prices
        const meta = result.meta || {};
        const metaPrice = meta.regularMarketPrice ?? meta.previousClose ?? null;
        if (typeof metaPrice === 'number' && metaPrice > 0) {
          const calculatedDec = getDecimals(cleanSymbol, metaPrice, dec);
          return Number(metaPrice.toFixed(calculatedDec));
        }
        return null;
      } catch (err) {
        console.log(`[Yahoo Finance] Error getting most recent price for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },

  /**
   * Fetches a unified stock quote via Yahoo Finance 1D chart/candles.
   * Utilizes boundary-aligned 2m LRU cache to share network calls with chart loading.
   */
  async fetchQuote(symbol) {
    if (!symbol) return null;
    const cleanSymbol = getDisplaySymbol(symbol);
    const chart = await this.fetchHistoricalData(cleanSymbol, '1D');
    if (!chart) return null;

    const sessionStatus = getMarketSessionStatus();
    const effectivePrice = sessionStatus.isOpen
      ? (chart.regularMarketPrice || chart.currentPrice)
      : (sessionStatus.isPreMarket
          ? (chart.preMarketPrice || chart.currentPrice || chart.regularMarketPrice)
          : (chart.postMarketPrice || chart.currentPrice || chart.regularMarketPrice));

    return {
      symbol: cleanSymbol,
      price: effectivePrice,
      regularMarketPrice: chart.regularMarketPrice,
      preMarketPrice: chart.preMarketPrice,
      postMarketPrice: chart.postMarketPrice,
      previousClose: chart.previousClose,
      change: chart.priceChange,
      changePercent: chart.priceChangePercent,
      high: chart.regularMarketDayHigh,
      low: chart.regularMarketDayLow,
      volume: chart.regularMarketVolume,
      sparkline: chart.sparkline,
      timestamp: chart.lastUpdated || Date.now(),
    };
  },
};
