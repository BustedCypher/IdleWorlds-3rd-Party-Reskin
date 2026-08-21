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
        <div class="compact-row" id="enhanced-row">
          <div><span>Wool Boots</span><span>+4</span></div>
          <div><span>Tier 1 · Boots</span><span>DEF +2</span><span>+3% 2x gather chance</span></div>
          <div><span>In loadout: Item Find</span><span>Cut Sunstone: +6% Item Find</span></div>
          <div><span>x1</span></div>
          <button>Equip</button><button>List</button>
        </div>
      </section>
      <div class="compact-panel">
        <div><span>Mining</span></div>
        <div><span>Mine Copper Ore</span><span>Requires Mining Lv 2</span></div>
        <div><button id="skill-action" style="width:77px;color:rgb(1, 2, 3)">Mine</button></div>
      </div>
      <div class="compact-panel" id="jewel-panel">
        <div><span>💎</span><span>Jewel</span><span>LV 68</span></div>
        <div><span>Prospect Silver Ore</span><button>Lv 68 - 49.3% • 27,902,163 to go</button><span>Silver Ore 6277/2</span><span>Requires Jewelcrafting Lv 9</span><span>Base reward: +43 jewelcrafting XP/task</span></div>
        <div><div><button>‹</button><button>›</button></div><button id="jewel-action">Prospect</button></div>
      </div>
      <div class="compact-panel" id="spell-panel">
        <div><span>✨</span><span>Spellcraft</span><span>LV 57</span></div>
        <div><span>Harvest Silver Mana</span><span>Gather Silver Mana from the ether</span><button>Lv 57 - 94.6% • 334,517 to go</button><span>Requires Spellcraft Lv 9</span><span>Base reward: +22 spellcrafting XP/task</span></div>
        <div><div><button>‹</button><button>›</button></div><button id="spell-action">Gather</button></div>
      </div>
      <div class="compact-panel" id="tailor-panel">
        <div><span>🧵</span><span>Tailor</span><span>LV 26</span></div>
        <div><span>Weave Wool Cloth</span><button>Lv 26 - 21.0% • 13,450 to go</button><span>Wool 4/6</span><span>Requires Tailoring Lv 9 and Gathering Lv 5</span><span>Base reward: +130 tailoring XP/task</span><span>Missing materials — will queue (gather first)</span></div>
        <div><div><button>‹</button><button>›</button></div><button id="tailor-action">Weave</button></div>
      </div>
      <div class="quest-description"><p>Bring the smith an Iron Sword to continue.</p></div>
      <div id="unclassified-area"><div><span><em id="plain-item-text">Found an Iron Sword in the wilderness.</em></span></div></div>
      <button id="native-item-button"><span><strong id="button-item-text">Iron Sword</strong></span></button>
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

let coarsePointer = false;
window.matchMedia = query => ({
  matches: coarsePointer && /(hover:\s*none|pointer:\s*coarse)/i.test(query),
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
});

const storage = new Map();
storage.set('iw-item-db-cache', {
  items: [{
    item_id: 'iron_sword', name: 'Iron Sword', wiki_slug: 'iron_sword', tier: 4,
    category: 'Equipment', subcategory: 'Weapon slot', req_skill: 'combat', req_level: 3,
    req_text: 'Requires Combat Lv 3', atk: 18, def: 7, xp_per_task: 4,
    double_gather_pct: 8, gold_find_pct: 3, base_value: 125, trader_token_value: 1,
    effects_raw: 'ATK +18 \u0007 DEF +7, Requires Combat Lv 3, XP +4/task, +8% 2x gather chance',
    acquisition_type: 'ZoneDrop', drop_rate: '1/20000', drop_boosted_by: 'Item Find %',
  }, {
    item_id: 'wool_boots_plus_4', name: 'Wool Boots+4', wiki_slug: 'wool_boots_plus_4', tier: 1,
    category: 'Equipment', subcategory: 'Boots', def: 2, sockets: 2,
    effects_raw: 'DEF +2, +3% 2x gather chance, 2 Sockets',
    acquisition_type: 'Upgrade', acquisition_summary: 'Apply an Upgrade Orb to Wool Boots+3',
  }],
  generatedAt: 'smoke-tooltip-data', cachedAt: Date.now(),
});
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

