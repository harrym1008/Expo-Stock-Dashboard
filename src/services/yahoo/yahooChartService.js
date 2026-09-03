import { yahooRateLimiter } from '../../utils/rateLimiter';
import { persistentLruCache } from '../persistentLruCache';
import { getMarketSessionStatus } from '../../utils/marketHours';
import { getYahooSymbol, getDecimals, getDisplaySymbol } from '../../utils/securityUtils';
import { fetchWithBackoff, MOBILE_USER_AGENT } from './yahooSession';

// Timeframe configuration for Yahoo Finance chart API
export const TIMEFRAME_CONFIG = {
  '1H': { range: '1d', interval: '1m' },
  '1D': { range: '1d', interval: '2m' },
  '1W': { range: '5d', interval: '1h' },
  '3M': { range: '3mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1wk' },
  '5Y': { range: '5y', interval: '1mo' },
  'ALL': { range: '100y', interval: '1mo' },
};

// Milliseconds per interval for boundary-aligned cache TTL calculations
export const BOUNDARY_INTERVALS = {
  '1H': 1 * 60 * 1000,
  '1D': 2 * 60 * 1000,
  '1W': 60 * 60 * 1000,
  '3M': 24 * 60 * 60 * 1000,
  '1Y': 7 * 24 * 60 * 60 * 1000,
  '5Y': 7 * 24 * 60 * 60 * 1000,
  'ALL': 7 * 24 * 60 * 60 * 1000,
};

// Global in-memory cache: latest after-hours/pre-market/close prices across queries
export const latestKnownAfterHoursPrices = {};
export const latestKnownPreMarketPrices = {};
export const latestKnownPreviousCloses = {};

// Calculate cache TTL to expire 3 seconds after the next candle boundary
export function getBoundaryAlignedTtl(timeframe) {
  const now = Date.now();
  const THREE_SECONDS = 3000;
  const intervalMs = BOUNDARY_INTERVALS[timeframe] || 30 * 24 * 60 * 60 * 1000;
  const nextBoundary = Math.ceil(now / intervalMs) * intervalMs;
  const remaining = nextBoundary - now;
  return (remaining <= 0 ? intervalMs : remaining) + THREE_SECONDS;
}

// Overlay a live trade price onto cached chart data
export function applyLivePriceOverlay(chartData, latestLivePrice) {
  if (!chartData || !Array.isArray(chartData.sparkline) || chartData.sparkline.length === 0) {
    return chartData;
  }

  if (typeof latestLivePrice !== 'number' || latestLivePrice <= 0) {
    return chartData;
  }

  const sessionStatus = getMarketSessionStatus();
  const regClose = chartData.regularMarketPrice || chartData.currentPrice;

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
      minPrice: Math.min(chartData.minPrice != null ? chartData.minPrice : latestLivePrice, latestLivePrice),
      maxPrice: Math.max(chartData.maxPrice != null ? chartData.maxPrice : latestLivePrice, latestLivePrice),
    };
  }

  // Market is closed or in extended hours
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

