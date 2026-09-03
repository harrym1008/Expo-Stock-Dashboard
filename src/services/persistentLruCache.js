import * as SQLite from 'expo-sqlite';

const MAX_CACHE_MB = 50;      // 50 MB hard cap on cache contents
const MAX_CACHE_BYTES = MAX_CACHE_MB * 1024 * 1024;
const DEFAULT_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5-day default expiry
const DATABASE_NAME = 'stock_cache.db';
const LAST_ACCESSED_THROTTLE_MS = 60 * 60 * 1000; // Throttle DB last-accessed updates to once per hour


// Fast estimate of byte size without allocating large Uint8Array memory buffers
export function getByteSize(value) {
  if (value == null) return 0;
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  return stringValue.length;
}


// Singleton SQLite-backed LRU cache
class PersistentLruCache {
  constructor() {
    this.db = null;
    this.dbPromise = null;
    this.writePromise = Promise.resolve();
    this.memoryFallback = new Map();
    this.isMemoryFallback = false;
  }

  // Chain an async write onto the write queue
  enqueueWrite(operation) {
    const next = this.writePromise.then(operation, operation);
    this.writePromise = next.catch(() => {});
    return next;
  }

  // Bump a key's last-accessed time
  overwriteLastAccessed(key, timestamp) {
    if (!this.db) return;
    this.db
      .runAsync('UPDATE cache_entries SET last_accessed = ? WHERE key = ?', timestamp, key)
      .catch(() => {});
  }

  async init() {
    if (this.isMemoryFallback) return null;
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    // Load DB once
    this.dbPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
        // Create table ONLY if it doesnt exist
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

        // Clear out expired rows
        await db.runAsync(
          'DELETE FROM cache_entries WHERE created_at + ttl_ms <= ?',
          Date.now()
        );

        this.db = db;
        return db;
      } catch (err) {
        console.warn('[PersistentLRU] SQLite not available in this environment, using in-memory cache:', err.message || err);
        this.isMemoryFallback = true;
        return null;
      }
    })();

    return this.dbPromise;
  }

  // Sums cached bytes (drives the eviction logic below)
  async getTotalBytes(db) {
    const row = await db.getFirstAsync(
      'SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM cache_entries'
    );
    return row?.total_bytes || 0;
  }

  // Drop oldest entries until room exists for requiredBytes within cap
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

  // Fetch and validate 
  async getItem(key, isJson = true) {
    const db = await this.init();
    if (this.isMemoryFallback || !db) {
      const item = this.memoryFallback.get(key);
      if (!item) return null;
      if (Date.now() - item.created_at > (item.ttl_ms || DEFAULT_TTL_MS)) {
        this.memoryFallback.delete(key);
        return null;
      }
      return item.value;
    }

    const item = await db.getFirstAsync(
      'SELECT value, created_at, ttl_ms, type, last_accessed FROM cache_entries WHERE key = ?',
      key
    );
    if (!item) return null;   // Not found in the cache

    const expectedType = isJson ? 'json' : 'logo';
    if (item.type !== expectedType) return null;   // Bad type

    const now = Date.now();
    if (now - item.created_at > (item.ttl_ms || DEFAULT_TTL_MS)) {
      // The existing entry is expired... remove from the cache and return null
      this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
      return null;
    }

    // Only update last_accessed if older than the throttle window (avoids high-frequency SQLite write contention)
    if (now - (item.last_accessed || 0) > LAST_ACCESSED_THROTTLE_MS) {
      this.overwriteLastAccessed(key, now);
    }

    if (isJson) {
      try {
        const parsed = JSON.parse(item.value);
        return parsed;
      } catch (err) {
        // JSON has corrupted somehow, remove it from the cache
        this.enqueueWrite(() => db.runAsync('DELETE FROM cache_entries WHERE key = ?', key));
        return null;
      }
    }

    // Return logo or raw string
    return item.value;
  }

  async setItem(key, data, ttl = DEFAULT_TTL_MS, isJson = true) {
    if (!key || data === undefined || data === null) return;
    const db = await this.init();
    if (this.isMemoryFallback || !db) {
      this.memoryFallback.set(key, {
        value: data,
        created_at: Date.now(),
        ttl_ms: ttl,
      });
      return;
    }

    // Insert/replace entry, queueing write so inserts never race
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

  // Convenience wrappers for JSON and logo data
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

  // Lightweight logo resolver stub for backward compatibility (logos are managed natively via URLs)
  async getOrCacheImage(remoteUrl) {
    return remoteUrl || null;
  }

  // Returns a summary of the cache's contents (size, max size, item count)
  async getCacheStats() {
    const db = await this.init();
    if (this.isMemoryFallback || !db) {
      return {
        totalBytes: 0,
        totalMB: '0.00',
        maxMB: MAX_CACHE_MB,
        itemCount: this.memoryFallback.size,
      };
    }

    const totalBytes = await this.getTotalBytes(db);
    const row = await db.getFirstAsync('SELECT COUNT(*) AS item_count FROM cache_entries');

    return {
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
      maxMB: MAX_CACHE_MB,
      itemCount: row?.item_count || 0,
    };
  }

  // Clears the entire cache
  async clearAll() {
    if (this.isMemoryFallback || !this.db) {
      this.memoryFallback.clear();
      return;
    }
    return this.enqueueWrite(async () => {
      const db = await this.init();
      if (db) await db.runAsync('DELETE FROM cache_entries');
    });
  }
}


// Global singleton instance of the PersistentLruCache
export const persistentLruCache = new PersistentLruCache();
