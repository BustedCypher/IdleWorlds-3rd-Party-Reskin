/**
 * ItemDatabase
 *
 * Fetches the game's live items.json and keeps a resilient local cache.
 * A fresh cache is returned immediately and refreshed in the background.
 * A stale cache may be used as a network-failure fallback so the skin does
 * not lose all metadata/tooltips just because one request failed.
 */

import { normaliseItemName } from './normaliseItemName.js';
import { storageGet, storageSet, warnOnce } from './Runtime.js';

const API_URL = 'https://idleworlds.com/items.json';
const CACHE_KEY = 'iw-item-db-cache';
// When the cached table was last CONFIRMED current, kept apart from the table
// itself. items.json is ~5.5 MB (4,458 items, 2026-09); bumping `cachedAt`
// inside CACHE_KEY meant writing the whole table back to disk on every page
// load that found it unchanged.
const CHECKED_KEY = 'iw-item-db-cache-checked';
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REFRESH_RETRY_MS = 15 * 60 * 1000;

// The cache used to live in localStorage. A content script shares the PAGE's
// localStorage, so the full items.json table was being written into
// idleworlds.com's own origin storage, against the 5 MB quota we share with
// the game. Our write could fail — worse, it could push the GAME's writes over
// quota, which is a functionality change the project charter forbids.
//
// chrome.storage.local is extension-private, has a larger budget, and is shared
// across tabs so N open tabs cost one fetch instead of N. (Audit S1.3)
const LEGACY_LOCALSTORAGE_KEY = 'iw-item-db-cache';
let legacyEvicted = false;

/**
 * Remove the old cache from the game's localStorage. Runs once per session,
 * best-effort: reclaiming the user's quota matters more than knowing it worked.
 */
function evictLegacyCache() {
  if (legacyEvicted) return;
  legacyEvicted = true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)) {
      localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
      console.log('[ItemDatabase] Evicted legacy cache from page localStorage');
    }
  } catch (err) {
    warnOnce('itemdb:legacy-evict', err);
  }
}

/** The response's identity for the table it carries. `Last-Modified` is a
 *  CORS-safelisted header and `ETag` is readable same-origin; null when the
 *  server sent neither, which disables the parse skip. */
function responseValidator(res) {
  const header = name => res.headers?.get?.(name) || '';
  const value = `${header('etag')}|${header('last-modified')}`;
  return value === '|' ? null : value;
}

class _ItemDatabase {
  constructor() {
    this._items = null;
    this._byId = null;
    this._byName = null;
    this._generatedAt = null;
    this._validator = null;
    this._source = null;
    this._promise = null;
    this._revision = 0;
    this._autoRefresh = false;
    this._refreshTimer = null;
    this._refreshPromise = null;
  }

  ready() {
    if (!this._promise) {
      this._promise = this._load().then(() => {
        if (this._autoRefresh) this._scheduleRefresh(CACHE_MAX_AGE_MS);
      }).catch(err => {
        // Do not permanently poison the singleton after a transient failure.
        this._promise = null;
        throw err;
      });
    }
    return this._promise;
  }
  startAutoRefresh() {
    this._autoRefresh = true;
    if (this.isReady()) this._scheduleRefresh(CACHE_MAX_AGE_MS);
  }
  stopAutoRefresh() {
    this._autoRefresh = false;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = null;
  }
  isReady() {
    return Array.isArray(this._items) && !!this._byName;
  }

  revision() {
    return this._revision;
  }

  generatedAt() {
    return this._generatedAt;
  }

