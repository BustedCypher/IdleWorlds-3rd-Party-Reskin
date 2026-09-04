/**
 * OverlayFramer unit test.
 *
 * Detection is layout-dependent (fixed position + covers the viewport + reads
 * as a backdrop), which jsdom does not compute on its own, so this harness
 * stubs getComputedStyle / getBoundingClientRect from per-element `data-cs` /
 * `data-rect` fixtures and drives the module directly. It pins:
 *
 *   - a captured "Players Online" shape (a `fixed inset-0 z-50 bg-black/65
 *     backdrop-blur` layer wrapping a `.panel`) gets scrim + panel tags;
 *   - a plain in-page `.panel` is never tagged (negative control);
 *   - a transparent full-screen positioning layer is not a scrim;
 *   - a scrim that stops covering the viewport is un-tagged on the next pass;
 *   - clearOverlayFramer() removes every attribute the module wrote.
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { frameOverlays, clearOverlayFramer } from '../src/modules/OverlayFramer.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

const VIEW = { w: 412, h: 915 };

// Module reads bare globals (getComputedStyle, innerWidth/Height, document).
globalThis.document = document;
globalThis.innerWidth = VIEW.w;
globalThis.innerHeight = VIEW.h;
globalThis.getComputedStyle = (el) => {
  const base = {
    position: 'static', zIndex: 'auto', display: 'block', visibility: 'visible',
    opacity: '1', backgroundColor: 'rgba(0, 0, 0, 0)', backdropFilter: 'none',
    webkitBackdropFilter: 'none',
  };
  let over = {};
  try { over = JSON.parse(el.getAttribute('data-cs') || '{}'); } catch { over = {}; }
  return { ...base, ...over };
};

window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  let r = null;
  try { r = JSON.parse(this.getAttribute('data-rect') || 'null'); } catch { r = null; }
  if (r) return { x: r.x ?? 0, y: r.y ?? 0, left: r.x ?? 0, top: r.y ?? 0, width: r.w, height: r.h, right: (r.x ?? 0) + r.w, bottom: (r.y ?? 0) + r.h };
  return { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
};

const FULL_RECT = JSON.stringify({ x: 0, y: 0, w: VIEW.w, h: VIEW.h });
const CARD_RECT = JSON.stringify({ x: 12, y: 144, w: 388, h: 626 });

document.body.innerHTML = `
  <main>
    <div class="panel" id="page-panel"
         data-cs='{"position":"relative"}' data-rect='{"x":8,"y":8,"w":380,"h":300}'>
      <h2>Inventory</h2>
    </div>
  </main>
  <div class="fixed inset-0 z-50" id="scrim"
       data-cs='{"position":"fixed","zIndex":"50","display":"flex","backgroundColor":"rgba(0, 0, 0, 0.65)","backdropFilter":"blur(4px)"}'
       data-rect='${FULL_RECT}'>
    <div class="panel" id="modal-panel" data-cs='{"position":"static"}' data-rect='${CARD_RECT}'>
      <div><h2>Players Online</h2><button>Close</button></div>
      <div class="space-y-4"><div>Active now (16)</div></div>
    </div>
  </div>
  <div class="fixed inset-0" id="bare-layer"
       data-cs='{"position":"fixed","zIndex":"10"}' data-rect='${FULL_RECT}'>
    <div id="bare-child" data-rect='{"x":0,"y":0,"w":100,"h":40}">x</div>
  </div>`;

const scrim = document.getElementById('scrim');
const modalPanel = document.getElementById('modal-panel');
const pagePanel = document.getElementById('page-panel');
const bareLayer = document.getElementById('bare-layer');

/* ── 1. Detection ─────────────────────────────────────────────────────── */
frameOverlays();

assert.equal(scrim.dataset.iwOverlay, 'scrim', 'the backdrop is tagged scrim');
assert.equal(modalPanel.dataset.iwOverlay, 'panel', 'the .panel inside it is tagged panel');
assert.equal(pagePanel.dataset.iwOverlay, undefined, 'a plain in-page .panel is never tagged');
assert.equal(bareLayer.dataset.iwOverlay, undefined,
  'a transparent full-screen positioning layer is not a scrim');

/* ── 2. Idempotent ───────────────────────────────────────────────────── */
frameOverlays();
assert.equal(scrim.dataset.iwOverlay, 'scrim', 'second pass keeps the scrim tag');
assert.equal(modalPanel.dataset.iwOverlay, 'panel', 'second pass keeps the panel tag');

/* ── 3. The dialog closes: scrim stops covering the viewport ──────────── */
scrim.setAttribute('data-cs', '{"position":"fixed","zIndex":"50","display":"none"}');
scrim.setAttribute('data-rect', JSON.stringify({ x: 0, y: 0, w: 0, h: 0 }));
frameOverlays();
assert.equal(scrim.dataset.iwOverlay, undefined, 'a scrim that no longer reads as an overlay is un-tagged');

/* ── 4. Teardown ─────────────────────────────────────────────────────── */
// Re-open and re-tag, then kill-switch.
scrim.setAttribute('data-cs', '{"position":"fixed","zIndex":"50","display":"flex","backgroundColor":"rgba(0, 0, 0, 0.65)","backdropFilter":"blur(4px)"}');
scrim.setAttribute('data-rect', FULL_RECT);
frameOverlays();
assert.equal(scrim.dataset.iwOverlay, 'scrim', 're-tag after re-open');
assert.equal(modalPanel.dataset.iwOverlay, 'panel', 're-tag the panel after re-open');

clearOverlayFramer();
assert.equal(document.querySelectorAll('[data-iw-overlay]').length, 0,
  'clearOverlayFramer removes every attribute the module wrote');

console.log('PASS overlay-framer');
