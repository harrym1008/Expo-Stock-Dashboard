import { yahooRateLimiter } from '../../utils/rateLimiter';
import { persistentLruCache } from '../persistentLruCache';
import { getMarketSessionStatus } from '../../utils/marketHours';
import { getYahooSymbol, getDecimals, getDisplaySymbol } from '../../utils/securityUtils';
import { getSession, resetSession, fetchWithBackoff, USER_AGENT, MOBILE_USER_AGENT } from './yahooSession';
import { fetchHistoricalData } from './yahooChartService';


// Fetch company profile, description, and key statistics
export async function fetchCompanyDescription(symbol, isRetry = false) {
  if (!symbol) return null;
  const cleanSymbol = getDisplaySymbol(symbol);
  const cacheKey = `company_desc_${cleanSymbol}`;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Check persistent LRU cache first
  const cached = await persistentLruCache.getJson(cacheKey);
  if (cached) {
    if (cached.notFound) return null;
    if (cached.description || cached.sector || cached.industry) {
      console.log(`[Yahoo Fin] Cache HIT for company description: ${cleanSymbol}`);
      return cached;
    }
  }

  const yahooSymbol = getYahooSymbol(cleanSymbol);

  // Resolve auth session outside rate limiter queue to avoid blocking
  const session = await getSession(isRetry);
  const crumbParam = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
  const cookieHeader = session?.cookie ? { Cookie: session.cookie } : {};

  return yahooRateLimiter.schedule(async () => {
    try {
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
        yahooSymbol
      )}?modules=summaryProfile,assetProfile,defaultKeyStatistics,financialData${crumbParam}`;

      console.log(`[Yahoo Fin] Fetching company profile/description for: ${cleanSymbol}`);
      const res = await fetchWithBackoff(
        url,
        {
          headers: {
            'User-Agent': USER_AGENT,
            ...cookieHeader,
          },
        },
        { maxRetries: 1, tag: `Yahoo Finance Profile (${cleanSymbol})` }
      );

      // Refresh session on 401 if not already retried
      if (res?.status === 401 && !isRetry) {
        console.log(`[Yahoo Fin] 401 for ${cleanSymbol}, refreshing cookie + crumb session and retrying...`);
        resetSession();
        return fetchCompanyDescription(symbol, true);
      }

      // Negative cache 404 / missing profiles
      if (!res || !res.ok) {
        console.log(`[Yahoo Fin] Profile not available for ${cleanSymbol}: HTTP ${res?.status}`);
        if (res?.status === 404 || res?.status === 400) {
          persistentLruCache.setJson(cacheKey, { notFound: true }, ONE_DAY_MS).catch(() => {});
        }
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
        peRatio: stats.trailingPE?.raw ?? null,
        forwardPE: stats.forwardPE?.raw ?? null,
        eps: stats.trailingEps?.raw ?? stats.forwardEps?.raw ?? null,
        profitMargin: fin.profitMargins?.raw ? fin.profitMargins.raw * 100 : null,
        beta: stats.beta?.raw ?? null,
        dividendYield: stats.dividendYield?.raw ?? stats.yield?.raw ?? null,
      };

      if (data.description || data.sector || data.industry || data.peRatio) {
        persistentLruCache.setJson(cacheKey, data, SEVEN_DAYS_MS).catch(() => {});
      } else {
        persistentLruCache.setJson(cacheKey, { notFound: true }, ONE_DAY_MS).catch(() => {});
      }

      return data;
    } catch (err) {
      console.log(`[Yahoo Fin] Error fetching description for ${cleanSymbol}:`, err.message || err);
      return null;
    }
  });
}

// Fetch the single most recent 1-minute trade/close price for instant order execution
export async function getMostRecentPrice(symbol) {
  if (!symbol) return null;
  const cleanSymbol = getDisplaySymbol(symbol);
  const yahooSymbol = getYahooSymbol(cleanSymbol);
  const dec = getDecimals(cleanSymbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?range=1d&interval=1m&includePrePost=true`;

  return yahooRateLimiter.schedule(async () => {
    try {
      console.log(`[Yahoo Fin] Fetching most recent price for ${cleanSymbol} (API symbol: ${yahooSymbol})`);
      const res = await fetchWithBackoff(
        url,
        { headers: { 'User-Agent': MOBILE_USER_AGENT } },
        { tag: `Yahoo Finance Recent Price (${cleanSymbol})` }
      );

      if (!res || !res.ok) {
        console.log(`[Yahoo Fin] Failed to fetch most recent price for ${cleanSymbol}: HTTP ${res?.status}`);
        return null;
      }

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) return null;

      const rawCloses = result.indicators?.quote?.[0]?.close || [];
      const validCloses = rawCloses.filter((c) => c > 0);

      if (validCloses.length > 0) {
        const lastClose = validCloses[validCloses.length - 1];
        const calculatedDec = getDecimals(cleanSymbol, lastClose, dec);
        return Number(lastClose.toFixed(calculatedDec));
      }

      // Fallback to meta prices
      const meta = result.meta || {};
      const metaPrice = meta.regularMarketPrice ?? meta.previousClose ?? null;
      if (metaPrice > 0) {
        const calculatedDec = getDecimals(cleanSymbol, metaPrice, dec);
        return Number(metaPrice.toFixed(calculatedDec));
      }
      return null;
    } catch (err) {
      console.log(`[Yahoo Fin] Error getting most recent price for ${cleanSymbol}:`, err.message || err);
      return null;
    }
  });
}

// Fetch a unified stock quote via 1D chart/candles
export async function fetchQuote(symbol) {
  if (!symbol) return null;
  const cleanSymbol = getDisplaySymbol(symbol);
  const chart = await fetchHistoricalData(cleanSymbol, '1D');
  if (!chart) return null;

  const sessionStatus = getMarketSessionStatus();
  const effectivePrice = sessionStatus.isOpen
    ? (chart.regularMarketPrice || chart.currentPrice)
    : sessionStatus.isPreMarket
    ? (chart.preMarketPrice || chart.currentPrice || chart.regularMarketPrice)
    : (chart.postMarketPrice || chart.currentPrice || chart.regularMarketPrice);

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
}
