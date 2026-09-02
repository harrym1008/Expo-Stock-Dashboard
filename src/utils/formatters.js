// Currency + stock-quote formatting helpers
import {
  getSecurityBySymbol,
  getDecimals,
} from './securityUtils';

// Shared currency string builder; locale passed per caller to keep existing output
function applyCurrency(num, cur, dec, locale) {
  return `${cur}${num.toLocaleString(locale, {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}`;
}

// Money -> currency string; decimals via getDecimals (explicit > dynamic)
export function formatMoney(val, currency = '$', decimals = null, symbol = null) {
  // NaN/null/undefined -> placeholder dash
  if (val === null || val === undefined || isNaN(val)) return '-';
  const num = Number(val || 0);
  const cur = currency !== undefined && currency !== null ? currency : '$';
  const dec = getDecimals(symbol, num, decimals);
  return applyCurrency(num, cur, dec, 'en-US');
}

// Share count -> "N.NN shares" (2-4 dp)
export function formatShares(val) {
  const num = Number(val || 0);
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return `${formatted} shares`;
}

// Compact large-number format (K/M/B/T)
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

// Stat/odd price formatting; same as formatMoney but suppresses 0 and uses default locale
export function formatStatPrice(val, currency = '$', decimals = null, symbol = null) {
  if (val === null || val === undefined || isNaN(val) || val === 0) return '-';
  const num = Number(val);
  const cur = currency !== undefined && currency !== null ? currency : '$';
  const dec = getDecimals(symbol, num, decimals);
  return applyCurrency(num, cur, dec, undefined);
}

// Human-readable "x ago" from a ms timestamp (granular by magnitude)
export function formatTimeAgo(timestamp) {
  // Invalid/past-zero -> generic "recently"
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

  // Break remainder into days/hours/minutes/seconds
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  // Days first (optionally with hours)
  if (days > 0) {
    const dayText = days === 1 ? '1 day' : `${days} days`;
    if (hours > 0) {
      const hrText = hours === 1 ? '1 hr' : `${hours} hrs`;
      return `${dayText} ${hrText} ago`;
    }
    return `${dayText} ago`;
  }

  // Hours next (optionally with minutes)
  if (hours > 0) {
    const hrText = hours === 1 ? '1 hr' : `${hours} hrs`;
    if (minutes > 0) {
      const minText = minutes === 1 ? '1 min' : `${minutes} mins`;
      return `${hrText} ${minText} ago`;
    }
    return `${hrText} ago`;
  }

  // Minutes last (optionally with seconds)
  const minText = minutes === 1 ? '1 min' : `${minutes} mins`;
  if (seconds > 0) {
    const secText = seconds === 1 ? '1 sec' : `${seconds} sec`;
    return `${minText} ${secText} ago`;
  }

  return `${minText} ago`;
}

