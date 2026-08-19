/**
 * Smoke test — boots the built bundle against a synthetic IdleWorlds-shaped DOM
 * in jsdom, drives a few mutation cycles, and asserts that:
 *
 *   • the bundle boots without throwing
 *   • no network request is made (assets and cache must be local)
 *   • the game's own text nodes are never detached  <- the S1.4 regression guard
 *   • an inventory row gets skinned
 *   • the kill switch fully restores the native DOM
 *
 * This is not a visual test. It exists to catch the class of failure that is
 * invisible until it breaks someone's game: DOM mutation of React-owned nodes,
 * boot-order errors, and teardown leaks.
 *
 *   node test/smoke.mjs
 */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../dist/content.bundle.js', import.meta.url), 'utf8');

const settle = ms => new Promise(r => setTimeout(r, ms));

/**
 * Poll until `predicate` holds. jsdom only advances requestAnimationFrame when
 * the event loop cycles, so a single long sleep starves the frame loop and
 * makes the skin look broken when it is not. Poll in short slices instead.
 */
async function waitFor(predicate, { timeout = 4000, step = 40 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await settle(step);
  }
  return predicate();
}

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const PAGE = `<!doctype html><html><head><title>IdleWorlds</title></head><body>
  <div id="root">
    <div class="app">
      <nav><button>Game</button><button>Market</button><button>Leaderboards</button>
           <button>Village</button><button>Dungeon</button></nav>
      <h2>Inventory</h2>
      <section aria-label="Inventory">
        <div class="compact-row">
          <div><span>Iron Sword</span><span>Lv 3</span></div>
          <div><span>Tier 4 · Weapon</span></div>
          <div><span>In loadout: Main</span></div>
          <button>Equip</button><button>List</button>
        </div>
      </section>
      <div class="compact-panel">
        <div><span>Mining</span></div>
        <div><span>Mine Copper Ore</span><span>Requires Mining Lv 2</span></div>
        <div><button>Mine</button></div>
      </div>
      <div class="quest-description"><p>Bring the smith an Iron Sword to continue.</p></div>
    </div>
  </div>
</body></html>`;

const dom = new JSDOM(PAGE, { url: 'https://idleworlds.com/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

/* ── Instrumentation ─────────────────────────────────────────────────── */

const networkCalls = [];
window.fetch = (url, ...rest) => {
  networkCalls.push(String(url));
  return Promise.reject(new Error('network disabled in smoke test'));
};

// jsdom does not implement matchMedia; TooltipEngine.isMobile() needs it.
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
}

const storage = new Map();
window.chrome = {
  runtime: { id: 'smoke-test', getURL: p => `chrome-extension://smoke/${p}` },
  storage: {
    local: {
      get: async key => (storage.has(key) ? { [key]: storage.get(key) } : {}),
      set: async bag => { for (const [k, v] of Object.entries(bag)) storage.set(k, v); },
      remove: async key => { storage.delete(key); },
    },
    onChanged: {
      _listeners: [],
      addListener(fn) { this._listeners.push(fn); },
      removeListener(fn) { this._listeners = this._listeners.filter(f => f !== fn); },
      _emit(changes) { for (const fn of this._listeners) fn(changes, 'local'); },
    },
  },
};

// jsdom has no CSS Custom Highlight API; NameScanner must degrade, not throw.
// Deliberately left undefined.

// Track every text node the "game" created, so we can prove none was detached.
const gameTextNodes = [];
(function collect(node) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) gameTextNodes.push(child);
    else collect(child);
  }
})(window.document.body);

const document_ready = () =>
  !!window.document.querySelector('.compact-row > .fs-inv-row') &&
  !!window.document.querySelector('[data-iw-ui="main-nav"]');

const consoleErrors = [];
const origError = console.error;
console.error = (...args) => { consoleErrors.push(args.join(' ')); origError(...args); };

/* ── Boot ────────────────────────────────────────────────────────────── */

