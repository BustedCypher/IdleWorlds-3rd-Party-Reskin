/**
 * StyleInjector — the Fantasy profile's lifecycle-owned <style> tags. Forked
 * from Legacy's (2026-10-15) with its OWN marker, `data-iw-fantasy-style`, so
 * a Legacy sweep of `style[data-iw-style]` and a Fantasy one never touch each
 * other's sheets.
 *
 * CSS imported as text resolves url() against the PAGE, so `url('../assets/…')`
 * is rewritten to the extension's own URL. Use exactly that form in Fantasy
 * stylesheets or the asset will 404.
 */

import { assetUrl } from './Runtime.js';

export const STYLE_ATTR = 'data-iw-fantasy-style';

function rewriteAssetUrls(css) {
  return String(css || '').replace(
    /url\(\s*(['"]?)\.\.\/assets\/([^)'"\s]+)\1\s*\)/g,
    (_match, _quote, path) => `url("${assetUrl(`assets/${path}`)}")`
  );
}

export function inject(id, css) {
  if (document.querySelector(`style[${STYLE_ATTR}="${id}"]`)) return;
  const style = document.createElement('style');
  style.setAttribute(STYLE_ATTR, id);
  style.textContent = rewriteAssetUrls(css);
  (document.head || document.documentElement).appendChild(style);
}

export function removeAll() {
  document.querySelectorAll(`style[${STYLE_ATTR}]`).forEach(el => el.remove());
}

/** Remove one sheet (a feature standing down while the profile runs on). */
export function remove(id) {
  document.querySelector(`style[${STYLE_ATTR}="${id}"]`)?.remove();
}

/**
 * Create or update a sheet whose text Fantasy generates at runtime (e.g. one
 * sprite window per item seen). Writes only when the text changed. No asset
 * rewriting: a generated sheet references the static sheets' variables.
 */
export function setSheet(id, css) {
  let style = document.querySelector(`style[${STYLE_ATTR}="${id}"]`);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, id);
    (document.head || document.documentElement).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}