  source() {
    return this._source;
  }
  _scheduleRefresh(delayMs) {
    if (!this._autoRefresh) return;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this._refreshOnce()
        .then(() => this._scheduleRefresh(CACHE_MAX_AGE_MS))
        .catch(err => {
          console.warn('[ItemDatabase] Scheduled refresh failed:', err.message);
          this._scheduleRefresh(REFRESH_RETRY_MS);
        });
    }, delayMs);
    this._refreshTimer?.unref?.();
  }

  _refreshOnce() {
    if (!this._refreshPromise) {
      this._refreshPromise = this._fetchFresh().finally(() => { this._refreshPromise = null; });
    }
    return this._refreshPromise;
  }
  async _load() {
    evictLegacyCache();
    const cached = await this._readCache({ allowStale: true });

    if (cached && !cached.stale) {
      this._index(cached.items, cached.generatedAt, 'cache', cached.validator);
      // A refresh failure does not invalidate a known-good fresh cache.
      this._refreshOnce().catch(err => {
        console.warn('[ItemDatabase] Background refresh failed:', err.message);
      });
      return;
    }

    if (cached && cached.stale) {
      // Index stale data immediately so renderers have a coherent fallback,
      // then attempt to replace it with the live table before ready resolves.
      this._index(cached.items, cached.generatedAt, 'stale-cache', cached.validator);
      try {
        await this._refreshOnce();
      } catch (err) {
        console.warn('[ItemDatabase] Using stale cache after refresh failure:', err.message);
      }
      return;
    }

    await this._refreshOnce();
  }

  async _fetchFresh() {
    // `no-cache` revalidates rather than bypassing the HTTP cache: the server
    // sends ETag + Last-Modified, so an unchanged table comes back as a 304
    // from the browser's own cache instead of a fresh ~230 KB download. The
    // previous `no-store` refetched the whole file on every page load.
    const res = await fetch(API_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`items.json fetch failed: ${res.status}`);
    const validator = responseValidator(res);

    // The server vouches for the table already indexed: nothing to parse,
    // index or rewrite - only record that it was confirmed.
    if (this.isReady() && validator && validator === this._validator) {
      this._source = 'network';
      res.body?.cancel?.().catch?.(() => {});
      this._markCacheChecked();
      return;
    }

    const data = await res.json();

    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('items.json returned no item records');
    }

    // If a cache was already indexed and the server table has the same
    // generation stamp, refresh the cache timestamp without forcing every
    // renderer and scanner to rebuild needlessly.
    if (this.isReady() && data.generatedAt && data.generatedAt === this._generatedAt) {
      this._source = 'network';
      if (validator && validator !== this._validator) {
        // Same table under a new validator (the file was re-deployed): store
        // the validator with it once, so the next load can skip the parse.
        this._validator = validator;
        this._writeCache(data.items, data.generatedAt, validator);
      } else {
        this._markCacheChecked();
      }
      return;
    }

    this._index(data.items, data.generatedAt, 'network', validator);
    this._writeCache(data.items, data.generatedAt, validator);
    console.log(`[ItemDatabase] Loaded ${data.items.length} items (generated ${data.generatedAt})`);
  }

  _index(items, generatedAt, source, validator = null) {
    if (!Array.isArray(items) || items.length === 0) return;

    this._items = items;
    this._generatedAt = generatedAt || null;
    this._validator = validator || null;
    this._source = source || null;
    this._byId = new Map();
    this._byName = new Map();

    for (const item of items) {
      if (item.item_id !== undefined && item.item_id !== null && item.item_id !== '') {
        this._byId.set(String(item.item_id), item);
      }
      const key = normaliseItemName(item.name);
      if (key && !this._byName.has(key)) this._byName.set(key, item);
    }

    this._revision += 1;
    document.dispatchEvent(new CustomEvent('iw:item-db-updated', {
      detail: {
        revision: this._revision,
        generatedAt: this._generatedAt,
        source,
        count: items.length,
      },
      bubbles: false,
    }));
  }

  async _readCache({ allowStale = false } = {}) {
    try {
      const [parsed, checked] = await Promise.all([storageGet(CACHE_KEY), storageGet(CHECKED_KEY)]);
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
      // A confirmation only counts for the generation it confirmed.
      const confirmedAt = checked && checked.generatedAt === (parsed.generatedAt ?? null)
        ? Math.max(Number(parsed.cachedAt || 0), Number(checked.checkedAt || 0))
        : Number(parsed.cachedAt || 0);
      const age = Date.now() - confirmedAt;
      const stale = !Number.isFinite(age) || age > CACHE_MAX_AGE_MS;
      if (stale && !allowStale) return null;
      return { ...parsed, stale };
    } catch (e) {
      return null;
    }
  }

  _writeCache(items, generatedAt, validator = null) {
    // Deliberately not awaited: a slow or failed cache write must never delay
    // the renderers, which already have the freshly indexed table in memory.
    storageSet(CACHE_KEY, { items, generatedAt, validator, cachedAt: Date.now() })
      .then(ok => { if (!ok) warnOnce('itemdb:cache-write', new Error('cache write rejected')); });
  }

  _markCacheChecked() {
    storageSet(CHECKED_KEY, { generatedAt: this._generatedAt, checkedAt: Date.now() })
      .then(ok => { if (!ok) warnOnce('itemdb:cache-check-write', new Error('cache check write rejected')); });
  }

  getById(id) {
    if (!this._byId || id === undefined || id === null) return null;
    return this._byId.get(String(id)) || null;
  }

  getByName(name) {
    if (!this._byName) return null;
    return this._byName.get(normaliseItemName(name)) || null;
  }

  find({ id, name } = {}) {
    if (id !== undefined && id !== null && id !== '') {
      const hit = this.getById(id);
      if (hit) return hit;
    }
    return name ? this.getByName(name) : null;
  }

  all() {
    return this._items || [];
  }
}

export const ItemDatabase = new _ItemDatabase();
