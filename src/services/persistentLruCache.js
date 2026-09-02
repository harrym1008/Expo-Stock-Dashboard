// Persistent LRU cache backed by SQLite; stores JSON + resized logo data URIs
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import * as ImageManipulator from 'expo-image-manipulator';

const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50MB hard cap on cache contents
const CACHE_MAX_MB = MAX_CACHE_BYTES / (1024 * 1024);
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day default expiry
const LOGO_SIZE = 128; // logos resized down to this square for small footprint
const DATABASE_NAME = 'stock_cache.db';

// UTF-8 byte size of a string/value (needed to enforce the 50MB cap)
export function getByteSize(value) {
  if (value == null) return 0;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (!str) return 0;

  // Count bytes by UTF-8 code-unit width (1/2/3/4 per code point)
  let bytes = 0;
  const len = str.length;
  for (let i = 0; i < len; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: pairs with a low surrogate => 4-byte astral char
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

// Singleton SQLite-backed LRU cache (evict least-recently-accessed over cap)
class PersistentLruCache {
  constructor() {
    this.db = null;
    this.dbPromise = null;
    // Serializes writes so concurrent setItem() calls queue in order
    this.writePromise = Promise.resolve();
  }

  // Chain an async write onto the write queue (never runs concurrently)
  enqueueWrite(operation) {
    const next = this.writePromise.then(operation, operation);
    this.writePromise = next.catch(() => {});
    return next;
  }

  // Bump a key's last-accessed time (best-effort, fire-and-forget)
  touch(key, timestamp) {
    if (!this.db) return;
    this.db
      .runAsync('UPDATE cache_entries SET last_accessed = ? WHERE key = ?', timestamp, key)
      .catch(() => {});
  }

  async init() {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    // Open DB once; create table + LRU index, purge already-expired rows
    this.dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS cache_entries (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          last_accessed INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          ttl_ms INTEGER NOT NULL,
          type TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS cache_entries_lru
          ON cache_entries (last_accessed);
      `);

      await db.runAsync(
        'DELETE FROM cache_entries WHERE created_at + ttl_ms <= ?',
        Date.now()
      );

      this.db = db;
      return db;
    })();

    return this.dbPromise;
  }

  async getTotalBytes(db) {
    // Sum cached bytes (drives the eviction logic below)
    const row = await db.getFirstAsync(
      'SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM cache_entries'
    );
    return row?.total_bytes || 0;
  }

  async evictToFit(db, requiredBytes) {
    // Drop oldest entries until room exists for requiredBytes within cap
    let totalBytes = await this.getTotalBytes(db);
    while (totalBytes + requiredBytes > MAX_CACHE_BYTES) {
      const oldest = await db.getFirstAsync(
        'SELECT key, size_bytes FROM cache_entries ORDER BY last_accessed ASC LIMIT 1'
      );
      if (!oldest) break;

      await db.runAsync('DELETE FROM cache_entries WHERE key = ?', oldest.key);
      totalBytes = Math.max(0, totalBytes - oldest.size_bytes);
    }
  }

  async getItem(key, isJson = true) {
    // Fetch + validate one entry; refresh last_accessed, purge expired/corrupt
    const db = await this.init();
    const item = await db.getFirstAsync(
      'SELECT value, created_at, ttl_ms, type FROM cache_entries WHERE key = ?',
      key
    );
    if (!item) return null;

    const expectedType = isJson ? 'json' : 'logo';
    if (item.type !== expectedType) return null;

    const now = Date.now();
    if (now - item.created_at > (item.ttl_ms || DEFAULT_TTL_MS)) {
      // Expired: mark for deletion, drop it
      this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
      return null;
    }

    if (isJson) {
      try {
        const parsed = JSON.parse(item.value);
        this.touch(key, now); // mark most-recently-used
        return parsed;
      } catch (err) {
        // Corrupt JSON: purge it
        this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
        return null;
      }
    }

    this.touch(key, now);
    return item.value;
  }

  async setItem(key, data, ttl = DEFAULT_TTL_MS, isJson = true) {
    // Insert/replace entry, queueing write so inserts never race
    return this.enqueueWrite(async () => {
      const db = await this.init();
      const value = isJson ? JSON.stringify(data) : data;
      if (typeof value !== 'string') return;

      const byteSize = getByteSize(value);
      if (byteSize > MAX_CACHE_BYTES) return; // oversize value: skip

      await db.runAsync('DELETE FROM cache_entries WHERE key = ?', key);
      await this.evictToFit(db, byteSize); // free space before insert

      const now = Date.now();
      await db.runAsync(
        `INSERT INTO cache_entries
          (key, value, size_bytes, last_accessed, created_at, ttl_ms, type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        key,
        value,
        byteSize,
        now,
        now,
        ttl,
        isJson ? 'json' : 'logo'
      );
    });
  }

  async getJson(key) {
    // JSON convenience wrapper
    return this.getItem(key, true);
  }

  async setJson(key, data, ttl = DEFAULT_TTL_MS) {
    // JSON convenience wrapper
    return this.setItem(key, data, ttl, true);
  }

  async getCachedLogo(symbol) {
    // Pull cached logo data URI by symbol (key = logo_<SYM>)
    if (!symbol) return null;
    return this.getItem(`logo_${symbol.toUpperCase()}`, false);
  }

  async cacheLogoData(symbol, dataUri) {
    // Store resized logo data URI in cache
    if (!symbol || !dataUri) return false;
    await this.setItem(`logo_${symbol.toUpperCase()}`, dataUri, DEFAULT_TTL_MS, false);
    return true;
  }

  async resizeAndEncodeImage(uri) {
    // Shrink logo to LOGO_SIZE and encode as PNG data URI (small footprint)
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: LOGO_SIZE, height: LOGO_SIZE } }],
      {
        base64: true,
        compress: 0.5,
        format: ImageManipulator.SaveFormat.PNG,
      }
    );

    return result.base64
      ? { dataUri: `data:image/png;base64,${result.base64}`, uri: result.uri }
      : null;
  }

  async getOrCacheImage(remoteUrl, symbol) {
    // Fetch remote logo (download if needed), resize, cache; temp files cleaned up
    if (!remoteUrl || remoteUrl.includes('placehold.co')) return null;

    const cleanSym = (symbol || '').toUpperCase();
    const existing = await this.getCachedLogo(cleanSym);
    if (existing) return existing;

    let sourceUri = remoteUrl;
    let temporaryUri = null;
    let resizedUri = null;

    try {
      if (!remoteUrl.startsWith('data:image/')) {
        // Local file: just verify it exists
        if (remoteUrl.startsWith('file://') || remoteUrl.startsWith('/')) {
          const info = await FileSystem.getInfoAsync(remoteUrl);
          if (!info.exists) return null;
        } else {
          // Remote: download to cache dir under a symbol-derived temp name
          const safeSym = cleanSym.replace(/[^a-zA-Z0-9_-]/g, '_');
          const temporaryName = `logo_${safeSym.toLowerCase()}_${Date.now()}.png`;
          temporaryUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}${temporaryName}`;
          const downloadResult = await FileSystem.downloadAsync(remoteUrl, temporaryUri);
          if (downloadResult.status !== 200) return null;
          sourceUri = temporaryUri;
        }
      }

      const resized = await this.resizeAndEncodeImage(sourceUri);
      if (!resized) return null;
      resizedUri = resized.uri;

      await this.cacheLogoData(cleanSym, resized.dataUri);
      return resized.dataUri;
    } catch (err) {
      console.warn(`[PersistentLRU] Image download or resize failed for ${symbol}:`, err.message || err);
      return null;
    } finally {
      // Best-effort temp-file cleanup (keep resized image; drop temp)
      for (const uri of [temporaryUri, resizedUri]) {
        if (uri && (uri === temporaryUri || uri !== sourceUri)) {
          try {
            await FileSystem.deleteAsync(uri, { idempotent: true });
          } catch (e) {}
        }
      }
    }
  }

  async getCacheStats() {
    // Report cache size (bytes/MB) + item count
    const db = await this.init();
    const totalBytes = await this.getTotalBytes(db);
    const row = await db.getFirstAsync('SELECT COUNT(*) AS item_count FROM cache_entries');

    return {
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
      maxMB: CACHE_MAX_MB,
      itemCount: row?.item_count || 0,
    };
  }

  async clearAll() {
    // Wipe entire cache table
    return this.enqueueWrite(async () => {
      const db = await this.init();
      await db.runAsync('DELETE FROM cache_entries');
    });
  }
}

export const persistentLruCache = new PersistentLruCache();
