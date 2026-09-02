// Non-stock securities lookup table, loaded from JSON
import nonStockSecuritiesData from '../constants/nonStockSecurities.json';

// Fast symbol to security maps, one per symbol variant
const nonStockByDisplaySymbol = new Map();
const nonStockByFinnhubSymbol = new Map();
const nonStockByYahooSymbol = new Map();

// Flat list of all non-stock securities (for search indexing)
const ALL_NON_STOCK_SECURITIES = [];

// Human-readable uppercase titles for grouping non-stocks by category
const CATEGORY_TITLES = {
  forex: 'FOREIGN EXCHANGE',
  indices: 'MARKET INDICES',
  commodities: 'COMMODITIES',
  bonds: 'GOVT. BONDS',
  crypto: 'CRYPTOCURRENCIES',
};

// Load the JSON data into the maps and flat array
Object.entries(nonStockSecuritiesData || {}).forEach(([category, list]) => {
  if (Array.isArray(list)) {
    list.forEach((sec) => {
      const item = {
        ...sec,
        category, 
        isStock: false,   // All entries are non-stocks
        symbol: sec.displaySymbol,
        displaySymbol: sec.displaySymbol,
        name: sec.displayName,
        displayName: sec.displayName,
        finnhubSymbol: sec.finnhubSymbol,
        yahooSymbol: sec.yahooSymbol,
        decimals: typeof sec.decimals === 'number' ? sec.decimals : 2,
        currency: sec.currency ?? '$',
      };

      ALL_NON_STOCK_SECURITIES.push(item);

      // Index under each symbol variant for cross-format lookup
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

// Look up security item by any of its symbol forms
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

// True when symbol maps to a non-stock
export function isNonStockSecurity(symbol) {
  return Boolean(getSecurityBySymbol(symbol));
}

// Resolve Yahoo Finance API ticker
export function getYahooSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return '';
  const sec = getSecurityBySymbol(symbol);
  if (sec?.yahooSymbol) {
    return sec.yahooSymbol;
  }
  // Stocks: uppercase, turn dots into dashes
  // Example = Berkshire Hathaway (BRK.A) -> BRK-A
  return symbol.trim().toUpperCase().replace(/\./g, '-');
}

// Resolve Finnhub API ticker
export function getFinnhubSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return '';
  const sec = getSecurityBySymbol(symbol);
  if (sec?.finnhubSymbol) {
    return sec.finnhubSymbol;
  }
  return symbol.trim().toUpperCase();
}

// Resolve the symbol shown in the UI
export function getDisplaySymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return '';
  const sec = getSecurityBySymbol(symbol);
  if (sec?.displaySymbol) {
    return sec.displaySymbol;
  }
  return symbol.trim().toUpperCase();
}

// Resolve the human-readable security name
export function getDisplayName(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;
  const sec = getSecurityBySymbol(symbol);
  return sec?.displayName || null;
}

// Currency prefix for a security
export function getCurrency(symbol, fallback = '$') {
  if (!symbol || typeof symbol !== 'string') return fallback;
  const sec = getSecurityBySymbol(symbol);
  return sec?.currency ?? fallback;
}

// Get the decimal count for a price
export function getDecimals(symbol, price = null, explicitDecimals = null) {
  // Caller overridden
  if (typeof explicitDecimals === 'number') {
    return explicitDecimals;
  }
  // Non-stock with predetermined number of decimals in JSON
  if (symbol) {
    const sec = getSecurityBySymbol(symbol);
    if (sec && typeof sec.decimals === 'number') {
      return sec.decimals;
    }
  }
  // Stocks... show more decimals for smaller prices, fewer for larger prices
  if (typeof price === 'number') {
    const p = Math.abs(price);
    if (p === 0 || p >= 1.0) return 2;
    if (p >= 0.10) return 3;
    return 4;
  }
  return 2;
}

// All non-stock securities as a flat array
export function getAllNonStockSecurities() {
  return ALL_NON_STOCK_SECURITIES;
}

// Non-stocks grouped by category
export function getGroupedNonStockSecurities() {
  const categories = [
    'indices', 
    'commodities',
    'bonds', 
    'forex', 
    'crypto',
  ];
  return categories.map((cat) => {
    const list = nonStockSecuritiesData[cat] || [];
    // Re-shape entries to match the normalized security shape
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
