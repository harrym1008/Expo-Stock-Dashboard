import nonStockSecuritiesData from '../constants/nonStockSecurities.json';

// Build lookup maps for fast access by any symbol representation
const nonStockByDisplaySymbol = new Map();
const nonStockByFinnhubSymbol = new Map();
const nonStockByYahooSymbol = new Map();

const ALL_NON_STOCK_SECURITIES = [];

const CATEGORY_TITLES = {
  forex: 'FOREX',
  indices: 'INDICES',
  commodities: 'COMMODITIES',
  bonds: 'BONDS',
  crypto: 'CRYPTO',
};

// Populate maps from categories in nonStockSecurities.json
Object.entries(nonStockSecuritiesData || {}).forEach(([category, list]) => {
  if (Array.isArray(list)) {
    list.forEach((sec) => {
      const item = {
        ...sec,
        category,
        isStock: false,
        symbol: sec.displaySymbol,
        displaySymbol: sec.displaySymbol,
        name: sec.displayName,
        displayName: sec.displayName,
        finnhubSymbol: sec.finnhubSymbol,
        yahooSymbol: sec.yahooSymbol,
        decimals: typeof sec.decimals === 'number' ? sec.decimals : 2,
        currency: sec.currency !== undefined ? sec.currency : '$',
      };

      ALL_NON_STOCK_SECURITIES.push(item);

      if (sec.displaySymbol) {
        nonStockByDisplaySymbol.set(sec.displaySymbol.toUpperCase(), item);
      }
      if (sec.finnhubSymbol) {
        nonStockByFinnhubSymbol.set(sec.finnhubSymbol.toUpperCase(), item);
      }
      if (sec.yahooSymbol) {
        nonStockByYahooSymbol.set(sec.yahooSymbol.toUpperCase(), item);
      }
    });
  }
});

/**
 * Returns security item matching the symbol across display, finnhub, or yahoo formats.
 */
export function getSecurityBySymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;
  const upper = symbol.trim().toUpperCase();
  return (
    nonStockByDisplaySymbol.get(upper) ||
    nonStockByFinnhubSymbol.get(upper) ||
    nonStockByYahooSymbol.get(upper) ||
    null
  );
}

/**
 * Checks if the given symbol belongs to a non-stock security.
 */
export function isNonStockSecurity(symbol) {
  return Boolean(getSecurityBySymbol(symbol));
}

/**
 * Resolves the Yahoo Finance ticker symbol for network calls.
 * E.g., 'EUR/USD' -> 'EURUSD=X', 'US500' -> '^GSPC', 'BRK.B' -> 'BRK-B'
 */
export function getYahooSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return '';
  const sec = getSecurityBySymbol(symbol);
  if (sec?.yahooSymbol) {
    return sec.yahooSymbol;
  }
  return symbol.trim().toUpperCase().replace(/\./g, '-');
}

/**
 * Resolves the Finnhub ticker symbol for WebSocket subscriptions.
 * E.g., 'EUR/USD' -> 'OANDA:EUR_USD', 'BTC' -> 'BINANCE:BTCUSDT', 'AAPL' -> 'AAPL'
 */
export function getFinnhubSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return '';
  const sec = getSecurityBySymbol(symbol);
  if (sec?.finnhubSymbol) {
    return sec.finnhubSymbol;
  }
  return symbol.trim().toUpperCase();
}

/**
 * Resolves the display symbol to show in the app UI.
 * E.g., 'OANDA:EUR_USD' -> 'EUR/USD', 'BINANCE:BTCUSDT' -> 'BTC', 'AAPL' -> 'AAPL'
 */
export function getDisplaySymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return '';
  const sec = getSecurityBySymbol(symbol);
  if (sec?.displaySymbol) {
    return sec.displaySymbol;
  }
  return symbol.trim().toUpperCase();
}

/**
 * Resolves the display name to show in the app UI.
 * E.g., 'EUR/USD' -> 'Euro / US Dollar', 'BTC' -> 'Bitcoin'
 */
export function getDisplayName(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;
  const sec = getSecurityBySymbol(symbol);
  return sec?.displayName || null;
}

/**
 * Resolves the currency prefix string.
 * E.g., Forex -> '', DAX -> '€', US500 -> '$', Stocks -> '$'
 */
export function getCurrency(symbol, fallback = '$') {
  if (!symbol || typeof symbol !== 'string') return fallback;
  const sec = getSecurityBySymbol(symbol);
  if (sec && sec.currency !== undefined) {
    return sec.currency;
  }
  return fallback;
}

/**
 * Resolves the number of decimals to use for a security / price.
 * For non-stock securities: uses explicit `decimals` from JSON.
 * For stocks:
 * - price >= $1.00: 2 d.p.
 * - price < $1.00 and >= $0.10: 3 d.p.
 * - price < $0.10: 4 d.p. (max 4 d.p.)
 */
export function getDecimals(symbol, price = null, explicitDecimals = null) {
  if (typeof explicitDecimals === 'number') {
    return explicitDecimals;
  }
  if (symbol) {
    const sec = getSecurityBySymbol(symbol);
    if (sec && typeof sec.decimals === 'number') {
      return sec.decimals;
    }
  }
  if (price !== null && price !== undefined && typeof price === 'number') {
    const p = Math.abs(price);
    if (p === 0 || p >= 1.0) return 2;
    if (p >= 0.10) return 3;
    return 4;
  }
  return 2;
}

/**
 * Returns all non-stock securities formatted for local search indexing.
 */
export function getAllNonStockSecurities() {
  return ALL_NON_STOCK_SECURITIES;
}

/**
 * Returns non-stock securities grouped by their type and sorted alphabetically within each group.
 */
export function getGroupedNonStockSecurities() {
  const categories = ['forex', 'indices', 'commodities', 'bonds', 'crypto'];
  return categories.map((cat) => {
    const list = nonStockSecuritiesData[cat] || [];
    const items = list.map((sec) => ({
      ...sec,
      category: cat,
      isStock: false,
      symbol: sec.displaySymbol,
      displaySymbol: sec.displaySymbol,
      name: sec.displayName,
      displayName: sec.displayName,
      marketCap: 0,
      decimals: typeof sec.decimals === 'number' ? sec.decimals : 2,
      currency: sec.currency !== undefined ? sec.currency : '$',
    }));
    // Sort alphabetically by displaySymbol
    items.sort((a, b) => a.displaySymbol.localeCompare(b.displaySymbol));
    return {
      title: CATEGORY_TITLES[cat] || cat.toUpperCase(),
      category: cat,
      data: items,
    };
  });
}
