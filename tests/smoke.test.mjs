/**
 * Smoke test — boots the built bundle against a synthetic IdleWorlds-shaped DOM
 * in jsdom, drives mutation cycles and a full disable/re-enable lifecycle, and
 * asserts that:
 *
 *   • the bundle boots without throwing
 *   • no third-party network request is made
 *   • the game's own text nodes are never detached  <- the S1.4 regression guard
 *   • inventory / skill / navigation presentation mounts
 *   • equal-length native text changes still reconcile
 *   • the kill switch removes the COMPLETE active theme
 *   • native inline styles survive teardown exactly
 *   • re-enable rebuilds presentation without duplicating listeners/surfaces
 *   • a second teardown is just as clean as the first
 *
 * This is not a visual test. It exists to catch the class of failure that is
 * invisible until it breaks someone's game: DOM mutation of React-owned nodes,
 * boot-order errors, stale reconciliation caches, teardown leaks, destructive
 * style cleanup and asymmetric enable/disable state.
 */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../dist/content.bundle.js', import.meta.url), 'utf8');

const settle = ms => new Promise(r => setTimeout(r, ms));

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
      <section aria-label="Inventory" id="inventory-section" style="background-color:#0f172a">
        <div class="compact-row">
          <div><span>Iron Sword</span><span>Lv 3</span></div>
          <div><span>Tier 4 · Weapon</span></div>
          <div><span>In loadout: Main</span></div>
          <div><span id="native-qty">x1</span></div>
          <button>Equip</button><button>List</button>
        </div>
      </section>
      <div class="compact-panel">
        <div><span>Mining</span></div>
        <div><span>Mine Copper Ore</span><span>Requires Mining Lv 2</span></div>
        <div><button id="skill-action" style="width:77px;color:rgb(1, 2, 3)">Mine</button></div>
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

const skillAction = window.document.getElementById('skill-action');
const nativeQty = window.document.getElementById('native-qty');
const skillActionText = skillAction.firstChild;
const nativeQtyText = nativeQty.firstChild;
const inventorySection = window.document.getElementById('inventory-section');
const nativeSkillStyle = skillAction.style.cssText;
const nativeSectionStyle = inventorySection.style.cssText;

// Track every text node the "game" created, so we can prove none was detached.
const gameTextNodes = [];
(function collect(node) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) gameTextNodes.push(child);
    else collect(child);
  }
})(window.document.body);

const documentReady = () =>
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

await waitFor(() => documentReady());

