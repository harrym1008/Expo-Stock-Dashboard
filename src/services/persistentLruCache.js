import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import * as ImageManipulator from 'expo-image-manipulator';

const MAX_CACHE_BYTES = 50 * 1024 * 1024;
const CACHE_MAX_MB = MAX_CACHE_BYTES / (1024 * 1024);
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGO_SIZE = 128;
const DATABASE_NAME = 'stock_cache.db';

const STORAGE_ROOT = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
const LEGACY_CACHE_FILE = `${STORAGE_ROOT}stock_lru_cache.json`;
const LEGACY_CACHE_DIR = `${STORAGE_ROOT}stock_lru_cache/`;

function getByteSize(value) {
  if (!value) return 0;
  try {
    return encodeURI(value).split(/%..|./).length - 1;
  } catch (e) {
    return value.length * 2;
  }
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

    // LRU bookkeeping must never hold up a cache hit or a network response.
    // SQLite serializes the individual statement safely on the shared connection.
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
      await this.removeLegacyCacheFiles();
      return db;
    })();

    return this.dbPromise;
  }

  async removeLegacyCacheFiles() {
    for (const path of [LEGACY_CACHE_FILE, LEGACY_CACHE_DIR]) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists) {
          await FileSystem.deleteAsync(path, { idempotent: true });
          console.log(`[PersistentLRU] Removed legacy cache path: ${path}`);
        }
      } catch (err) {
        console.warn('[PersistentLRU] Failed to remove legacy cache path:', err.message || err);
      }
    }
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

  async getJson(key) {
    const db = await this.init();
    const item = await db.getFirstAsync(
      'SELECT value, created_at, ttl_ms, type FROM cache_entries WHERE key = ?',
      key
    );
    if (!item || item.type !== 'json') return null;

    const now = Date.now();
    if (now - item.created_at > (item.ttl_ms || DEFAULT_TTL_MS)) {
      this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
      return null;
    }

    try {
      const value = JSON.parse(item.value);
      this.touch(key, now);
      return value;
    } catch (err) {
      this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
      return null;
    }
  }

  async setJson(key, data, ttl = DEFAULT_TTL_MS) {
    return this.enqueueWrite(async () => {
      const db = await this.init();
      const value = JSON.stringify(data);
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
        'json'
      );
    });
  }

  async getCachedLogo(symbol) {
    if (!symbol) return null;

    const db = await this.init();
    const key = `logo_${symbol.toUpperCase()}`;
    const item = await db.getFirstAsync(
      'SELECT value, created_at, ttl_ms, type FROM cache_entries WHERE key = ?',
      key
    );
    if (!item || item.type !== 'logo') return null;

    const now = Date.now();
    if (now - item.created_at > (item.ttl_ms || DEFAULT_TTL_MS)) {
      this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
      return null;
    }

    this.touch(key, now);
    return item.value;
  }

  async cacheLogoData(symbol, dataUri) {
    if (!symbol || !dataUri) return false;

    return this.enqueueWrite(async () => {
      const db = await this.init();
      const key = `logo_${symbol.toUpperCase()}`;
      const byteSize = getByteSize(dataUri);
      if (byteSize > MAX_CACHE_BYTES) return false;

      await db.runAsync('DELETE FROM cache_entries WHERE key = ?', key);
      await this.evictToFit(db, byteSize);

      const now = Date.now();
      await db.runAsync(
        `INSERT INTO cache_entries
          (key, value, size_bytes, last_accessed, created_at, ttl_ms, type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        key,
        dataUri,
        byteSize,
        now,
        now,
        DEFAULT_TTL_MS,
        'logo'
      );
      return true;
    });
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
      console.log(`[PersistentLRU] Cached resized logo: "${cleanSym}" (128x128 PNG)`);
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
      await this.removeLegacyCacheFiles();
      console.log('[PersistentLRU] Cleared single SQLite cache');
    });
  }
}

export const persistentLruCache = new PersistentLruCache();
