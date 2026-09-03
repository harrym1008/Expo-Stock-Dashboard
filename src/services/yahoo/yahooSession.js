import { yahooRateLimiter } from '../../utils/rateLimiter';
import { persistentLruCache } from '../persistentLruCache';


// Manages Yahoo Finance cookie + crumb session for authenticated requests
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

let inMemorySession = null;
let inFlightSessionPromise = null;
let lastSessionFailureTime = 0;
const SESSION_FAILURE_COOLDOWN_MS = 30 * 1000;

// Fetch with exponential backoff and rate limiter notification on 429 errors
export async function fetchWithBackoff(url, options = {}, { maxRetries = 2, tag = 'Yahoo Finance' } = {}) {
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
            `[${tag}] Received 429 (Rate Limit). Waiting ${Math.round(backoffMs) / 1000}s before retrying (${attempt}/${maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        } else {
          console.error(
            `[${tag}] Received 429 (Rate Limit) and max retries reached (${maxRetries}). Aborting request.`
          );
          return res;
        }
      }

      if (res.ok) {
        if (attempt > 0) {
          console.log(`[${tag}] Request succeeded (no 429) on attempt ${attempt + 1}.`);
        }
        yahooRateLimiter.notifySuccess();
      }

      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        const backoffMs = 1000 * attempt;
        console.warn(
          `[${tag}] Network error (${err.message || err}). Retrying in ${Math.round(backoffMs) / 1000}s (${attempt}/${maxRetries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw err;
    }
  }
}

// Reset in-memory session (e.g. after receiving 401 Unauthorized)
export function resetSession() {
  inMemorySession = null;
}

// Retrieve or refresh Yahoo Finance cookie and crumb session auth
export async function getSession(forceRefresh = false) {
  const cacheKey = 'yahoo_auth_session';
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Check in-memory cache first
  if (!forceRefresh && inMemorySession && inMemorySession.crumb) {
    return inMemorySession;
  }

  // Prevent hammering auth endpoints if recent attempt failed
  if (!forceRefresh && Date.now() - lastSessionFailureTime < SESSION_FAILURE_COOLDOWN_MS) {
    return null;
  }

  // Check persistent SQLite cache
  if (!forceRefresh) {
    try {
      const cached = await persistentLruCache.getJson(cacheKey);
      if (cached && cached.crumb) {
        inMemorySession = cached;
        return cached;
      }
    } catch {
      // Fall through to network fetch
    }
  }

  // Deduplicate concurrent requests
  if (inFlightSessionPromise) {
    return inFlightSessionPromise;
  }

  inFlightSessionPromise = (async () => {
    try {
      console.log('[Yahoo Fin] Fetching fresh session cookie & crumb...');

      // Fetch cookie from fc.yahoo.com
      let cookie = null;
      try {
        const cookieRes = await fetchWithBackoff(
          'https://fc.yahoo.com',
          { headers: { 'User-Agent': USER_AGENT } },
          { maxRetries: 1, tag: 'Yahoo Finance Cookie (fc)' }
        );

        cookie = cookieRes?.headers?.get ? cookieRes.headers.get('set-cookie') : null;
        if (!cookie && typeof cookieRes?.headers?.getSetCookie === 'function') {
          const rawArr = cookieRes.headers.getSetCookie();
          if (Array.isArray(rawArr) && rawArr.length > 0) {
            cookie = rawArr.join('; ');
          }
        }
      } catch {
        // Fallback handled below
      }

      // Fallback request to finance.yahoo.com if no cookie header
      if (!cookie) {
        try {
          const fallbackRes = await fetchWithBackoff(
            'https://finance.yahoo.com',
            { headers: { 'User-Agent': USER_AGENT } },
            { maxRetries: 1, tag: 'Yahoo Finance Cookie (finance)' }
          );
          cookie = fallbackRes?.headers?.get ? fallbackRes.headers.get('set-cookie') : null;
        } catch {
          // Proceed with empty cookie
        }
      }

      // Fetch crumb via query2
      let crumb = null;
      try {
        const crumbRes = await fetchWithBackoff(
          'https://query2.finance.yahoo.com/v1/test/getcrumb',
          {
            headers: {
              'User-Agent': USER_AGENT,
              Cookie: cookie || '',
            },
          },
          { maxRetries: 0, tag: 'Yahoo Finance Crumb (q2)' }
        );

        if (crumbRes && crumbRes.ok) {
          crumb = (await crumbRes.text()).trim();
        }
      } catch {
        // Fallback to query1
      }

      // Fallback to query1 if query2 failed or returned HTML error
      if (!crumb || crumb.includes('<') || crumb.includes('error')) {
        try {
          const crumbRes1 = await fetchWithBackoff(
            'https://query1.finance.yahoo.com/v1/test/getcrumb',
            {
              headers: {
                'User-Agent': USER_AGENT,
                Cookie: cookie || '',
              },
            },
            { maxRetries: 0, tag: 'Yahoo Finance Crumb (q1)' }
          );

          if (crumbRes1 && crumbRes1.ok) {
            crumb = (await crumbRes1.text()).trim();
          }
        } catch {
          // Crumb acquisition failed
        }
      }

      // Save valid session to memory and SQLite
      if (crumb && !crumb.includes('<') && !crumb.includes('error')) {
        const session = { cookie: cookie || '', crumb };
        inMemorySession = session;
        lastSessionFailureTime = 0;
        await persistentLruCache.setJson(cacheKey, session, ONE_DAY_MS).catch(() => {});
        console.log(`[Yahoo Fin] Obtained session crumb: ${crumb.slice(0, 4)}...`);
        return session;
      }

      // Set cooldown on auth failure
      lastSessionFailureTime = Date.now();
      console.log('[Yahoo Fin] Failed to obtain valid crumb (30s cooldown active)');
      return null;
    } catch (err) {
      lastSessionFailureTime = Date.now();
      console.log('[Yahoo Fin] Error getting session cookie/crumb:', err.message || err);
      return null;
    } finally {
      inFlightSessionPromise = null;
    }
  })();

  return inFlightSessionPromise;
}