const thirdParty = networkCalls.filter(u => !/^chrome-extension:/.test(u) && !/^https:\/\/idleworlds\.com\//.test(u));
check('no third-party network requests', thirdParty.length === 0, thirdParty.join(', '));
check('atlas assets fetched from the extension bundle',
  networkCalls.some(u => u.startsWith('chrome-extension://')),
  networkCalls.join(', '));
check('all five runtime stylesheets mounted',
  window.document.querySelectorAll('style[data-iw-style]').length === 5,
  `${window.document.querySelectorAll('style[data-iw-style]').length} mounted`);
check('base stylesheet is runtime-owned',
  !!window.document.querySelector('style[data-iw-style="base"]'));
check('base stylesheet rewrites font URLs to extension assets',
  window.document.querySelector('style[data-iw-style="base"]')?.textContent.includes('chrome-extension://smoke/assets/fonts/') === true);
check('exactly one tooltip surface exists', window.document.querySelectorAll('.iw-tip').length === 1);

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
check('initial quantity rendered', row.querySelector('.fs-inv-qty')?.textContent === '×1',
  row.querySelector('.fs-inv-qty')?.textContent || 'missing');

const panel = window.document.querySelector('.compact-panel');
check('mining panel classified as a skill panel', panel.classList.contains('fs-skill--mining'),
  panel.className);
check('skill renderer actively overrides native inline width while enabled', skillAction.style.width === '96px', skillAction.style.cssText);
check('background painter actively overrides native navy while enabled',
  inventorySection.style.getPropertyValue('background-color') !== 'rgb(15, 23, 42)',
  inventorySection.style.cssText);
check('main nav classified', !!window.document.querySelector('[data-iw-ui="main-nav"]'));

/* ── Equal-length reconciliation ─────────────────────────────────────── */

console.log('\nsmoke: equal-length reconciliation');
// Let the renderer consume the mutation caused by adding its own overlay so the
// cheap Inventory signature is definitely in its steady state before mutation.
await settle(120);

// Mutate nodeValue rather than assigning textContent: this mirrors React's text
// update path and keeps the original game Text node connected throughout.
nativeQtyText.nodeValue = 'x2'; // same length as x1
await waitFor(() => row.querySelector('.fs-inv-qty')?.textContent === '×2');
check('equal-length inventory quantity change reconciles',
  row.querySelector('.fs-inv-qty')?.textContent === '×2',
  row.querySelector('.fs-inv-qty')?.textContent || 'missing');

nativeQtyText.nodeValue = 'x1';
await waitFor(() => row.querySelector('.fs-inv-qty')?.textContent === '×1');
check('inventory quantity reconciles back', row.querySelector('.fs-inv-qty')?.textContent === '×1');

skillActionText.nodeValue = 'Fish'; // same length as Mine
await waitFor(() => panel.classList.contains('fs-skill--fishing'));
check('equal-length skill action change invalidates skill cache',
  panel.classList.contains('fs-skill--fishing'), panel.className);

skillActionText.nodeValue = 'Mine';
await waitFor(() => panel.classList.contains('fs-skill--mining'));
check('skill classification reconciles back to mining',
  panel.classList.contains('fs-skill--mining'), panel.className);

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

/* ── First disable ───────────────────────────────────────────────────── */

console.log('\nsmoke: first disable');
window.chrome.storage.onChanged._emit({ 'iw-skin-enabled': { newValue: false } });
await waitFor(() => window.document.querySelectorAll('.fs-inv-row').length === 0);

check('overlays removed', window.document.querySelectorAll('.fs-inv-row').length === 0);
check('ALL runtime stylesheets removed', window.document.querySelectorAll('style[data-iw-style]').length === 0);
check('ui role attributes removed', window.document.querySelectorAll('[data-iw-ui]').length === 0);
check('skill panel classes removed', window.document.querySelectorAll('.fs-skill-panel').length === 0);
check('native Equip button survived teardown',
  [...window.document.querySelector('.compact-row').querySelectorAll('button')]
    .some(b => b.textContent.trim() === 'Equip'));
check('skill native inline style restored exactly', skillAction.style.cssText === nativeSkillStyle,
  `expected ${JSON.stringify(nativeSkillStyle)}, got ${JSON.stringify(skillAction.style.cssText)}`);
check('background native inline style restored exactly', inventorySection.style.cssText === nativeSectionStyle,
  `expected ${JSON.stringify(nativeSectionStyle)}, got ${JSON.stringify(inventorySection.style.cssText)}`);
check('no game text node detached after teardown', gameTextNodes.every(n => n.isConnected));

/* ── Re-enable ───────────────────────────────────────────────────────── */

console.log('\nsmoke: re-enable');
window.chrome.storage.onChanged._emit({ 'iw-skin-enabled': { newValue: true } });
await waitFor(() => documentReady(), { timeout: 8000 });

check('inventory presentation returns after re-enable',
  !!window.document.querySelector('.compact-row > .fs-inv-row'));
check('navigation classification returns after re-enable',
  !!window.document.querySelector('[data-iw-ui="main-nav"]'));
check('skill presentation returns after re-enable', panel.classList.contains('fs-skill--mining'));
check('exactly five stylesheets re-injected',
  window.document.querySelectorAll('style[data-iw-style]').length === 5,
  `${window.document.querySelectorAll('style[data-iw-style]').length} mounted`);
check('base stylesheet re-injected', !!window.document.querySelector('style[data-iw-style="base"]'));
check('tooltip surface was not duplicated', window.document.querySelectorAll('.iw-tip').length === 1);
check('storage listener was not duplicated', window.chrome.storage.onChanged._listeners.length === 1,
  `${window.chrome.storage.onChanged._listeners.length} storage listeners`);

/* ── Second disable ──────────────────────────────────────────────────── */

console.log('\nsmoke: second disable');
window.chrome.storage.onChanged._emit({ 'iw-skin-enabled': { newValue: false } });
await waitFor(() => window.document.querySelectorAll('.fs-inv-row').length === 0);

check('second teardown removes overlays', window.document.querySelectorAll('.fs-inv-row').length === 0);
check('second teardown removes all styles', window.document.querySelectorAll('style[data-iw-style]').length === 0);
check('second teardown restores skill inline style', skillAction.style.cssText === nativeSkillStyle,
  skillAction.style.cssText);
check('second teardown restores background inline style', inventorySection.style.cssText === nativeSectionStyle,
  inventorySection.style.cssText);
check('tooltip surface remains singular', window.document.querySelectorAll('.iw-tip').length === 1);
check('no game text node detached after full lifecycle', gameTextNodes.every(n => n.isConnected));

/* ── Result ──────────────────────────────────────────────────────────── */

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`} — ${consoleErrors.length} console.error(s)\n`);
process.exitCode = failures === 0 ? 0 : 1;
