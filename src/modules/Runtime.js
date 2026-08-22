/**
 * Runtime
 *
 * Thin, dependency-free wrappers around the extension runtime. Everything that
 * touches `chrome.*` goes through here so that:
 *
 *   • Asset URLs resolve to bundled, CSP-proof `chrome-extension://` paths
 *     rather than remote origins. (Audit S1.1 / S1.2)
 *   • Persistent state lives in extension-private storage instead of the
 *     GAME's localStorage, which we share with the page and must not fill.
 *     (Audit S1.3)
 *   • A thrown consumer can never take down the rest of a flush. (Audit S3.7)
 *   • Reconciliation work is ignored while the skin is disabled, without
 *     preventing queued callbacks from running their own bookkeeping cleanup.
 *
 * The module degrades gracefully when `chrome` is unavailable (unit tests,
 * a plain <script> harness) so the presentation layer stays testable.
 */

const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

/* ── Activation lifecycle ───────────────────────────────────────────── */

// Default to active for isolated module/unit tests. content.js explicitly sets
// the real page state before boot/after teardown.
let runtimeActive = true;

export function setRuntimeActive(active) {
  runtimeActive = active !== false;
}

export function isRuntimeActive() {
  return runtimeActive;
}

/* ── Assets ──────────────────────────────────────────────────────────── */

/**
 * Resolve a path inside the extension bundle.
 * @param {string} path e.g. 'assets/gear_icons_atlas.png'
 */
export function assetUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  if (hasChrome && typeof chrome.runtime.getURL === 'function') {
    return chrome.runtime.getURL(clean);
  }
  // Test/dev fallback only. Never reached inside the packed extension.
  return clean;
}

/* ── Storage ─────────────────────────────────────────────────────────── */

const LOCAL_FALLBACK = new Map();

/**
 * Read one key from extension-private storage.
 * @returns {Promise<any|null>}
 */
export const storageGet = async function storageGet(key) {
  if (hasChrome && chrome.storage?.local) {
    try {
      const bag = await chrome.storage.local.get(key);
      return bag?.[key] ?? null;
    } catch (err) {
      warnOnce(`storageGet:${key}`, err);
      return null;
    }
  }
  return LOCAL_FALLBACK.has(key) ? LOCAL_FALLBACK.get(key) : null;
};

/**
 * Write one key to extension-private storage.
 * @returns {Promise<boolean>} false when the write failed (quota, no runtime)
 */
export const storageSet = async function storageSet(key, value) {
  if (hasChrome && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (err) {
      warnOnce(`storageSet:${key}`, err);
      return false;
    }
  }
  LOCAL_FALLBACK.set(key, value);
  return true;
};

export const storageRemove = async function storageRemove(key) {
  if (hasChrome && chrome.storage?.local) {
    try {
      await chrome.storage.local.remove(key);
      return true;
    } catch (err) {
      warnOnce(`storageRemove:${key}`, err);
      return false;
    }
  }
  LOCAL_FALLBACK.delete(key);
  return true;
};

/**
 * Subscribe to changes for a single key in extension-private storage.
 * Returns an unsubscribe function.
 */
export function onStorageChanged(key, handler) {
  if (!hasChrome || !chrome.storage?.onChanged) return () => {};
  const listener = (changes, area) => {
    if (area !== 'local' || !(key in changes)) return;
    // This path MUST work while runtimeActive is false: it is how the disabled
    // skin receives the command to turn itself back on.
    try {
      handler(changes[key].newValue);
    } catch (err) {
      warnOnce('storage-change', err);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/* ── Error isolation ─────────────────────────────────────────────────── */

const _warned = new Set();

/**
 * Log a message at most once per distinct key, so a per-frame failure cannot
 * flood the console of a game that mutates continuously.
 */
export function warnOnce(key, err) {
  if (_warned.has(key)) return;
  _warned.add(key);
  const detail = err && err.message ? err.message : err;
  console.warn(`[IW Fantasy Skin] ${key}:`, detail);
}

/**
 * Run `fn`, swallowing and reporting any exception. Reconciliation callbacks
 * that arrive after teardown are deliberately ignored.
 *
 * @returns {boolean} true when fn completed without throwing
 */
export function guard(label, fn) {
  if (!runtimeActive) return false;
  try {
    fn();
    return true;
  } catch (err) {
    warnOnce(`guard:${label}`, err);
    return false;
  }
}

/**
 * Map `fn` across `items` with per-item isolation.
 * @returns {number} count of items processed without throwing
 */
export function guardEach(label, items, fn) {
  if (!runtimeActive) return 0;
  let ok = 0;
  for (const item of items || []) {
    if (guard(label, () => fn(item))) ok += 1;
  }
  return ok;
}

/* ── Scheduling ──────────────────────────────────────────────────────── */

// Do NOT discard callbacks at the scheduler level. Modules use their RAF body
// to clear flags such as `queued`, `flushQueued` and `pointerQueued`; skipping
// the callback can strand those flags permanently. Runtime guards inside the
// callback suppress the actual reconciliation while disabled.
export const raf = typeof window !== 'undefined' && window.requestAnimationFrame
  ? window.requestAnimationFrame.bind(window)
  : (fn => setTimeout(fn, 16));