let pointerTarget = window.document.body;
let caretNode = null;
window.document.elementFromPoint = () => pointerTarget;
window.document.caretPositionFromPoint = () => caretNode ? { offsetNode: caretNode, offset: 0 } : null;
window.document.caretRangeFromPoint = () => {
  if (!caretNode) return null;
  const r = window.document.createRange();
  r.setStart(caretNode, 0);
  r.setEnd(caretNode, 0);
  return r;
};
window.Range.prototype.getClientRects = function getClientRects() {
  return [{ left: 10, top: 10, right: 110, bottom: 30, width: 100, height: 20 }];
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
const enhancedRow = window.document.getElementById('enhanced-row');
const enhancedOverlay = enhancedRow.querySelector(':scope > .fs-inv-row');
check('separate +4 badge resolves enhanced item identity', enhancedOverlay?.querySelector('.iw-item-ref')?.getAttribute('data-iw-item') === 'wool_boots_plus_4');
check('enhanced Tailoring bonus survives Inventory replacement', [...enhancedOverlay.querySelectorAll('.fs-stat')].some(el => el.textContent.trim() === '2× gather 3%'));
check('enhanced row preserves per-copy loadout and socket details', enhancedOverlay.textContent.includes('In loadout: Item Find') && enhancedOverlay.textContent.includes('Cut Sunstone: +6% Item Find'));

const panel = window.document.querySelector('.compact-panel');
check('mining panel classified as a skill panel', panel.classList.contains('fs-skill--mining'),
  panel.className);
check('skill renderer actively overrides native inline width while enabled', skillAction.style.width === '96px', skillAction.style.cssText);
check('background painter actively overrides native navy while enabled',
  inventorySection.style.getPropertyValue('background-color') !== 'rgb(15, 23, 42)',
  inventorySection.style.cssText);
check('main nav classified', !!window.document.querySelector('[data-iw-ui="main-nav"]'));

const jewelPanel = window.document.getElementById('jewel-panel');
const spellPanel = window.document.getElementById('spell-panel');
const tailorPanel = window.document.getElementById('tailor-panel');
check('live Jewel label gets jewelcrafting three-zone layout',
  jewelPanel.classList.contains('fs-skill--jewelcrafting') && jewelPanel.dataset.iwSkillLayout === 'three-zone');
check('Spellcraft identity wins over ambiguous Gather action',
  spellPanel.classList.contains('fs-skill--spellcrafting') && !spellPanel.classList.contains('fs-skill--gathering') && spellPanel.dataset.iwSkillLayout === 'three-zone');
check('Spellcraft secondary description is normalised',
  !!spellPanel.querySelector('[data-iw-skill-role="action-detail"]'));
check('live Tailor + Weave gets tailoring three-zone layout',
  tailorPanel.classList.contains('fs-skill--tailoring') && tailorPanel.dataset.iwSkillLayout === 'three-zone',
  tailorPanel.className + ' layout=' + (tailorPanel.dataset.iwSkillLayout || 'none') + ' roles=' +
    [...tailorPanel.querySelectorAll('[data-iw-skill-role]')].map(el => el.getAttribute('data-iw-skill-role') + ':' + el.textContent.trim()).join(' | '));
check('live skill action buttons use deterministic width',
  ['jewel-action', 'spell-action', 'tailor-action'].every(id => window.document.getElementById(id).style.width === '96px'));

/* ── Tooltip coverage / ownership ────────────────────────────────────── */

console.log('\nsmoke: tooltip coverage');
await waitFor(() => !!row.querySelector('.iw-item-ref[data-iw-item]'));
await settle(80); // item-db update also schedules the page-wide name scan
const tooltip = window.document.querySelector('.iw-tip');
const explicitItemRef = row.querySelector('.iw-item-ref[data-iw-item]');
let nativeRowClicks = 0;
row.addEventListener('click', () => { nativeRowClicks += 1; });
const nativeExplicitMatches = explicitItemRef.matches.bind(explicitItemRef);
explicitItemRef.matches = selector => selector === ':hover' ? true : nativeExplicitMatches(selector);
pointerTarget = explicitItemRef;
caretNode = null;
explicitItemRef.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true, clientX: 50, clientY: 20 }));
await waitFor(() => tooltip.classList.contains('is-open'));
check('explicit inventory item name opens tooltip on hover',
  tooltip.classList.contains('is-open') && tooltip.querySelector('.iw-tip-name')?.textContent === 'Iron Sword');
check('rich tooltip renders large atlas artwork slot',
  !!tooltip.querySelector('.iw-tip-art') && !!tooltip.querySelector('.iw-tip-art-fallback'));
check('rich tooltip renders requirement badge',
  [...tooltip.querySelectorAll('.iw-tip-badge.req')].some(el => el.textContent.includes('Requires Combat Lv 3')));
check('rich tooltip renders authoritative effect text',
  (() => { const text = tooltip.querySelector('.iw-tip-effect')?.textContent || ''; return text.includes('ATK +18') && text.includes('DEF +7') && !/[\u0000-\u001f\u007f]/.test(text); })(), tooltip.querySelector('.iw-tip-effect')?.textContent || 'missing');
