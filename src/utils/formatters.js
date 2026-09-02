/**
 * Unified formatting and stock quote calculation utilities.
 */
import {
  getSecurityBySymbol,
  getCurrency,
  getDecimals,
  getDisplaySymbol,
  getDisplayName,
} from './securityUtils';

/**
 * Formats a monetary value as currency with dynamic or explicit decimals.
 * - Non-stock securities: uses defined decimals in nonStockSecurities.json
 * - Stocks: >= $1.00 -> 2 d.p.; < $1.00 & >= $0.10 -> 3 d.p.; < $0.10 -> 4 d.p. (max 4 d.p.)
 */
export function formatMoney(val, currency = '$', decimals = null, symbol = null) {
  if (val === null || val === undefined || isNaN(val)) return '-';
  const num = Number(val || 0);
  const cur = currency !== undefined && currency !== null ? currency : '$';
  const dec = getDecimals(symbol, num, decimals);
  return `${cur}${num.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}`;
}

/**
 * Formats share counts with clean decimals (e.g. "10.00 shares" or "10.5123 shares").
 */
export function formatShares(val) {
  const num = Number(val || 0);
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return `${formatted} shares`;
}

/**
 * Formats large numbers compactly (e.g. $1.23T, $4.56B, $7.89M, $12.3K).
 */
export function formatLargeNum(num, currency = '') {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '-';
  const abs = Math.abs(num);
  const cur = currency !== undefined && currency !== null ? currency : '';
  if (abs >= 1e12) {
    return `${cur}${(num / 1e12).toFixed(2)}T`;
  }
  if (abs >= 1e9) {
    return `${cur}${(num / 1e9).toFixed(2)}B`;
  }
  if (abs >= 1e6) {
    return `${cur}${(num / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e3) {
    return `${cur}${(num / 1e3).toFixed(1)}K`;
  }
  return `${cur}${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Formats statistical prices (e.g. $123.45, 1.08456, or '-').
 */
export function formatStatPrice(val, currency = '$', decimals = null, symbol = null) {
  if (val === null || val === undefined || isNaN(val) || val === 0) return '-';
  const num = Number(val);
  const cur = currency !== undefined && currency !== null ? currency : '$';
  const dec = getDecimals(symbol, num, decimals);
  return `${cur}${num.toLocaleString(undefined, {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}`;
}

/**
 * Formats elapsed time since a timestamp into human-readable text.
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
    return 'recently';
  }

  const now = Date.now();
  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSeconds < 1) {
    return '0 sec ago';
  }
  if (diffSeconds === 1) {
    return '1 sec ago';
  }
  if (diffSeconds < 60) {
    return `${diffSeconds} secs ago`;
  }

  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  if (days > 0) {
    const dayText = days === 1 ? '1 day' : `${days} days`;
    if (hours > 0) {
      const hrText = hours === 1 ? '1 hr' : `${hours} hrs`;
      return `${dayText} ${hrText} ago`;
    }
    return `${dayText} ago`;
  }

  if (hours > 0) {
    const hrText = hours === 1 ? '1 hr' : `${hours} hrs`;
    if (minutes > 0) {
      const minText = minutes === 1 ? '1 min' : `${minutes} mins`;
      return `${hrText} ${minText} ago`;
    }
    return `${hrText} ago`;
  }

  const minText = minutes === 1 ? '1 min' : `${minutes} mins`;
  if (seconds > 0) {
    const secText = seconds === 1 ? '1 sec' : `${seconds} sec`;
    return `${minText} ${secText} ago`;
  }

  return `${minText} ago`;
}

/**
 * Coalesces live WebSocket quotes, 1D chart data, and profiles for a stock into unified display fields.
 */
export function formatStockQuote(item, liveQuote, liveProfile, y1D, marketStatus) {
  const regularClose = y1D?.regularMarketPrice || item?.price || 0;
  const prevDayClose = y1D?.previousClose || item?.price || 0;

  let displayPrice;
  let displayChange;
  let displayChangePercent;

  if (marketStatus?.isOpen) {
    displayPrice = liveQuote?.price ?? y1D?.price ?? item?.price ?? 0;
    const refClose = prevDayClose || displayPrice;
    displayChange = displayPrice - refClose;
    displayChangePercent = refClose !== 0 ? (displayChange / refClose) * 100 : 0;
  } else {
    const hasLiveWsTrade =
      liveQuote?.isLiveWs &&
      typeof liveQuote?.price === 'number' &&
      Math.abs(liveQuote.price - regularClose) > 0.000001;

    const postPrice =
      (marketStatus?.isPreMarket ? y1D?.preMarketPrice : y1D?.postMarketPrice) ||
      y1D?.postMarketPrice ||
      y1D?.preMarketPrice;

    const hasPostMarketDelta =
      typeof postPrice === 'number' &&
      Math.abs(postPrice - regularClose) > 0.000001;

    if (hasLiveWsTrade) {
      displayPrice = liveQuote.price;
      displayChange = liveQuote.price - regularClose;
      displayChangePercent = regularClose !== 0 ? (displayChange / regularClose) * 100 : 0;
    } else if (hasPostMarketDelta) {
      displayPrice = postPrice;
      displayChange = postPrice - regularClose;
      displayChangePercent = regularClose !== 0 ? (displayChange / regularClose) * 100 : 0;
    } else {
      displayPrice = regularClose;
      displayChange = y1D?.change ?? item?.change ?? 0;
      displayChangePercent = y1D?.changePercent ?? item?.changePercent ?? 0;
    }
  }

  const baseSparkline = y1D?.sparkline || liveQuote?.sparkline || item?.sparkline || [];
  const dynamicSparkline =
    typeof displayPrice === 'number' && baseSparkline.length > 0
      ? [...baseSparkline.slice(0, -1), displayPrice]
      : baseSparkline;

  const sec = getSecurityBySymbol(item?.symbol);
  const displaySymbol = sec?.displaySymbol || item?.displaySymbol || item?.symbol;
  const displayName = sec?.displayName || liveProfile?.name || item?.displayName || item?.name;
  const currency = sec && sec.currency !== undefined
    ? sec.currency
    : (item?.currency !== undefined ? item.currency : '$');
  const decimals = getDecimals(item?.symbol, displayPrice, item?.decimals);
  const isStock = sec ? false : (item?.isStock !== false);

  return {
    ...item,
    symbol: displaySymbol,
    displaySymbol,
    name: displayName,
    displayName,
    currency,
    decimals,
    isStock,
    price: displayPrice,
    postMarketPrice: y1D?.postMarketPrice || displayPrice,
    regularMarketPrice: regularClose,
    change: displayChange,
    changePercent: displayChangePercent,
    exchange: liveProfile?.exchange || item?.exchange || (sec ? sec.category.toUpperCase() : '...'),
    logo: liveProfile?.logo || item?.logo || null,
    sparkline: dynamicSparkline,
    lastUpdated:
      liveQuote?.lastTickTime ||
      liveQuote?.timestamp ||
      y1D?.lastUpdated ||
      item?.lastUpdated,
  };
}
