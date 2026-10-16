/**
 * Runtime — the Fantasy profile's own lifecycle flag, asset URLs and error
 * guard. Forked from Legacy's Runtime.js (2026-10-15) and cut down to what
 * Fantasy uses; Fantasy never imports Legacy (tests/skin-boundaries).
 *
 * Degrades without `chrome` (unit tests, a plain <script> harness).
 */

const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

// Inactive until the profile starts: a module imported but never started must
// not reconcile anything.
let runtimeActive = false;

export function setRuntimeActive(active) {
  runtimeActive = active !== false;
}

export function isRuntimeActive() {
  return runtimeActive;
}

/** Resolve a path inside the extension bundle, e.g. 'assets/raids/lobby/x.webp'. */
export function assetUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  if (hasChrome && typeof chrome.runtime.getURL === 'function') return chrome.runtime.getURL(clean);
  return clean; // test/dev fallback only
}

const warned = new Set();

/** Log at most once per key, so a per-frame failure cannot flood the console. */
export function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[IW Fantasy Skin] fantasy ${key}:`, err && err.message ? err.message : err);
}

/** Run `fn` while active, swallowing and reporting any exception. */
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

export const raf = typeof window !== 'undefined' && window.requestAnimationFrame
  ? window.requestAnimationFrame.bind(window)
  : (fn => setTimeout(fn, 16));