const richStatText = [...tooltip.querySelectorAll('.iw-tip-stat')].map(el => el.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
check('rich tooltip renders base value and trader turn-in',
  richStatText.includes('Base value125g') && richStatText.includes('Turn-in1 token'), richStatText);
check('rich tooltip renders drop rate and boost source',
  (() => { const text = tooltip.querySelector('.iw-tip-acq-sub')?.textContent || ''; return text.includes('Rate 1/20000') && text.includes('boosted by Item Find %'); })(), tooltip.querySelector('.iw-tip-acq-sub')?.textContent || 'missing');
check('rich tooltip renders wiki link and cache provenance',
  tooltip.querySelector('.iw-tip-link')?.getAttribute('href')?.endsWith('/wiki/items/iron_sword') === true &&
  tooltip.querySelector('.iw-tip-source')?.textContent === 'cached data');
explicitItemRef.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, clientX: 300, clientY: 300, relatedTarget: window.document.body }));
await waitFor(() => !tooltip.classList.contains('is-open'));

coarsePointer = true;
explicitItemRef.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 50, clientY: 20 }));
await waitFor(() => tooltip.classList.contains('is-open'));
check('explicit tooltip trigger does not consume native row click',
  tooltip.classList.contains('is-open') && nativeRowClicks === 1,
  `open=${tooltip.classList.contains('is-open')} rowClicks=${nativeRowClicks}`);
window.document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
await waitFor(() => !tooltip.classList.contains('is-open'));
coarsePointer = false;

const plainItem = window.document.getElementById('plain-item-text');
const plainText = plainItem.firstChild;
const nativeItemButton = window.document.getElementById('native-item-button');
const buttonItem = window.document.getElementById('button-item-text');
const buttonText = buttonItem.firstChild;
let nativeButtonClicks = 0;
nativeItemButton.addEventListener('click', () => { nativeButtonClicks += 1; });

pointerTarget = plainItem;
caretNode = plainText;
plainItem.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 20 }));
await waitFor(() => tooltip.classList.contains('is-open'));
check('unclassified nested native item name opens tooltip on hover',
  tooltip.classList.contains('is-open') && tooltip.querySelector('.iw-tip-name')?.textContent === 'Iron Sword');

pointerTarget = tooltip;
caretNode = null;
tooltip.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 20 }));
await settle(80);
check('virtual item tooltip survives name-to-card pointer handoff', tooltip.classList.contains('is-open'));

pointerTarget = window.document.body;
window.document.body.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 300 }));
await waitFor(() => !tooltip.classList.contains('is-open'));
check('virtual item tooltip closes after pointer leaves name and card', !tooltip.classList.contains('is-open'));

pointerTarget = buttonItem;
caretNode = buttonText;
buttonItem.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 20 }));
await waitFor(() => tooltip.classList.contains('is-open'));
check('item name nested inside native button is also hover-discoverable',
  tooltip.classList.contains('is-open') && tooltip.querySelector('.iw-tip-name')?.textContent === 'Iron Sword');

window.document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
await waitFor(() => !tooltip.classList.contains('is-open'));
check('void click dismisses an open tooltip', !tooltip.classList.contains('is-open'));

coarsePointer = true;
pointerTarget = buttonItem;
caretNode = buttonText;
buttonItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 50, clientY: 20 }));
await waitFor(() => tooltip.classList.contains('is-open'));
check('touch tap on native item text opens tooltip without stealing native click',
  tooltip.classList.contains('is-open') && nativeButtonClicks === 1,
  `open=${tooltip.classList.contains('is-open')} clicks=${nativeButtonClicks}`);

pointerTarget = window.document.body;
caretNode = null;
window.document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
await waitFor(() => !tooltip.classList.contains('is-open'));
check('touch void tap dismisses tooltip', !tooltip.classList.contains('is-open'));
coarsePointer = false;

const lateArea = window.document.createElement('section');
lateArea.id = 'late-unknown-feature';
lateArea.innerHTML = '<div><span><em id="late-item-text">Iron Sword</em></span></div>';
window.document.querySelector('.app').appendChild(lateArea);
await settle(120);
const lateItem = window.document.getElementById('late-item-text');
pointerTarget = lateItem;
caretNode = lateItem.firstChild;
lateItem.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 20 }));
await waitFor(() => tooltip.classList.contains('is-open'));
check('newly mounted unknown React subtree gains item tooltip coverage',
  tooltip.classList.contains('is-open') && tooltip.querySelector('.iw-tip-name')?.textContent === 'Iron Sword');
pointerTarget = window.document.body;
caretNode = null;
window.document.body.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 300 }));
await waitFor(() => !tooltip.classList.contains('is-open'));

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
check('all 122 rows eventually rendered across frames', rendered === 122, `rendered ${rendered}`);

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