// Merge item (watchlist/portfolio row) + live WS quote + live profile + 1D chart
// + market status into one normalized display object (price/change/sparkline/etc.)
export function formatStockQuote(item, liveQuote, liveProfile, y1D, marketStatus) {
  // Tiny "positive number" guard used throughout
  const isPos = (n) => typeof n === 'number' && !isNaN(n) && n > 0;

  // Regular-session close: best available of 1D -> live -> item
  const regularClose =
    (isPos(y1D?.regularMarketPrice) ? y1D.regularMarketPrice : null) ??
    (isPos(liveQuote?.regularMarketPrice) ? liveQuote.regularMarketPrice : null) ??
    (isPos(item?.regularMarketPrice) ? item.regularMarketPrice : null) ??
    (isPos(item?.price) ? item.price : 0);

  // Previous-day close: 1D -> live -> item -> fall back to regularClose
  const prevDayClose =
    (isPos(y1D?.previousClose) ? y1D.previousClose : null) ??
    (isPos(liveQuote?.previousClose) ? liveQuote.previousClose : null) ??
    (isPos(item?.previousClose) ? item.previousClose : null) ??
    regularClose;

  // Display values filled in below depending on market session
  let displayPrice;
  let displayChange;
  let displayChangePercent;

  // Market OPEN: use the live trade price vs previous close
  if (marketStatus?.isOpen) {
    displayPrice =
      (isPos(liveQuote?.price) ? liveQuote.price : null) ??
      (isPos(y1D?.price) ? y1D.price : null) ??
      (isPos(item?.price) ? item.price : null) ??
      regularClose;

    const refClose = prevDayClose || displayPrice;
    displayChange = displayPrice - refClose;
    displayChangePercent = refClose !== 0 ? (displayChange / refClose) * 100 : 0;
  } else {
    // Closed: prefer a real live WS trade if it deviates from close
    const hasLiveWsTrade =
      liveQuote?.isLiveWs &&
      isPos(liveQuote?.price) &&
      Math.abs(liveQuote.price - regularClose) > 0.000001;

    // Pull pre/post-market prices from any source
    const prePrice =
      (isPos(y1D?.preMarketPrice) ? y1D.preMarketPrice : null) ??
      (isPos(liveQuote?.preMarketPrice) ? liveQuote.preMarketPrice : null) ??
      (isPos(item?.preMarketPrice) ? item.preMarketPrice : null);

    const postPrice =
      (isPos(y1D?.postMarketPrice) ? y1D.postMarketPrice : null) ??
      (isPos(liveQuote?.postMarketPrice) ? liveQuote.postMarketPrice : null) ??
      (isPos(item?.postMarketPrice) ? item.postMarketPrice : null);

    // Pre-market session shows pre-price first, else post-price
    const extendedPrice = marketStatus?.isPreMarket
      ? (prePrice ?? postPrice)
      : (postPrice ?? prePrice);

    // Whether extended-hours price actually moved off the regular close
    const hasExtendedDelta =
      isPos(extendedPrice) &&
      regularClose > 0 &&
      Math.abs(extendedPrice - regularClose) > 0.000001;

    // Priority: live WS trade > extended-hours price > stale regular close
    if (hasLiveWsTrade) {
      displayPrice = liveQuote.price;
      displayChange = liveQuote.price - regularClose;
      displayChangePercent = regularClose !== 0 ? (displayChange / regularClose) * 100 : 0;
    } else if (hasExtendedDelta) {
      displayPrice = extendedPrice;
      displayChange = extendedPrice - regularClose;
      displayChangePercent = regularClose !== 0 ? (displayChange / regularClose) * 100 : 0;
    } else {
      displayPrice = regularClose;
      displayChange = y1D?.change ?? item?.change ?? (regularClose - prevDayClose);
      displayChangePercent =
        y1D?.changePercent ??
        item?.changePercent ??
        (prevDayClose !== 0 ? ((regularClose - prevDayClose) / prevDayClose) * 100 : 0);
    }
  }

  // Live price replaces last sparkline point so the tail tracks current price
  const baseSparkline = y1D?.sparkline || liveQuote?.sparkline || item?.sparkline || [];
  const dynamicSparkline =
    isPos(displayPrice) && baseSparkline.length > 0
      ? [...baseSparkline.slice(0, -1), displayPrice]
      : baseSparkline;

  // Resolve security identity/name/currency/decimals from non-stock table if present
  const sec = getSecurityBySymbol(item?.symbol);
  const displaySymbol = sec?.displaySymbol || item?.displaySymbol || item?.symbol;
  const displayName = sec?.displayName || liveProfile?.name || item?.displayName || item?.name;
  const currency = sec && sec.currency !== undefined
    ? sec.currency
    : (item?.currency !== undefined ? item.currency : '$');
  const decimals = getDecimals(item?.symbol, displayPrice, item?.decimals);
  const isStock = sec ? false : (item?.isStock !== false);

  // Pre-market price: prefer 1D/live, else live price during pre-market session
  const resolvedPreMarket =
    (isPos(y1D?.preMarketPrice) ? y1D.preMarketPrice : null) ??
    (isPos(liveQuote?.preMarketPrice) ? liveQuote.preMarketPrice : null) ??
    (marketStatus?.isPreMarket && isPos(displayPrice) ? displayPrice : null);

  // Post-market price: prefer 1D/live, else live price when fully closed
  const resolvedPostMarket =
    (isPos(y1D?.postMarketPrice) ? y1D.postMarketPrice : null) ??
    (isPos(liveQuote?.postMarketPrice) ? liveQuote.postMarketPrice : null) ??
    (!marketStatus?.isPreMarket && !marketStatus?.isOpen && isPos(displayPrice) ? displayPrice : null);

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
    previousClose: isPos(prevDayClose) ? prevDayClose : (isPos(item?.previousClose) ? item.previousClose : null),
    preMarketPrice: resolvedPreMarket,
    postMarketPrice: resolvedPostMarket,
    regularMarketPrice: regularClose,
    change: displayChange,
    changePercent: displayChangePercent,
    exchange: liveProfile?.exchange || item?.exchange || (sec ? sec.category.toUpperCase() : '...'),
    logo: liveProfile?.logo || item?.logo || null,
    sparkline: dynamicSparkline,
    // Newest timestamp wins for freshness calc
    lastUpdated:
      liveQuote?.lastTickTime ||
      liveQuote?.timestamp ||
      y1D?.lastUpdated ||
      item?.lastUpdated,
  };
}
