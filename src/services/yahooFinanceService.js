import { yahooRateLimiter } from '../utils/rateLimiter';
import { persistentLruCache } from './persistentLruCache';
import { getMarketSessionStatus } from '../utils/marketHours';

const TIMEFRAME_CONFIG = {
  '1D': { range: '1d', interval: '2m' },
  '1W': { range: '5d', interval: '15m' },
  '3M': { range: '3mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
  'ALL': { range: 'max', interval: '1mo' },
};

// Global in-memory cache to preserve the latest 1D after-hours trade price across all timeframe queries
const latestKnownAfterHoursPrices = {};

/**
 * Calculates cache TTL to expire exactly 3 seconds after the next candle boundary.
 * e.g. For 1D (2m candles): at 2:29:15, expires at 2:30:03 (+48s TTL).
 */
export function getBoundaryAlignedTtl(timeframe) {
  const now = Date.now();
  const THREE_SECONDS = 3000;

  switch (timeframe) {
    case '1D': {
      const intervalMs = 2 * 60 * 1000;
      const nextBoundary = Math.ceil(now / intervalMs) * intervalMs;
      const remaining = nextBoundary - now;
      return (remaining <= 0 ? intervalMs : remaining) + THREE_SECONDS;
    }
    case '1W': {
      const intervalMs = 15 * 60 * 1000;
      const nextBoundary = Math.ceil(now / intervalMs) * intervalMs;
      const remaining = nextBoundary - now;
      return (remaining <= 0 ? intervalMs : remaining) + THREE_SECONDS;
    }
    case '3M':
    case '1Y': {
      const intervalMs = 24 * 60 * 60 * 1000;
      const nextBoundary = Math.ceil(now / intervalMs) * intervalMs;
      const remaining = nextBoundary - now;
      return (remaining <= 0 ? intervalMs : remaining) + THREE_SECONDS;
    }
    case '5Y': {
      const intervalMs = 7 * 24 * 60 * 60 * 1000;
      const nextBoundary = Math.ceil(now / intervalMs) * intervalMs;
      const remaining = nextBoundary - now;
      return (remaining <= 0 ? intervalMs : remaining) + THREE_SECONDS;
    }
    case 'ALL':
    default: {
      const intervalMs = 30 * 24 * 60 * 60 * 1000;
      const nextBoundary = Math.ceil(now / intervalMs) * intervalMs;
      const remaining = nextBoundary - now;
      return (remaining <= 0 ? intervalMs : remaining) + THREE_SECONDS;
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
  // The left value (regular close) remains FIXED at official close.
  // The right value (out of hours price & delta since close) is updated with the live WebSocket price!
  const outOfHoursDiff = latestLivePrice - regClose;
  const outOfHoursDiffPercent = regClose !== 0 ? (outOfHoursDiff / regClose) * 100 : 0;

  const updatedSparkline = [...chartData.sparkline.slice(0, -1), latestLivePrice];

  return {
    ...chartData,
    sparkline: updatedSparkline,
    lastUpdated: Date.now(),
    currentPrice: latestLivePrice,
    // Update extended session price on the right side
    postMarketPrice: sessionStatus.isPreMarket ? chartData.postMarketPrice : latestLivePrice,
    postMarketChange: sessionStatus.isPreMarket ? chartData.postMarketChange : outOfHoursDiff,
    postMarketChangePercent: sessionStatus.isPreMarket ? chartData.postMarketChangePercent : outOfHoursDiffPercent,
    preMarketPrice: sessionStatus.isPreMarket ? latestLivePrice : chartData.preMarketPrice,
    preMarketChange: sessionStatus.isPreMarket ? outOfHoursDiff : chartData.preMarketChange,
    preMarketChangePercent: sessionStatus.isPreMarket ? outOfHoursDiffPercent : chartData.preMarketChangePercent,
  };
}

export const yahooFinanceService = {
  async fetchHistoricalData(symbol, timeframe = '3M', latestLivePrice = null) {
    if (!symbol) return null;
    const cleanSymbol = symbol.trim().toUpperCase();
    const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['3M'];
    const cacheKey = `chart_${timeframe}_${cleanSymbol}`;

    // 1. Check persistent 128MB LRU cache first (with boundary-aligned TTL)
    const cached = await persistentLruCache.getJson(cacheKey);
    if (cached && Array.isArray(cached.sparkline) && cached.sparkline.length > 0) {
      // Ensure cached data has the globally preserved after-hours price
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
    )}?interval=${config.interval}&range=${config.range}&includePrePost=true`;

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

        const points = [];
        for (let i = 0; i < rawCloses.length; i++) {
          const val = rawCloses[i];
          if (typeof val === 'number' && !isNaN(val) && val > 0) {
            points.push({
              time: (rawTimestamps[i] || 0) * 1000,
              price: Number(val.toFixed(2)),
            });
          }
        }

        if (points.length === 0) return null;

        const prices = points.map((p) => p.price);
        const previousClose = meta.previousClose || meta.chartPreviousClose || prices[0];
        const startPrice = prices[0];
        const endmostPrice = prices[prices.length - 1];
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        // Official regular session close price (e.g. 345.82 for TSLA, 209.66 for NVDA)
        const regularMarketPrice = typeof meta.regularMarketPrice === 'number'
          ? meta.regularMarketPrice
          : endmostPrice;

        // Extract and globally preserve after-hours trade prices
        if (timeframe === '1D' || timeframe === '1W') {
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

        // Regular session intraday priceChange relative to previousClose
        const baseComparison = timeframe === '1D' ? previousClose : startPrice;
        const priceChange = regularMarketPrice - baseComparison;
        const priceChangePercent = baseComparison !== 0 ? (priceChange / baseComparison) * 100 : 0;

        // Use meta market timestamp or request sent timestamp
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

        // 3. Save to persistent 128MB LRU cache with boundary-aligned TTL (+3s after next candle)
        const alignedTtl = getBoundaryAlignedTtl(timeframe);
        await persistentLruCache.setJson(cacheKey, chartData, alignedTtl);

        const ttlSecs = Math.round(alignedTtl / 1000);
        console.log(
          `[Yahoo Finance] 💾 Cached ${points.length} candles for ${cleanSymbol} (${timeframe}) | RegClose: $${regularMarketPrice} | Post: $${postMarketPrice} (${postMarketChange >= 0 ? '+' : ''}${postMarketChange.toFixed(2)}) | Aligned TTL: ${ttlSecs}s`
        );

        // 4. Always apply live price overlay if available
        return applyLivePriceOverlay(chartData, latestLivePrice);
      } catch (err) {
        console.warn(`[Yahoo Finance] Error fetching data for ${cleanSymbol}:`, err.message || err);
        return null;
      }
    });
  },
};
