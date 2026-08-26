import * as FileSystem from 'expo-file-system/legacy';

const MAX_CACHE_BYTES = 128 * 1024 * 1024; // 128 Megabytes
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days (1 Month)

const CACHE_DIR = `${FileSystem.documentDirectory || ''}stock_lru_cache/`;
const MANIFEST_FILE = `${CACHE_DIR}manifest.json`;

function getByteSize(str) {
  if (!str) return 0;
  try {
    return encodeURI(str).split(/%..|./).length - 1;
  } catch (e) {
    return str.length * 2;
  }
}

class PersistentLruCache {
  constructor() {
    this.initialized = false;
    this.manifest = {
      totalBytes: 0,
      items: {}, // key -> { filename, byteSize, lastAccessed, timestamp, ttl, type }
    };
    this.initPromise = null;
  }

  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
        }

        const manifestInfo = await FileSystem.getInfoAsync(MANIFEST_FILE);
        if (manifestInfo.exists) {
          const raw = await FileSystem.readAsStringAsync(MANIFEST_FILE);
          this.manifest = JSON.parse(raw);
        } else {
          this.manifest = { totalBytes: 0, items: {} };
          await this.saveManifest();
        }

        // Clean up expired items on startup
        await this.purgeExpired();

        const count = Object.keys(this.manifest.items).length;
        const mb = (this.manifest.totalBytes / (1024 * 1024)).toFixed(2);
        console.log(`[PersistentLRU] 🚀 Ready | Usage: ${mb} MB / 128 MB (${count} items stored)`);
      } catch (err) {
        console.warn('[PersistentLRU] Initialization warning:', err.message || err);
        this.manifest = { totalBytes: 0, items: {} };
      } finally {
        this.initialized = true;
      }
    })();

    return this.initPromise;
  }

  async saveManifest() {
    try {
      await FileSystem.writeAsStringAsync(
        MANIFEST_FILE,
        JSON.stringify(this.manifest)
      );
    } catch (err) {
      console.warn('[PersistentLRU] Failed to write manifest:', err.message || err);
    }
  }

  async purgeExpired() {
    const now = Date.now();
    const keys = Object.keys(this.manifest.items);
    let changed = false;

    for (const key of keys) {
      const item = this.manifest.items[key];
      if (item && now - item.timestamp > (item.ttl || DEFAULT_TTL_MS)) {
        console.log(`[PersistentLRU] 🧹 Purged expired item: "${key}" (exceeded 30-day TTL)`);
        await this.removeItem(key, false);
        changed = true;
      }
    }

    if (changed) {
      await this.saveManifest();
    }
  }

  async removeItem(key, save = true) {
    const item = this.manifest.items[key];
    if (!item) return;

    try {
      const filePath = `${CACHE_DIR}${item.filename}`;
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
    } catch (e) {}

    this.manifest.totalBytes = Math.max(0, this.manifest.totalBytes - (item.byteSize || 0));
    delete this.manifest.items[key];

    if (save) {
      await this.saveManifest();
    }
  }

  async evictToFit(requiredBytes) {
    if (this.manifest.totalBytes + requiredBytes <= MAX_CACHE_BYTES) {
      return;
    }

    // Sort items by lastAccessed ascending (LRU first)
    const sortedKeys = Object.keys(this.manifest.items).sort((a, b) => {
      const itemA = this.manifest.items[a];
      const itemB = this.manifest.items[b];
      return (itemA.lastAccessed || 0) - (itemB.lastAccessed || 0);
    });

    for (const key of sortedKeys) {
      if (this.manifest.totalBytes + requiredBytes <= MAX_CACHE_BYTES) {
        break;
      }
      console.log(`[PersistentLRU] ⚠️ LRU Evicting: "${key}" to preserve 128MB budget`);
      await this.removeItem(key, false);
    }

    await this.saveManifest();
  }

  // --- JSON Data Caching (e.g. Company Profiles, Candle Charts) ---

  async getJson(key) {
    await this.init();
    const item = this.manifest.items[key];
    if (!item) {
      console.log(`[PersistentLRU] 💨 Cache MISS (JSON): "${key}"`);
      return null;
    }

    const now = Date.now();
    if (now - item.timestamp > (item.ttl || DEFAULT_TTL_MS)) {
      console.log(`[PersistentLRU] ⌛ Cache EXPIRED (JSON): "${key}"`);
      await this.removeItem(key);
      return null;
    }

    try {
      item.lastAccessed = now;
      this.saveManifest();

      const filePath = `${CACHE_DIR}${item.filename}`;
      const raw = await FileSystem.readAsStringAsync(filePath);
      console.log(`[PersistentLRU] 🎯 Cache HIT (JSON): "${key}" (Saved external network query)`);
      return JSON.parse(raw);
    } catch (err) {
      await this.removeItem(key);
      return null;
    }
  }

  async setJson(key, data, ttl = DEFAULT_TTL_MS) {
    await this.init();
    try {
      const content = JSON.stringify(data);
      const byteSize = getByteSize(content);
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `json_${safeKey}_${Date.now()}.json`;
      const filePath = `${CACHE_DIR}${filename}`;

      await this.evictToFit(byteSize);
      await FileSystem.writeAsStringAsync(filePath, content);

      if (this.manifest.items[key]) {
        await this.removeItem(key, false);
      }

      this.manifest.items[key] = {
        filename,
        byteSize,
        lastAccessed: Date.now(),
        timestamp: Date.now(),
        ttl,
        type: 'json',
      };
      this.manifest.totalBytes += byteSize;

      await this.saveManifest();
      const mb = (this.manifest.totalBytes / (1024 * 1024)).toFixed(2);
      console.log(`[PersistentLRU] 💾 Cached JSON: "${key}" (${byteSize} bytes | Total Cache: ${mb} MB)`);
    } catch (err) {
      console.warn(`[PersistentLRU] Failed to cache JSON for ${key}:`, err.message || err);
    }
  }

  // --- Image / Logo File Caching (128x128 Logos) ---

  async getOrCacheImage(remoteUrl, symbol) {
    if (!remoteUrl) return null;
    await this.init();

    const cleanSym = (symbol || '').toUpperCase();
    const cacheKey = `logo_${cleanSym}_${encodeURIComponent(remoteUrl)}`;
    const item = this.manifest.items[cacheKey];

    if (item) {
      const filePath = `${CACHE_DIR}${item.filename}`;
      const now = Date.now();

      if (now - item.timestamp < (item.ttl || DEFAULT_TTL_MS)) {
        item.lastAccessed = now;
        this.saveManifest();
        console.log(`[PersistentLRU] 🎯 Cache HIT (Logo): "${cleanSym}" -> Local Disk: ${item.filename}`);
        return filePath;
      } else {
        await this.removeItem(cacheKey);
      }
    }

    // Cache miss: download to local disk
    try {
      console.log(`[PersistentLRU] 📥 Downloading logo: "${cleanSym}" from ${remoteUrl}`);
      const extMatch = remoteUrl.match(/\.(png|jpg|jpeg|svg|webp)/i);
      const ext = extMatch ? extMatch[1] : 'png';
      const safeSym = cleanSym.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `img_${safeSym.toLowerCase()}_${Date.now()}.${ext}`;
      const targetPath = `${CACHE_DIR}${filename}`;

      const downloadResult = await FileSystem.downloadAsync(remoteUrl, targetPath);
      if (downloadResult.status !== 200) {
        console.warn(`[PersistentLRU] Remote download returned HTTP ${downloadResult.status} for ${cleanSym}`);
        return remoteUrl;
      }

      const fileInfo = await FileSystem.getInfoAsync(targetPath);
      const byteSize = fileInfo.size || 15000;

      await this.evictToFit(byteSize);

      this.manifest.items[cacheKey] = {
        filename,
        byteSize,
        lastAccessed: Date.now(),
        timestamp: Date.now(),
        ttl: DEFAULT_TTL_MS,
        type: 'image',
      };
      this.manifest.totalBytes += byteSize;

      await this.saveManifest();
      const kb = (byteSize / 1024).toFixed(1);
      const totalMb = (this.manifest.totalBytes / (1024 * 1024)).toFixed(2);
      console.log(`[PersistentLRU] 💾 Cached Logo: "${cleanSym}" (${kb} KB | Total Cache: ${totalMb} MB)`);
      return targetPath;
    } catch (err) {
      console.warn(`[PersistentLRU] Image download fallback for ${symbol}:`, err.message || err);
      return remoteUrl;
    }
  }

  async getCacheStats() {
    await this.init();
    return {
      totalBytes: this.manifest.totalBytes,
      totalMB: (this.manifest.totalBytes / (1024 * 1024)).toFixed(2),
      maxMB: 128,
      itemCount: Object.keys(this.manifest.items).length,
    };
  }

  async clearAll() {
    await this.init();
    try {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      this.manifest = { totalBytes: 0, items: {} };
      await this.saveManifest();
      console.log('[PersistentLRU] 🗑️ Successfully wiped all 128MB cache and reset manifest');
    } catch (e) {
      console.warn('[PersistentLRU] Failed to clear cache:', e.message || e);
    }
  }
}

export const persistentLruCache = new PersistentLruCache();