// Fetch historical chart candles (LRU cache -> Yahoo API -> candle normalization -> LRU cache)
export async function fetchHistoricalData(symbol, timeframe = '1D', latestLivePrice = null) {
  if (!symbol) return null;
  const cleanSymbol = getDisplaySymbol(symbol);
  const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['1D'];
  const cacheKey = `chart_${timeframe}_${cleanSymbol}`;

  // Check persistent LRU cache first
  const cached = await persistentLruCache.getJson(cacheKey);
  if (cached && Array.isArray(cached.sparkline) && cached.sparkline.length > 0) {
    if (
      latestKnownAfterHoursPrices[cleanSymbol] &&
      (!cached.postMarketPrice || Math.abs(cached.postMarketPrice - cached.regularMarketPrice) < 0.000001)
    ) {
      cached.postMarketPrice = latestKnownAfterHoursPrices[cleanSymbol];
      cached.postMarketChange = cached.postMarketPrice - cached.regularMarketPrice;
      cached.postMarketChangePercent =
        cached.regularMarketPrice !== 0 ? (cached.postMarketChange / cached.regularMarketPrice) * 100 : 0;
    }
    if (
      latestKnownPreMarketPrices[cleanSymbol] &&
      (!cached.preMarketPrice || Math.abs(cached.preMarketPrice - cached.regularMarketPrice) < 0.000001)
    ) {
      cached.preMarketPrice = latestKnownPreMarketPrices[cleanSymbol];
      cached.preMarketChange = cached.preMarketPrice - cached.regularMarketPrice;
      cached.preMarketChangePercent =
        cached.regularMarketPrice !== 0 ? (cached.preMarketChange / cached.regularMarketPrice) * 100 : 0;
    }
    if (typeof cached.previousClose === 'number' && cached.previousClose > 0) {
      latestKnownPreviousCloses[cleanSymbol] = cached.previousClose;
    } else if (latestKnownPreviousCloses[cleanSymbol]) {
      cached.previousClose = latestKnownPreviousCloses[cleanSymbol];
    }

    const withLiveOverlay = applyLivePriceOverlay(cached, latestLivePrice);

    if (typeof latestLivePrice === 'number' && latestLivePrice > 0) {
      console.log(
        `[Yahoo Fin] Cache HIT (${timeframe} Chart) for ${cleanSymbol}... overlaid live endmost price: ${latestLivePrice}`
      );
    } else {
      console.log(`[Yahoo Fin] Cache HIT (${timeframe} Chart) for ${cleanSymbol}`);
    }

    return withLiveOverlay;
  }

  const yahooSymbol = getYahooSymbol(cleanSymbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?interval=${config.interval}&range=${config.range}&includePrePost=true&events=div%2Csplit`;

  return yahooRateLimiter.schedule(async () => {
    try {
      console.log(
        `[Yahoo Fin] Fetching fresh ${timeframe} candles (${config.interval} resolution with pre/post) for: ${cleanSymbol} (API symbol: ${yahooSymbol})`
      );
      const requestSentTime = Date.now();
      const res = await fetchWithBackoff(
        url,
        { headers: { 'User-Agent': MOBILE_USER_AGENT } },
        { tag: `Yahoo Finance ${timeframe} Chart (${cleanSymbol})` }
      );

      if (!res.ok) {
        console.log(`[Yahoo Fin] Failed to fetch chart for ${cleanSymbol} (${yahooSymbol}): HTTP ${res.status}`);
        return null;
      }

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) return null;

      let meta = result.meta || {};
      const rawTimestamps = result.timestamp || [];
      const rawQuotes = result.indicators?.quote?.[0] || {};
      const rawCloses = rawQuotes.close || [];

      // Filter valid positive close prices
      let points = [];
      if (Array.isArray(rawCloses) && rawCloses.length > 0) {
        const validIndices = [];
        for (let i = 0; i < rawCloses.length; i++) {
          if (rawCloses[i] > 0) validIndices.push(i);
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

      // Fallback for sessions with 0 intraday candles (pre-market/holidays)
      if (points.length === 0 && (timeframe === '1D' || timeframe === '1H')) {
        console.log(
          `[Yahoo Fin] 0 intraday candles for ${cleanSymbol} (${yahooSymbol}) on ${timeframe}. Fetching 5d fallback for last active session...`
        );
        const fallbackUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          yahooSymbol
        )}?interval=${config.interval}&range=5d&includePrePost=true&events=div%2Csplit`;

        try {
          const fbRes = await fetchWithBackoff(
            fallbackUrl,
            { headers: { 'User-Agent': MOBILE_USER_AGENT } },
            { tag: `Yahoo Finance 5d Fallback (${cleanSymbol})` }
          );

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
                  if (fbCloses[i] > 0) {
                    lastValidTs = fbTimestamps[i];
                    break;
                  }
                }

                if (lastValidTs) {
                  const lastDateStr = new Date(lastValidTs * 1000).toDateString();
                  for (let i = 0; i < fbCloses.length; i++) {
                    const v = fbCloses[i];
                    const t = (fbTimestamps[i] || 0) * 1000;
                    if (v > 0 && new Date(t).toDateString() === lastDateStr) {
                      const dec = getDecimals(cleanSymbol, v);
                      points.push({ time: t, price: Number(v.toFixed(dec)) });
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn(`[Yahoo Fin] 5d fallback fetch failed for ${cleanSymbol}:`, e?.message || e);
        }
      }

      if (points.length === 0) return null;

      // Slice to the last 60 minutes for 1H timeframe
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

      // Resolve previous close
      let previousClose =
        typeof meta.previousClose === 'number'
          ? meta.previousClose
          : timeframe === '1D' || timeframe === '1H'
          ? chartPreviousClose
          : (latestKnownPreviousCloses[cleanSymbol] ?? null);

      // Derive previous close from price and change percent if still unknown
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
        if (computedPrev > 0) {
          previousClose = computedPrev;
        }
      }

      if (previousClose > 0) {
        latestKnownPreviousCloses[cleanSymbol] = previousClose;
      }
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      const regularMarketPrice = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : endmostPrice;

      // Track extended hours trade prices
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

      // Base comparison: 1D vs previousClose, others vs startPrice
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
        regularMarketVolume:
          typeof meta.regularMarketVolume === 'number'
            ? meta.regularMarketVolume
            : rawQuotes.volume
            ? rawQuotes.volume.reduce((a, b) => a + (b || 0), 0)
            : null,
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

      // Persist to LRU cache with boundary-aligned TTL
      const alignedTtl = getBoundaryAlignedTtl(timeframe);
      persistentLruCache.setJson(cacheKey, chartData, alignedTtl).catch(() => {});

      const ttlSecs = Math.round(alignedTtl / 1000);
      console.log(
        `[Yahoo Fin] Cached ${points.length} candles for ${cleanSymbol} (${timeframe}) | RegClose: ${regularMarketPrice} | Post: ${postMarketPrice} | Aligned TTL: ${ttlSecs}s`
      );

      return applyLivePriceOverlay(chartData, latestLivePrice);
    } catch (err) {
      console.log(`[Yahoo Fin] Error fetching data for ${cleanSymbol}:`, err.message || err);
      return null;
    }
  });
}
