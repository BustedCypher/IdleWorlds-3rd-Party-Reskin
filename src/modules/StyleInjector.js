/**
 * StyleInjector
 *
 * Injects CSS strings into the page as <style> tags. Every skin stylesheet is
 * lifecycle-owned so the runtime kill switch can remove the COMPLETE theme,
 * including base.css, without uninstalling or reloading the extension.
 *
 * CSS imported as text resolves relative url() references against the PAGE,
 * not the extension. Rewrite ../assets/... references to chrome-extension://
 * URLs before injection so self-hosted fonts/sprites remain CSP-proof.
 */

import { assetUrl } from './Runtime.js';

const _injected = new Set();

function rewriteAssetUrls(css) {
  return String(css || '').replace(
    /url\(\s*(['"]?)\.\.\/assets\/([^)'"\s]+)\1\s*\)/g,
    (_match, _quote, path) => `url("${assetUrl(`assets/${path}`)}")`
  );
}

/**
 * @param {string} id   Unique identifier — prevents double injection.
 * @param {string} css  The CSS text to inject.
 */
export function inject(id, css) {
  if (_injected.has(id)) return;
  _injected.add(id);

  const style = document.createElement('style');
  style.setAttribute('data-iw-style', id);
  style.textContent = rewriteAssetUrls(css);
  (document.head || document.documentElement).appendChild(style);
}

/** Remove every stylesheet this module injected. Kill switch. */
export function removeAll() {
  document.querySelectorAll('style[data-iw-style]').forEach(el => el.remove());
  _injected.clear();
}
