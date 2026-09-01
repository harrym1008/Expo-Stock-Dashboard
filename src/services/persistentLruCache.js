import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import * as ImageManipulator from 'expo-image-manipulator';

const MAX_CACHE_BYTES = 50 * 1024 * 1024;
const CACHE_MAX_MB = MAX_CACHE_BYTES / (1024 * 1024);
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGO_SIZE = 128;
const DATABASE_NAME = 'stock_cache.db';

/**
 * Accurate, zero-allocation UTF-8 byte size calculation for any string or serializable value.
 */
export function getByteSize(value) {
  if (value == null) return 0;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (!str) return 0;

  let bytes = 0;
  const len = str.length;
  for (let i = 0; i < len; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate, paired with low surrogate for 4-byte astral code point
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

class PersistentLruCache {
  constructor() {
    this.db = null;
    this.dbPromise = null;
    this.writePromise = Promise.resolve();
  }

  enqueueWrite(operation) {
    const next = this.writePromise.then(operation, operation);
    this.writePromise = next.catch(() => {});
    return next;
  }

  touch(key, timestamp) {
    if (!this.db) return;
    this.db
      .runAsync('UPDATE cache_entries SET last_accessed = ? WHERE key = ?', timestamp, key)
      .catch(() => {});
  }

  async init() {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

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
    const row = await db.getFirstAsync(
      'SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM cache_entries'
    );
    return row?.total_bytes || 0;
  }

  async evictToFit(db, requiredBytes) {
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
      this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
      return null;
    }

    if (isJson) {
      try {
        const parsed = JSON.parse(item.value);
        this.touch(key, now);
        return parsed;
      } catch (err) {
        this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
        return null;
      }
    }

    this.touch(key, now);
    return item.value;
  }

  async setItem(key, data, ttl = DEFAULT_TTL_MS, isJson = true) {
    return this.enqueueWrite(async () => {
      const db = await this.init();
      const value = isJson ? JSON.stringify(data) : data;
      if (typeof value !== 'string') return;

      const byteSize = getByteSize(value);
      if (byteSize > MAX_CACHE_BYTES) return;

      await db.runAsync('DELETE FROM cache_entries WHERE key = ?', key);
      await this.evictToFit(db, byteSize);

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
    return this.getItem(key, true);
  }

  async setJson(key, data, ttl = DEFAULT_TTL_MS) {
    return this.setItem(key, data, ttl, true);
  }

  async getCachedLogo(symbol) {
    if (!symbol) return null;
    return this.getItem(`logo_${symbol.toUpperCase()}`, false);
  }

  async cacheLogoData(symbol, dataUri) {
    if (!symbol || !dataUri) return false;
    await this.setItem(`logo_${symbol.toUpperCase()}`, dataUri, DEFAULT_TTL_MS, false);
    return true;
  }

  async resizeAndEncodeImage(uri) {
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
    if (!remoteUrl || remoteUrl.includes('placehold.co')) return null;

    const cleanSym = (symbol || '').toUpperCase();
    const existing = await this.getCachedLogo(cleanSym);
    if (existing) return existing;

    let sourceUri = remoteUrl;
    let temporaryUri = null;
    let resizedUri = null;

    try {
      if (!remoteUrl.startsWith('data:image/')) {
        if (remoteUrl.startsWith('file://') || remoteUrl.startsWith('/')) {
          const info = await FileSystem.getInfoAsync(remoteUrl);
          if (!info.exists) return null;
        } else {
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
    return this.enqueueWrite(async () => {
      const db = await this.init();
      await db.runAsync('DELETE FROM cache_entries');
    });
  }
}

export const persistentLruCache = new PersistentLruCache();
