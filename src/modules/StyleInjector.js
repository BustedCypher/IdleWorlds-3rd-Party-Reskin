/**
 * StyleInjector
 *
 * Injects CSS strings into the page as <style> tags.
 * Because MV3 bundles CSS as text via the `loader: {'.css': 'text'}` esbuild
 * config, each module can import its own .css file and call inject() once.
 *
 * Usage:
 *   import css from '../styles/inventory.css';
 *   import { inject } from './StyleInjector.js';
 *   inject('inventory', css);
 */

const _injected = new Set();

/**
 * @param {string} id   Unique identifier — prevents double injection.
 * @param {string} css  The CSS text to inject.
 */
export function inject(id, css) {
  if (_injected.has(id)) return;
  _injected.add(id);

  const style = document.createElement('style');
  style.setAttribute('data-iw-style', id);
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

/** Remove every stylesheet this module injected. Kill switch. */
export function removeAll() {
  document.querySelectorAll('style[data-iw-style]').forEach(el => el.remove());
  _injected.clear();
}
