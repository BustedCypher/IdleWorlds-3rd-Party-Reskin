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
  <div class="panel" id="inventory" data-iw-inventory-root="1"
       data-cs='{"position":"relative"}' data-rect='{"x":8,"y":330,"w":396,"h":500}'>
    <div id="inventory-tools" data-cs='{"position":"relative"}' data-rect='{"x":20,"y":350,"w":372,"h":44}'>
      <div class="relative" id="filter-anchor" data-cs='{"position":"relative"}' data-rect='{"x":300,"y":352,"w":30,"h":31}'>
        <button id="filter-trigger" aria-label="Filter inventory" title="Filter inventory"
                data-rect='{"x":300,"y":352,"w":30,"h":31}'>F</button>
        <div id="filter-popup" class="absolute right-0 top-full z-30"
             data-cs='{"position":"absolute","zIndex":"30"}' data-rect='{"x":120,"y":384,"w":224,"h":210}'>
          <p>Tier</p><button>All</button><button>18</button>
          <p>Type</p><button>Weapon</button><button>Material</button>
        </div>
        <div id="closed-filter-popup" class="absolute right-0 top-full z-30"
             data-cs='{"position":"absolute","zIndex":"30","display":"none"}' data-rect='{"x":120,"y":384,"w":224,"h":210}'>
          <button>Closed</button>
        </div>
      </div>
      <div id="ordinary-absolute" data-cs='{"position":"absolute","zIndex":"30"}'
           data-rect='{"x":40,"y":384,"w":120,"h":60}'><button>Ordinary</button></div>
      <div class="iw-tip" id="inventory-tip" role="dialog"
           data-cs='{"position":"absolute","zIndex":"40"}' data-rect='{"x":40,"y":450,"w":120,"h":80}'><button>Tip</button></div>
    </div>
    <div data-iw-inventory-list="1" id="inventory-list"
         data-cs='{"position":"relative","zIndex":"1"}' data-rect='{"x":20,"y":400,"w":372,"h":400}'>
      <div>Item row</div>
    </div>
  </div>
  <div class="fixed inset-0 z-50" id="scrim"
       data-cs='{"position":"fixed","zIndex":"50","display":"flex","backgroundColor":"rgba(0, 0, 0, 0.65)","backdropFilter":"blur(4px)"}'
       data-rect='${FULL_RECT}'>
    <div class="panel" id="modal-panel" data-cs='{"position":"static"}' data-rect='${CARD_RECT}'>
      <div><h2>Players Online</h2><button>Close</button></div>
      <div class="space-y-4"><div>Active now (16)</div></div>
    </div>
  </div>
  <div class="fixed inset-0 z-50" id="stats-scrim"
       data-cs='{"position":"fixed","zIndex":"50","display":"flex","backgroundColor":"rgba(0, 0, 0, 0.65)","backdropFilter":"blur(4px)"}'
       data-rect='${FULL_RECT}'>
    <div class="panel" id="stats-modal" data-cs='{"position":"static"}' data-rect='${CARD_RECT}'>
      <div><h2>Character Stats</h2><button>Close</button></div>
      <div class="space-y-3">
        <div class="compact-panel p-3 space-y-1.5" id="lifetime-stats">
          <p>Lifetime Stats</p>
          <div id="stat-monsters"><p>⚔️ Monsters Defeated</p><p>12,345</p></div>
          <div id="stat-wood"><p style="font-weight:700">🪓 Wood Chopped</p><p>6,789</p></div>
          <div id="stat-potions"><p>🧪 Potions Brewed</p><p>321</p></div>
        </div>
      </div>
    </div>
  </div>
  <p id="outside-wood">Unrelated prose: Wood Chopped appears here too.</p>
  <div class="fixed inset-0" id="bare-layer"
       data-cs='{"position":"fixed","zIndex":"10"}' data-rect='${FULL_RECT}'>
    <div id="bare-child" data-rect='{"x":0,"y":0,"w":100,"h":40}">x</div>
  </div>`;

const scrim = document.getElementById('scrim');
const modalPanel = document.getElementById('modal-panel');
const pagePanel = document.getElementById('page-panel');
const bareLayer = document.getElementById('bare-layer');
const filterPopup = document.getElementById('filter-popup');
const filterHost = document.getElementById('inventory-tools');
const closedFilterPopup = document.getElementById('closed-filter-popup');
const ordinaryAbsolute = document.getElementById('ordinary-absolute');
const inventoryTip = document.getElementById('inventory-tip');
const statsScrim = document.getElementById('stats-scrim');
const statsModal = document.getElementById('stats-modal');
const lifetimeStats = document.getElementById('lifetime-stats');
const statRows = ['stat-monsters','stat-wood','stat-potions'].map(id => document.getElementById(id));
const outsideWood = document.getElementById('outside-wood');

/* ── 1. Detection ─────────────────────────────────────────────────────── */
frameOverlays();

assert.equal(scrim.dataset.iwOverlay, 'scrim', 'the backdrop is tagged scrim');
assert.equal(modalPanel.dataset.iwOverlay, 'panel', 'the .panel inside it is tagged panel');
assert.equal(pagePanel.dataset.iwOverlay, undefined, 'a plain in-page .panel is never tagged');
assert.equal(bareLayer.dataset.iwOverlay, undefined,
  'a transparent full-screen positioning layer is not a scrim');
assert.equal(filterPopup.dataset.iwOverlay, 'popup',
  'the deployed Inventory Filters sibling is tagged as a contained popup');
assert.equal(filterHost.dataset.iwOverlayHost, '1',
  'the frame direct child that owns the popup is tagged as its lifted host');
assert.equal(closedFilterPopup.dataset.iwOverlay, undefined,
  'a closed deployed-shape popup is not tagged');
assert.equal(ordinaryAbsolute.dataset.iwOverlay, undefined,
  'an ordinary absolute child with a button is not mistaken for a popup');
assert.equal(inventoryTip.dataset.iwOverlay, undefined,
  'the skin tooltip namespace is excluded from contained popup framing');
assert.equal(statsScrim.dataset.iwOverlay, 'scrim', 'Character Stats backdrop is an owned scrim');
assert.equal(statsModal.dataset.iwOverlay, 'panel', 'Character Stats card is an owned overlay panel');
assert.equal(lifetimeStats.dataset.iwOverlayContent, 'player-stats',
  'the structural Lifetime Stats block is classified as Player Stats content');
for (const row of statRows) {
  assert.equal(row.children[0].dataset.iwOverlayRole, 'stat-label',
    'the first cell of every repeated stat row is the semantic label');
  assert.equal(row.children[1].dataset.iwOverlayRole, 'stat-value',
    'the second cell of every repeated stat row is the semantic value');
}
assert.equal(outsideWood.dataset.iwOverlayRole, undefined,
  'unrelated Wood Chopped prose outside the stats modal is untouched');

/* ── 2. Idempotent ───────────────────────────────────────────────────── */
frameOverlays();
assert.equal(scrim.dataset.iwOverlay, 'scrim', 'second pass keeps the scrim tag');
assert.equal(modalPanel.dataset.iwOverlay, 'panel', 'second pass keeps the panel tag');
assert.equal(filterPopup.dataset.iwOverlay, 'popup', 'second pass keeps the contained popup tag');
assert.equal(filterHost.dataset.iwOverlayHost, '1', 'second pass keeps the popup host tag');
assert.equal(lifetimeStats.dataset.iwOverlayContent, 'player-stats',
  'second pass keeps Player Stats content classification without duplication');

/* ── 3. The dialog closes: scrim stops covering the viewport ──────────── */
scrim.setAttribute('data-cs', '{"position":"fixed","zIndex":"50","display":"none"}');
scrim.setAttribute('data-rect', JSON.stringify({ x: 0, y: 0, w: 0, h: 0 }));
frameOverlays();
assert.equal(scrim.dataset.iwOverlay, undefined, 'a scrim that no longer reads as an overlay is un-tagged');

/* ── 4. Contained popup closes while its wrapper remains ─────────────── */
filterPopup.setAttribute('data-cs', '{"position":"absolute","zIndex":"30","display":"none"}');
filterPopup.setAttribute('data-rect', JSON.stringify({ x: 120, y: 384, w: 0, h: 0 }));
frameOverlays();
assert.equal(filterPopup.dataset.iwOverlay, undefined, 'closed popup loses its popup marker');
assert.equal(filterHost.dataset.iwOverlayHost, undefined, 'closing the popup releases the lifted host marker');

/* ── 5. Teardown ─────────────────────────────────────────────────────── */
// Re-open and re-tag, then kill-switch.
scrim.setAttribute('data-cs', '{"position":"fixed","zIndex":"50","display":"flex","backgroundColor":"rgba(0, 0, 0, 0.65)","backdropFilter":"blur(4px)"}');
scrim.setAttribute('data-rect', FULL_RECT);
filterPopup.setAttribute('data-cs', '{"position":"absolute","zIndex":"30"}');
filterPopup.setAttribute('data-rect', JSON.stringify({ x: 120, y: 384, w: 224, h: 210 }));
frameOverlays();
assert.equal(scrim.dataset.iwOverlay, 'scrim', 're-tag after re-open');
assert.equal(modalPanel.dataset.iwOverlay, 'panel', 're-tag the panel after re-open');
assert.equal(filterPopup.dataset.iwOverlay, 'popup', 're-tag the contained popup after re-open');
assert.equal(filterHost.dataset.iwOverlayHost, '1', 're-tag its direct host after re-open');

clearOverlayFramer();
assert.equal(document.querySelectorAll('[data-iw-overlay]').length, 0,
  'clearOverlayFramer removes every overlay attribute the module wrote');
assert.equal(document.querySelectorAll('[data-iw-overlay-host]').length, 0,
  'clearOverlayFramer removes every contained-popup host attribute');
assert.equal(document.querySelectorAll('[data-iw-overlay-content],[data-iw-overlay-role]').length, 0,
  'clearOverlayFramer removes Player Stats content and role markers');

console.log('PASS overlay-framer');