console.log('\nsmoke: boot');
let bootThrew = null;
try {
  const fn = new window.Function(bundle);
  fn.call(window);
} catch (err) {
  bootThrew = err;
}
check('bundle boots without throwing', !bootThrew, bootThrew?.message);

await waitFor(() => document_ready());

// items.json is the game's own same-origin API and is expected. What must NOT
// appear is any THIRD-PARTY origin: those are the CSP-exposed fetches the S1.1
// and S1.2 fixes removed.
const thirdParty = networkCalls.filter(u => !/^chrome-extension:/.test(u) && !/^https:\/\/idleworlds\.com\//.test(u));
check('no third-party network requests', thirdParty.length === 0, thirdParty.join(', '));
check('atlas assets fetched from the extension bundle',
  networkCalls.some(u => u.startsWith('chrome-extension://')),
  networkCalls.join(', '));

/* ── React-safety: the core S1.4 guarantee ───────────────────────────── */

console.log('\nsmoke: React safety');
const detached = gameTextNodes.filter(n => !n.isConnected);
check('no game text node was detached', detached.length === 0,
  detached.map(n => JSON.stringify(n.nodeValue)).join(' | '));

const injectedSpans = window.document.querySelectorAll('[data-iw-name-scan]');
check('no name-scan wrapper elements inserted', injectedSpans.length === 0,
  `${injectedSpans.length} found`);

/* ── Rendering ───────────────────────────────────────────────────────── */

console.log('\nsmoke: rendering');
const row = window.document.querySelector('.compact-row');
check('inventory row received an overlay', !!row.querySelector(':scope > .fs-inv-row'));
check('inventory root was classified', !!window.document.querySelector('[data-iw-inventory-root]'));
check('native Equip button still present',
  [...row.querySelectorAll('button')].some(b => b.textContent.trim() === 'Equip'));

const panel = window.document.querySelector('.compact-panel');
check('mining panel classified as a skill panel', panel.classList.contains('fs-skill--mining'),
  panel.className);

check('main nav classified', !!window.document.querySelector('[data-iw-ui="main-nav"]'));

/* ── Mutation burst: the flush budget must not drop work ─────────────── */

console.log('\nsmoke: mutation burst');
const section = window.document.querySelector('section[aria-label="Inventory"]');
for (let i = 0; i < 120; i += 1) {
  const r = window.document.createElement('div');
  r.className = 'compact-row';
  r.innerHTML = `<div><span>Iron Sword</span></div><button>Equip</button>`;
  section.appendChild(r);
}
await waitFor(() => [...window.document.querySelectorAll('.compact-row')]
  .every(r => r.querySelector(':scope > .fs-inv-row')), { timeout: 8000 });
const rendered = [...window.document.querySelectorAll('.compact-row')]
  .filter(r => r.querySelector(':scope > .fs-inv-row')).length;
check('all 121 rows eventually rendered across frames', rendered === 121, `rendered ${rendered}`);

/* ── Kill switch ─────────────────────────────────────────────────────── */

console.log('\nsmoke: kill switch');
window.chrome.storage.onChanged._emit({ 'iw-skin-enabled': { newValue: false } });
await waitFor(() => window.document.querySelectorAll('.fs-inv-row').length === 0);

check('overlays removed', window.document.querySelectorAll('.fs-inv-row').length === 0);
check('skin stylesheets removed', window.document.querySelectorAll('style[data-iw-style]').length === 0);
check('ui role attributes removed', window.document.querySelectorAll('[data-iw-ui]').length === 0);
check('skill panel classes removed', window.document.querySelectorAll('.fs-skill-panel').length === 0);
check('native Equip button survived teardown',
  [...window.document.querySelector('.compact-row').querySelectorAll('button')]
    .some(b => b.textContent.trim() === 'Equip'));
check('no game text node detached after teardown',
  gameTextNodes.every(n => n.isConnected));

/* ── Result ──────────────────────────────────────────────────────────── */

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`} — ${consoleErrors.length} console.error(s)\n`);
process.exitCode = failures === 0 ? 0 : 1;
