import { yahooRateLimiter } from '../utils/rateLimiter';
import { persistentLruCache } from './persistentLruCache';

const TIMEFRAME_CONFIG = {
  '1D': { range: '1d', interval: '2m' },
  '1W': { range: '5d', interval: '15m' },
  '3M': { range: '3mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
  'ALL': { range: 'max', interval: '1mo' },
};

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

  // Always update the endmost candle / sparkline value with the latest live price
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
    priceChange,
    priceChangePercent,
    lastUpdated: Date.now(),
    minPrice: Math.min(chartData.minPrice ?? latestLivePrice, latestLivePrice),
    maxPrice: Math.max(chartData.maxPrice ?? latestLivePrice, latestLivePrice),
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
          `[Yahoo Finance] 📈 Fetching fresh ${timeframe} candles (${config.interval} resolution) for: ${cleanSymbol} (API symbol: ${yahooSymbol})`
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
        const currentPrice = prices[prices.length - 1];
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        const baseComparison = timeframe === '1D' ? previousClose : startPrice;
        const priceChange = currentPrice - baseComparison;
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
          currentPrice,
          priceChange,
          priceChangePercent,
          lastUpdated,
          firstTradeDate,
          postMarketPrice: meta.postMarketPrice || null,
          postMarketChange: meta.postMarketChange || null,
          postMarketChangePercent: meta.postMarketChangePercent || null,
          preMarketPrice: meta.preMarketPrice || null,
          preMarketChange: meta.preMarketChange || null,
          preMarketChangePercent: meta.preMarketChangePercent || null,
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
          `[Yahoo Finance] 💾 Cached ${points.length} candles for ${cleanSymbol} (${timeframe}) | Aligned TTL: ${ttlSecs}s (Next candle boundary + 3s)`
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
