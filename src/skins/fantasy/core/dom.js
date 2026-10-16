/**
 * Small DOM helpers shared by the Fantasy modules (raid, skills).
 *
 * Every node a Fantasy module creates carries `data-iw-fantasy-owned` as well
 * as its module's own marker: the Watcher drops mutations made only of such
 * nodes, and a reader can always tell Fantasy's nodes from the port's.
 */

import { OWNED_ATTR } from './Watcher.js';

export const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
/** Strip a leading emoji/symbol run before any anchored label test (CLAUDE.md). */
export const label = value => norm(value).replace(/^[^\p{L}\p{N}]+/u, '');

/*
 * Every element Fantasy wrote an attribute on, per attribute. The names are
 * Legacy's (data-iw-guild-slot, data-iw-boss-card, …) and the port will one
 * day write the same names, so teardown removes an attribute ONLY from the
 * elements Fantasy wrote it on, never by a document-wide selector sweep:
 * at stand-down that sweep would strip the port's fresh marks too.
 */
const written = new Map(); // attr -> Map<Element, value Fantasy wrote>

/** Removes `key` only while it still holds the value Fantasy wrote: a value
 *  the port has since written over is the port's. */
function release(el, key) {
  const map = written.get(key);
  if (!map?.has(el)) return;
  if (el.getAttribute(key) === map.get(el)) el.removeAttribute(key);
  map.delete(el);
}

/** Set or remove one attribute, writing only when the value changes. */
export function mark(el, key, value) {
  if (!el) return;
  if (value == null) { release(el, key); return; }
  if (el.getAttribute(key) !== value) el.setAttribute(key, value);
  let map = written.get(key);
  if (!map) written.set(key, map = new Map());
  map.set(el, value);
}

/** Remove `attrs` from every element under `root` that Fantasy wrote them on. */
export function unmark(attrs, root = null) {
  for (const attr of attrs) {
    const map = written.get(attr);
    if (!map) continue;
    for (const el of [...map.keys()]) {
      if (root && root !== el && !root.contains(el)) continue;
      release(el, attr);
    }
  }
}

/** Drop elements React has unmounted, so the maps cannot grow without bound. */
export function pruneWritten() {
  for (const map of written.values()) for (const el of map.keys()) if (!el.isConnected) map.delete(el);
}

/** Remove the owned nodes of one module (`attr`) under `root`, Fantasy's only. */
export function removeOwned(attr, root = document) {
  root.querySelectorAll(`[${attr}][${OWNED_ATTR}]`).forEach(node => node.remove());
}

/** An element factory that stamps the module's own marker and Fantasy's. */
export function ownerOf(attr) {
  return function own(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.setAttribute(attr, '1');
    el.setAttribute(OWNED_ATTR, '1');
    if (text != null) el.textContent = text;
    return el;
  };
}

/**
 * Give one of Fantasy's OWN buttons the port's compact plate: the attribute
 * and the three state layers the port's compact-buttons.css paints. Fantasy
 * never writes these on a game button (the port's CompactButtons owns those);
 * the port's sweep only clears buttons it decorated itself, so ours stay.
 */
export function plate(button, own) {
  button.dataset.iwCompactButton = 'text';
  for (const state of ['idle', 'hover', 'clicked']) {
    const layer = own('span');
    layer.dataset.iwCompactLayer = state;
    layer.setAttribute('aria-hidden', 'true');
    button.append(layer);
  }
  return button;
}
