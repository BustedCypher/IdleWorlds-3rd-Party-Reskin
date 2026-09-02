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
      <header id="top-header">
        <div id="profile-block"><h1>BustedCypher</h1><p>Gemcutter Supreme</p><p>⚔ Combat Lv 62 · Zone 14: Moonsteel Basin</p><p>● Players online: 145</p></div>
        <div id="utility-block"><button>☆</button><button>✉</button><button>+</button><button>1</button><button>⚙</button></div>
        <div id="status-grid"><div>💰 515,686</div><div>🧪 XP +36/task · 22h 53m left</div><div>⚔ ATK 292 · DEF 252 · HP 477</div><div>⚔ No ATK potion active</div><div>🛡 No DEF potion active</div><div>⚡ BritishDemon boosted (1/12) · 9h 15m left</div></div>
      </header>
      <nav><button>Game</button><button>Market</button><button>Leaderboards</button>
           <button>Village</button></nav>
      <div id="announcement">You will auto-attack Ancient Treant when it respawns.</div>
      <div id="zone-bar-panel">
        <div id="zone-bar-text">
          <p id="zone-label">🧭 Zone 19: Eternium Verge<button id="zone-whos-here">who's here?</button></p>
          <p>Next zone target: ATK 287 / DEF 291 (or Lv 77 in any skill)</p>
        </div>
        <div id="zone-bar-actions">
          <button id="zone-zones">🌐 Zones</button>
          <button id="zone-prev">Previous Zone</button>
          <button id="zone-next">Next Zone</button>
        </div>
      </div>
      <section id="current-action-panel">
        <header id="current-action-header"><h2>Current Action</h2><div><button id="cancel-current" aria-label="Cancel current action">×</button><span>3s</span></div></header>
        <div><span>⚒</span><strong>Prospect Moonsteel Ore</strong></div>
        <div id="current-action-progress" aria-valuenow="48" aria-valuemax="100"><div style="width:48%"></div></div>
        <p>6457 crafts left before the next queued action (~10h 45m)</p>
        <div id="current-action-queue"><span>Queued</span><div>1. Mine Moonsteel</div><button aria-label="Remove queued action">×</button></div>
      </section>
      <section id="action-log-panel">
        <header id="action-log-header"><h2>Action Log</h2><button id="action-log-view-all">View All</button><span>832,170 XP/hr</span></header>
        <div id="action-log-feed">
          <article><div><span>System</span><time>12:33:37</time></div><p>Prospect Moonsteel Ore completed 1 time. Salvage Material x28.</p><p>XP jewelcrafting+1387</p></article>
          <article><div><span>System</span><time>12:33:25</time></div><p>Prospect Moonsteel Ore completed 1 time. Salvage Material x28.</p><p>XP jewelcrafting+1387</p></article>
        </div>
      </section>
      <section id="world-chat-panel">
        <header id="world-chat-header"><div><h2>World Chat</h2><p>Showing the latest 100 messages.</p></div><div><button aria-label="Favourite chat">☆</button><button aria-label="Global chat">◎</button><button aria-label="Chat settings">⚙</button></div></header>
        <div id="world-chat-feed">
          <article><div><strong>📣 IdleWorlds</strong><time>12:16:44</time></div><p>Kno000 was trying to upgrade their Regal Silk Boots+1, but they failed.</p></article>
          <article><div><strong>📣 IdleWorlds</strong><time>12:16:55</time></div><p>Kno000 successfully upgraded Regal Silk Boots+1 to Regal Silk Boots+2!</p></article>
        </div>
        <form id="world-chat-composer"><input id="world-chat-input" placeholder="Message world chat..."><button id="world-chat-send" type="button">Send</button></form>
      </section>
      <section id="current-action-no-queue">
        <header><h2>Current Action</h2><button aria-label="Cancel current action">×</button></header>
        <div><strong>Fight Ancient Treant</strong></div>
        <div id="current-action-no-queue-progress" aria-valuenow="12" aria-valuemax="100"><div style="width:12%"></div></div>
        <p>No action is queued.</p>
      </section>
      <section id="action-log-single">
        <header><h2>Action Log</h2><button>View All</button></header>
        <div id="action-log-single-feed"><article><div><span>System</span><time>12:34:01</time></div><p>One new action completed.</p></article></div>
      </section>
      <section id="action-log-empty">
        <header><h2>Action Log</h2><button>View All</button></header>
        <div id="action-log-empty-feed"></div>
      </section>
      <section id="world-chat-single-tool">
        <header id="world-chat-single-tool-header"><div><h2>World Chat</h2><p>Showing the latest 100 messages.</p></div><button aria-label="Chat settings">⚙</button></header>
        <div id="world-chat-single-feed"><article><div><strong>📣 IdleWorlds</strong><time>12:20:01</time></div><p>A single recent message.</p></article></div>
        <form><input placeholder="Message world chat..."><button type="button">Send</button></form>
      </section>
      <section id="world-chat-split-header">
        <div id="world-chat-split-title"><h2>World Chat</h2><p>Showing the latest 100 messages.</p></div>
        <div id="world-chat-split-tools"><button aria-label="Favourite chat">☆</button><button aria-label="Chat settings">⚙</button></div>
        <div><article><div><strong>📣 IdleWorlds</strong><time>12:21:01</time></div><p>Split header message.</p></article></div>
        <form><input placeholder="Message world chat..."><button type="button">Send</button></form>
      </section>
      <h2>Inventory</h2>
      <section aria-label="Inventory" id="inventory-section" style="background-color:#0f172a">
        <!-- The tool row, verbatim from claude/probe-inventory-toolrow.js: only
             TWO of the three controls are direct flex children (Filter is
             wrapped in its dropdown anchor), and the row ends with a BARE <svg>
             ornament that is not a control at all. -->
        <div class="flex items-center gap-2" id="tool-row">
          <div class="relative"><button aria-label="Filter inventory" title="Filter inventory"><svg id="ic-filter"></svg></button></div>
          <button aria-label="Search inventory" title="Search inventory"><svg id="ic-search"></svg></button>
          <button aria-label="Equipment Window" title="Equipment Window"><svg id="ic-equip"></svg></button>
          <svg class="lucide lucide-package h-4 w-4 text-ember" id="pkg-ornament"></svg>
        </div>
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
      <div class="compact-panel" id="mine-live-panel">
        <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
          <div><p>⛏️ Mine</p><p>LV 2</p></div>
          <div><div><div><p>⛏️ Mine Copper Ore</p><button id="mining-xp-absolute">Lv 2 • 10/96 XP</button></div></div><p>8 XP</p><p id="mining-material">🪨 Copper Ore 2/4</p><div role="progressbar" aria-valuenow="10" aria-valuemax="100"><div style="width:69.8192%"></div></div><p>Needs level 1</p></div>
          <button id="skill-action" style="width:77px;color:rgb(1, 2, 3)">Mine</button>
        </div>
      </div>
      <div class="compact-panel" id="jewel-panel">
        <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
          <div><p>💎 Jewel</p><p>LV 69+4</p></div>
          <div><p>💎 Craft Moonstone Ring</p><div id="jewel-xp-shell" style="background:#334155;border:2px solid #64748b;padding:8px"><button>Lv 69+4 - 0.4% • 66,873,914 to go</button></div><span>💎 Moonstone 1/1 • 💎 Sapphire 0/1 • 💎 Topaz 0/1</span><span>Requires Jewelcrafting Lv 53</span><span style="display:none">Base reward: +929 jewelcrafting XP/task</span><span>Base reward: +1253 jewelcrafting XP/task</span><span>Missing materials — will queue (gather first)</span></div>
          <div><div><button>‹</button><button>›</button></div><button id="jewel-action">Craft</button></div>
        </div>
      </div>
      <div class="compact-panel" id="spell-panel">
        <div><p>✨ Spellcraft</p><p>LV 57</p></div>
        <div><p>✨ Craft Eternium Weapon Enchant - Attack</p><button>Lv 57 - 94.6% • 334,517 to go</button><p>Eternium Mana 0/200 • Eternal Orchid 0/200</p><p>Requires Spellcraft Lv 73</p><p>Base reward: +3370 spellcrafting XP/task</p></div>
        <div><div><button>‹</button><button>›</button></div><button id="spell-action">Craft</button></div>
      </div>
      <div class="compact-panel" id="tailor-panel">
        <div><span>🧵</span><span>Tailor</span><span>LV 26</span></div>
        <div><span>🧵 Upgrade Moonsilk Silkbind Thread</span><button>Lv 26 - 21.0% • 13,450 to go</button><span>🔷 Moonsilk Silkbind Thread 0/3 • 🔴 Moonsteel Upgrade Orb 0/1</span><span>Requires Tailoring Lv 53 and Gathering Lv 49</span><span style="display:none">Base reward: +1008 tailoring XP/task</span><span>Base reward: +5638 tailoring XP/task</span></div>
        <div><div><button>‹</button><button>›</button></div><button id="tailor-action">Upgrade</button></div>
      </div>
      <div class="compact-panel" id="wood-panel">
        <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
          <div><p>🪓 Wood</p><p>LV 35</p></div>
          <div><p>🪓 Chop Runic Oak</p><button>Lv 35 - 0.5% • 84,604 to go</button><p>35 XP</p><div role="progressbar"><div style="width:0.5%"></div></div><p>Needs level 29</p></div>
          <button id="wood-action">Chop</button>
        </div>
      </div>
      <div class="compact-panel" id="build-panel">
        <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
          <div><p>🏗️ Build</p><p>LV 29</p></div>
          <div><p>🏗️ Craft Runite Building Parts</p><button>Lv 29 - 52.0% • 13,741 to go</button><p>📦 Runic Oak 473/16 • 🪨 Runite Ore 19318/8</p><div role="progressbar"><div style="width:52%"></div></div><p>Needs Construction Lv 29 + Woodcutting Lv 25</p><p>Base reward: +461 construction XP/task</p></div>
          <div><div><button>‹</button><button>›</button></div><button id="build-action">Craft Parts</button></div>
        </div>
      </div>
      <div class="compact-panel" id="locked-panel">
        <div><span>🔒</span><span>Coming</span><span>Soon</span><p>LV —</p></div>
        <div><p>Upcoming <span>Skill</span></p><p>Unlock in a future update</p></div>
        <div role="progressbar"><div style="width:0%"></div></div>
        <button id="locked-action" disabled aria-label="Locked">🔒</button>
      </div>
      <div class="quest-description"><p>Bring the smith an Iron Sword to continue.</p></div>
      <div class="panel p-3.5"><div class="mb-2 flex items-center justify-between"><h2>Quests</h2></div>
        <div class="space-y-2">
          <div class="compact-panel p-2.5" id="quest-bounty">
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-semibold text-white">Night Claw Bounty</p>
                  <p class="text-[11px] leading-4 text-white/60">Bring back 100 Night Claws from Moonsteel Basin.</p>
                  <p class="mt-1 text-[11px] text-white/45">\u{1F4A0} Night Claw 22/100</p>
                  <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +3,225g • +1350 combat XP</p>
                </div>
                <div class="flex shrink-0 flex-col gap-2" style="min-width:0px">
                  <button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white" disabled>Turn In</button>
                </div>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 22%"></div></div>
              <div class="text-[11px] text-white/45">22% complete</div>
            </div>
          </div>
          <div class="compact-panel p-2.5" id="quest-work-order">
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Tailoring Work Order</p>
                  <p class="text-xs font-semibold text-white">Craft and turn in 1 Moonsilk Boots.</p>
                  <p class="mt-1 text-[11px] text-white/45">\u{1F9F5} Moonsilk Boots 0/1</p>
                  <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +3,870g • +3240 tailoring XP</p>
                </div>
                <div class="flex shrink-0 flex-col gap-2" style="min-width:0px">
                  <button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white">Turn In</button>
                  <button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white">Skip (8)</button>
                </div>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 0%"></div></div>
              <div class="text-[11px] text-white/45">0% complete</div>
            </div>
          </div>
        </div>
      </div>
      <div class="panel p-3.5" id="world-boss-panel"><div class="mb-2 flex items-center justify-between"><h2>World Bosses</h2><span>Shared world events</span></div>
        <div class="space-y-2">
          <div class="compact-panel p-2.5" id="boss-treant">
            <div><p>🌍 Ancient Treant</p><p>Solo</p><p>Buff on kill: +4 XP/task for 1h</p><p>World boss participation</p><p>Respawns 8m left</p></div>
            <button id="boss-treant-join">⏳ Prejoined</button>
          </div>
          <div class="compact-panel p-2.5" id="boss-behemoth">
            <div><p>🌍 Abyssal Behemoth</p><p>Raid</p><p>Buff on kill: +8 XP/task for 2h</p><p>World boss participation</p><p>Respawns 1h 26m left</p></div>
            <button>⏳ Prejoined</button>
          </div>
        </div>
        <h3>Zone Control</h3>
        <div class="compact-panel p-2.5" id="zone-control-card">
          <div><p>🔴 Red Team controls Zone 8</p><p>Protected for 3h 44m</p><p>Last battle participants</p></div>
        </div>
      </div>
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
    work_order_turn_in_gold: 720, work_order_turn_in_note: 'smithing work order turn-in value (1x weapon, +50% profession bonus)',
    effects_raw: 'ATK +18 \u0007 DEF +7, Requires Combat Lv 3, XP +4/task, +8% 2x gather chance',
    acquisition_type: 'ZoneDrop', drop_rate: '1/20000', drop_boosted_by: 'Item Find %',
  }, {
    item_id: 'wool_boots_plus_4', name: 'Wool Boots+4', wiki_slug: 'wool_boots_plus_4', tier: 1,
    category: 'Equipment', subcategory: 'Boots', def: 2, sockets: 2,
    effects_raw: 'DEF +2, +3% 2x gather chance, 2 Sockets',
    acquisition_type: 'Upgrade', acquisition_summary: 'Apply an Upgrade Orb to Wool Boots+3',
  }, {
    item_id: 'merchant_coffer', name: "Merchant's Coffer", wiki_slug: 'merchant_coffer', tier: 21,
    category: 'Container', subcategory: 'Coffer', effects_raw: '', base_value: 0,
    acquisition_type: 'Unknown',
    acquisition_summary: 'Ultra-rare zone drop: Fighting the Emberclad Juggernaut (Zone 21) - 1 in 240,000 per win',
  }, {
    item_id: 'night_claw', name: 'Night Claw', wiki_slug: 'night_claw', tier: 5,
    category: 'Material', subcategory: 'Monster drop', effects_raw: '',
    acquisition_type: 'ZoneDrop', source_zone: '14', drop_rate: '1/12',
  }, {
    item_id: 'moonsilk_boots', name: 'Moonsilk Boots', wiki_slug: 'moonsilk_boots', tier: 12,
    category: 'Equipment', subcategory: 'Boots', def: 40, effects_raw: 'DEF +40',
    acquisition_type: 'Crafted', craft_skill: 'tailoring', craft_level: 53,
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
check('all six runtime stylesheets mounted',
  window.document.querySelectorAll('style[data-iw-style]').length === 6,
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

// The tool row: three controls, one ornament. The game marks the ornament as
// not-a-control (bare <svg>, no role/label/title, cursor auto) and the skin
// must preserve that distinction rather than framing it into a fourth button.
const toolButtons = [...window.document.querySelectorAll('#tool-row button')];
const ornament = window.document.getElementById('pkg-ornament');
check('all three tool controls classified as icon',
  toolButtons.length === 3 && toolButtons.every(b => b.getAttribute('data-iw-inventory-control') === 'icon'),
  toolButtons.map(b => b.getAttribute('data-iw-inventory-control')).join(','));
check('bare package svg classified as ornament, not a control',
  ornament.getAttribute('data-iw-inventory-control') === 'glyph',
  ornament.getAttribute('data-iw-inventory-control') || 'unclassified');
check('ornament is NOT framed as an icon control',
  ornament.getAttribute('data-iw-inventory-control') !== 'icon');
check('ornament tagging did not reach svgs inside the controls',
  toolButtons.every(b => ![...b.querySelectorAll('svg')]
    .some(g => g.hasAttribute('data-iw-inventory-control'))));
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
check('live Mine alias gets mining three-zone layout',
  panel.classList.contains('fs-skill--mining') && panel.dataset.iwSkillLayout === 'three-zone', panel.className);
check('live Mine wrapper is retained as the layout shell without ingredient pollution',
  !!panel.querySelector('[data-iw-skill-layout-shell="1"]') && !panel.querySelector('[data-iw-skill-layout-shell="1"]')?.dataset.iwIngr);
check('absolute XP display is recognised as a readout',
  window.document.getElementById('mining-xp-absolute')?.dataset.iwReadout === '1');
check('material fraction is neutralised without matching XP fractions',
  window.document.getElementById('mining-material')?.dataset.iwIngr === '1');
// The mirror BAR must carry the native precision so it cannot drift from the
// game's own rail; only the human-readable label beside it is rounded.
check('approved layout adds a left-column progress mirror at native precision',
  panel.querySelector('.fs-skill-identity-progress-fill')?.style.width === '69.8192%',
  panel.querySelector('.fs-skill-identity-progress-fill')?.style.width || 'missing');
check('identity completion label is rounded for reading, not printed raw',
  panel.querySelector('.fs-skill-identity-percent')?.textContent === '69.8%',
  panel.querySelector('.fs-skill-identity-percent')?.textContent || 'missing');
check('approved layout adds a Base: plaque from the live XP datum',
  panel.querySelector('.fs-skill-base-exp')?.textContent === 'Base: 8');
check('approved layout stores emoji-free visible title and identity text',
  panel.querySelector('[data-iw-skill-role="identity"]')?.dataset.iwCleanText === 'Mine' &&
  panel.querySelector('[data-iw-skill-role="action-title"]')?.dataset.iwCleanText === 'Mine Copper Ore');
check('skill renderer actively overrides native inline width while enabled', skillAction.style.width === '155px', skillAction.style.cssText);
check('background painter actively overrides native navy while enabled',
  inventorySection.style.getPropertyValue('background-color') !== 'rgb(15, 23, 42)',
  inventorySection.style.cssText);
check('main nav classified', !!window.document.querySelector('[data-iw-ui="main-nav"]'));
// The rail is matched tab-by-tab against a fixed label set, so ONE tab that
// fails to match keeps its vanilla surfacing inside a rail the skin has
// reframed -- which reads as "the rim skips that one button". Two ways in: a
// decorated label (the leading/trailing glyph trap), and a tab that mounts
// after the first classification (the resolution cache used to stay valid
// forever once resolved, so a late tab was never picked up).
const navRail = window.document.querySelector('[data-iw-ui="main-nav"]');
check('every nav tab in the rail is classified',
  [...navRail.querySelectorAll('button')].every(b => b.dataset.iwUi === 'nav-tab'),
  [...navRail.querySelectorAll('button')].map(b => b.textContent + '=' + b.dataset.iwUi).join(' '));
const lateTab = window.document.createElement('button');
lateTab.id = 'late-nav-tab';
lateTab.textContent = '⚔️ Dungeon 🔒';
navRail.appendChild(lateTab);
await waitFor(() => lateTab.dataset.iwUi === 'nav-tab', { timeout: 6000 }).catch(() => {});
check('a decorated tab that mounts after boot is still classified',
  lateTab.dataset.iwUi === 'nav-tab' && lateTab.dataset.iwTab === 'dungeon',
  lateTab.dataset.iwUi + '/' + lateTab.dataset.iwTab);
const currentActionPanel = window.document.getElementById('current-action-panel');
const actionLogPanel = window.document.getElementById('action-log-panel');
const worldChatPanel = window.document.getElementById('world-chat-panel');
check('current action receives semantic frame and compact subregions',
  currentActionPanel?.dataset.iwPanel === 'current-action' &&
  window.document.getElementById('current-action-header')?.dataset.iwPanelPart === 'header' &&
  window.document.getElementById('current-action-progress')?.dataset.iwPanelPart === 'progress' &&
  window.document.getElementById('current-action-queue')?.dataset.iwPanelPart === 'queue');
check('action log receives semantic feed and control roles',
  actionLogPanel?.dataset.iwPanel === 'action-log' &&
  window.document.getElementById('action-log-header')?.dataset.iwPanelPart === 'header' &&
  window.document.getElementById('action-log-feed')?.dataset.iwPanelPart === 'feed' &&
  window.document.getElementById('action-log-view-all')?.dataset.iwPanelPart === 'panel-control');
check('world chat receives semantic feed and composer roles',
  worldChatPanel?.dataset.iwPanel === 'world-chat' &&
  window.document.getElementById('world-chat-header')?.dataset.iwPanelPart === 'header' &&
  window.document.getElementById('world-chat-feed')?.dataset.iwPanelPart === 'feed' &&
  window.document.getElementById('world-chat-composer')?.dataset.iwPanelPart === 'composer' &&
  window.document.getElementById('world-chat-send')?.dataset.iwPanelPart === 'send');
check('activity panel classification preserves native controls',
  window.document.getElementById('cancel-current')?.isConnected === true &&
  window.document.getElementById('world-chat-input')?.isConnected === true &&
  window.document.getElementById('world-chat-send')?.isConnected === true);
check('activity panels classify ordinary empty and single-entry states',
  window.document.getElementById('current-action-no-queue')?.dataset.iwPanel === 'current-action' &&
  window.document.getElementById('current-action-no-queue-progress')?.dataset.iwPanelPart === 'progress' &&
  window.document.getElementById('action-log-single')?.dataset.iwPanel === 'action-log' &&
  window.document.getElementById('action-log-single-feed')?.dataset.iwPanelPart === 'feed' &&
  window.document.getElementById('action-log-empty')?.dataset.iwPanel === 'action-log' &&
  window.document.getElementById('action-log-empty-feed')?.dataset.iwPanelPart === 'feed' &&
  window.document.getElementById('world-chat-single-feed')?.dataset.iwPanelPart === 'feed');
check('activity headers include metadata and even a single toolbar control',
  window.document.getElementById('world-chat-single-tool-header')?.dataset.iwPanelPart === 'header');
check('split activity headers classify title and sibling toolbar without moving native nodes',
  window.document.getElementById('world-chat-split-header')?.dataset.iwPanelHeader === 'split' &&
  window.document.getElementById('world-chat-split-title')?.dataset.iwPanelPart === 'header-title' &&
  window.document.getElementById('world-chat-split-tools')?.dataset.iwPanelPart === 'header-tools');
check('top header receives the Option 1 semantic layout',
  window.document.getElementById('top-header')?.getAttribute('data-iw-header') === 'root' &&
  window.document.getElementById('profile-block')?.getAttribute('data-iw-header') === 'profile' &&
  window.document.getElementById('status-grid')?.getAttribute('data-iw-header') === 'status-grid');
check('top header adds one skin-owned crest without replacing native profile text',
  window.document.querySelectorAll('#profile-block > .fs-header-crest').length === 1 &&
  window.document.getElementById('profile-block')?.textContent.includes('BustedCypher'));
check('header utility buttons are classified without replacing native controls',
  window.document.querySelectorAll('[data-iw-header="utility-button"]').length === 5);
// The vitals/timers layout places cards by KIND, derived from their text. It
// must not key off DOM position: the game drops buff tiles as they expire,
// which reshuffles every index behind them and would silently move the wrong
// card into the vitals column.
{
  const cards = [...window.document.getElementById('status-grid').children];
  const kinds = cards.map(el => el.dataset.iwHeaderStat);
  check('status tiles are classified by content, not position',
    kinds[0] === 'gold' && kinds[2] === 'combat' &&
    cards.filter(el => el.dataset.iwHeaderStat === 'timer').length >= 1,
    kinds.join(','));
}
check('announcement strip is classified for layered header treatment',
  window.document.getElementById('announcement')?.getAttribute('data-iw-header') === 'announcement');
// The live zone label reads "🧭 Zone 19: …" and the live button reads
// "🌐 Zones". Both were matched with anchored regexes that the leading icon
// defeated, so the ENTIRE zone bar went unclassified and rendered vanilla —
// and nothing here exercised it. These pin the icon-tolerant matching.
// UIFoundation tags zone-bar and HeaderRenderer then binds zone-shell to it on
// a later flush, so this pairing settles across frames rather than in one.
await waitFor(() => window.document.getElementById('zone-bar-panel')?.getAttribute('data-iw-header') === 'zone-shell');
check('zone bar resolves despite the leading icon on its label',
  window.document.getElementById('zone-bar-panel')?.dataset.iwUi === 'zone-bar' &&
  window.document.getElementById('zone-bar-panel')?.getAttribute('data-iw-header') === 'zone-shell',
  `ui=${window.document.getElementById('zone-bar-panel')?.dataset.iwUi} header=${window.document.getElementById('zone-bar-panel')?.getAttribute('data-iw-header')}`);
check('every zone action is classified and toned, icon prefix or not',
  window.document.getElementById('zone-zones')?.dataset.iwUi === 'zone-action' &&
  window.document.getElementById('zone-zones')?.dataset.iwZoneAction === 'zones' &&
  window.document.getElementById('zone-prev')?.dataset.iwZoneAction === 'prev' &&
  window.document.getElementById('zone-next')?.dataset.iwZoneAction === 'next',
  ['zone-zones', 'zone-prev', 'zone-next']
    .map(id => `${id}=${window.document.getElementById(id)?.dataset.iwZoneAction}`).join(' '));
check('a non-navigation control in the zone bar is left alone',
  !window.document.getElementById('zone-whos-here')?.dataset.iwUi &&
  !window.document.getElementById('zone-whos-here')?.dataset.iwZoneAction);
// The bar's own container text also begins "Zone 19: …", so treating it as a
// label made the walk start at its PARENT and brand the page wrapper as the
// zone bar — which then collected the header's artwork. Exactly one element
// may carry the role, and it must be the bar itself.
check('zone bar role is not smeared onto a page wrapper',
  window.document.querySelectorAll('[data-iw-ui="zone-bar"]').length === 1 &&
  window.document.querySelectorAll('[data-iw-header="zone-shell"]').length === 1 &&
  !window.document.querySelector('.app')?.dataset.iwUi,
  [...window.document.querySelectorAll('[data-iw-ui="zone-bar"]')]
    .map(el => el.id || el.className || el.tagName).join(', '));

const jewelPanel = window.document.getElementById('jewel-panel');
const spellPanel = window.document.getElementById('spell-panel');
const tailorPanel = window.document.getElementById('tailor-panel');
const lockedPanel = window.document.getElementById('locked-panel');
check('live Jewel label gets jewelcrafting three-zone layout',
  jewelPanel.classList.contains('fs-skill--jewelcrafting') && jewelPanel.dataset.iwSkillLayout === 'three-zone');
check('live Jewel Craft identity exposes label, level and layout-shell roles',
  jewelPanel.querySelector('[data-iw-skill-role="identity"]')?.textContent.trim().includes('Jewel') === true &&
  jewelPanel.querySelector('[data-iw-skill-role="identity-level"]')?.textContent.trim() === 'LV 69+4' &&
  jewelPanel.querySelector('[data-iw-skill-role="action-button"]')?.textContent.trim() === 'Craft' &&
  jewelPanel.querySelector('[data-iw-skill-layout-shell="1"]') !== null);
check('skill identity receives a skin-owned medallion host without replacing native identity text',
  jewelPanel.querySelector('.fs-skill-medallion-art')?.dataset.iwSkillArt === 'jewelcrafting' &&
  jewelPanel.querySelector('[data-iw-skill-role="identity"]')?.textContent.trim().includes('💎') === true);
const jewelXpShell = window.document.getElementById('jewel-xp-shell');
check('live XP wrapper is neutralised with the readout branch',
  jewelXpShell?.dataset.iwReadout === '1' &&
  jewelXpShell.style.getPropertyValue('background') === 'none' &&
  !/2px\s+solid/i.test(jewelXpShell.style.cssText),
  jewelXpShell?.getAttribute('style') || 'missing');
const woodPanel = window.document.getElementById('wood-panel');
const buildPanel = window.document.getElementById('build-panel');
// Woodcutting and Construction shipped after the skin's skill table was
// written, so both arrived unskinned: CHOP was an unknown verb and "Craft
// Parts" is not the bare CRAFT the crafting branch matches.
check('live Wood/Chop panel is identified as woodcutting and framed',
  woodPanel.classList.contains('fs-skill--woodcutting') &&
  woodPanel.dataset.iwSkillLayout === 'three-zone' &&
  woodPanel.querySelector('[data-iw-skill-role="action-button"]')?.textContent.trim() === 'Chop' &&
  woodPanel.querySelector('[data-iw-skill-role="action-title"]')?.dataset.iwCleanText === 'Chop Runic Oak');
check('live Build/Craft Parts panel is construction, not crafting',
  buildPanel.classList.contains('fs-skill--construction') &&
  !buildPanel.classList.contains('fs-skill--crafting') &&
  buildPanel.dataset.iwSkillLayout === 'three-zone' &&
  buildPanel.querySelector('[data-iw-skill-role="action-button"]')?.textContent.trim() === 'Craft Parts' &&
  buildPanel.querySelector('[data-iw-skill-role="action-title"]')?.dataset.iwCleanText === 'Craft Runite Building Parts');
// The icon atlas has no free cell, so these two borrow an existing sprite
// rather than falling through to the featureless `generic` slot.
check('new skills still receive a medallion art host',
  woodPanel.querySelector('.fs-skill-medallion-art')?.dataset.iwSkillArt === 'woodcutting' &&
  buildPanel.querySelector('.fs-skill-medallion-art')?.dataset.iwSkillArt === 'construction');
check('Spellcraft identity wins over ambiguous Craft action',
  spellPanel.classList.contains('fs-skill--spellcrafting') && !spellPanel.classList.contains('fs-skill--crafting') && spellPanel.dataset.iwSkillLayout === 'three-zone' &&
  spellPanel.querySelector('[data-iw-skill-role="action-button"]')?.textContent.trim() === 'Craft');
check('Spellcraft Craft title is normalised',
  spellPanel.querySelector('[data-iw-skill-role="action-title"]')?.dataset.iwCleanText === 'Craft Eternium Weapon Enchant - Attack');
check('Jewel Craft title is derived from its native action control',
  jewelPanel.querySelector('[data-iw-skill-role="action-title"]')?.dataset.iwCleanText === 'Craft Moonstone Ring');
check('Tailor Upgrade title is derived from its native action control',
  tailorPanel.querySelector('[data-iw-skill-role="action-title"]')?.dataset.iwCleanText === 'Upgrade Moonsilk Silkbind Thread');
check('Jewelcrafting plaque uses the visible current reward instead of a hidden stale action',
  jewelPanel.querySelector('.fs-skill-base-exp')?.textContent === 'Base: 1253');
check('Tailoring plaque uses the visible current reward instead of a hidden stale action',
  tailorPanel.querySelector('.fs-skill-base-exp')?.textContent === 'Base: 5638');
check('live Tailor Upgrade gets tailoring three-zone layout',
  tailorPanel.classList.contains('fs-skill--tailoring') && !tailorPanel.classList.contains('fs-skill--crafting') && tailorPanel.dataset.iwSkillLayout === 'three-zone',
  tailorPanel.className + ' layout=' + (tailorPanel.dataset.iwSkillLayout || 'none') + ' roles=' +
    [...tailorPanel.querySelectorAll('[data-iw-skill-role]')].map(el => el.getAttribute('data-iw-skill-role') + ':' + el.textContent.trim()).join(' | '));
check('coming-soon skill gets locked three-zone artwork',
  lockedPanel.classList.contains('fs-skill--locked') && lockedPanel.dataset.iwSkillLayout === 'three-zone' &&
  lockedPanel.querySelector('.fs-skill-medallion-art')?.dataset.iwSkillArt === 'locked');
check('coming-soon skill keeps dash level and lock control',
  lockedPanel.querySelector('[data-iw-skill-role="identity-level"]')?.textContent.trim() === 'LV —' &&
  window.document.getElementById('locked-action')?.getAttribute('data-iw-skill-role') === 'action-button');
check('coming-soon copy is normalised without inventing EXP',
  lockedPanel.querySelector('[data-iw-skill-role="identity"]')?.dataset.iwCleanText === 'Coming Soon' &&
  lockedPanel.querySelector('[data-iw-skill-role="action-title"]')?.dataset.iwCleanText === 'Upcoming Skill' &&
  !lockedPanel.querySelector('.fs-skill-base-exp'));
check('live skill action buttons use deterministic width',
  ['jewel-action', 'spell-action', 'tailor-action'].every(id => window.document.getElementById(id).style.width === '155px'));
// The pager IS the framed skills_nav_*.svg artwork. styleButton() writes these
// inline with `!important`, which outranks every stylesheet rule — so the
// artwork, the absence of a competing button outline, and the hidden native
// glyph all have to be asserted on the inline copy. Two regressions this
// guards: a second squarer outline drawn around the art's own frame, and a
// vector arrow rendered on top of the drawn one.
{
  const navBtns = [...jewelPanel.querySelectorAll('[data-iw-skill-role="nav-button"]')];
  const inlineOf = btn => btn.getAttribute('style') || '';
  const dirOf = btn => btn.dataset.iwNavDirection;
  check('recipe pager paints the framed arrow artwork inline, per direction',
    navBtns.length === 2 &&
    navBtns.every(btn => btn.style.getPropertyValue('background-image') === `var(--fs-skills-nav-${dirOf(btn)})`),
    navBtns.map(btn => `${dirOf(btn)}=${btn.style.getPropertyValue('background-image')}`).join(' || ') || 'no nav buttons');
  check('recipe pager artwork is inset inside its 44px touch target',
    navBtns.every(btn => btn.style.getPropertyValue('background-size') === '68% 68%') &&
    navBtns.every(btn => btn.style.getPropertyValue('width') === '44px' && btn.style.getPropertyValue('height') === '44px'),
    navBtns.map(btn => btn.style.getPropertyValue('background-size')).join(' || '));
  check('recipe pager carries no competing outline and no overlaid glyph',
    navBtns.every(btn => /^0(px)?$/.test(btn.style.getPropertyValue('border').trim())) &&
    navBtns.every(btn => btn.style.getPropertyValue('box-shadow') === 'none') &&
    navBtns.every(btn => btn.style.getPropertyValue('color') === 'transparent') &&
    navBtns.every(btn => /^0(px)?$/.test(btn.style.getPropertyValue('font-size').trim())),
    navBtns.map(inlineOf).join(' || '));
}

/* ── Quest cards ─────────────────────────────────────────────────────── */

console.log('\nsmoke: quest cards');
const questBounty = window.document.getElementById('quest-bounty');
const questWorkOrder = window.document.getElementById('quest-work-order');
const bountyTurnIn = questBounty.querySelector('button');
check('in-progress bounty gets the forged quest frame',
  questBounty.classList.contains('fs-quest-panel') && questBounty.getAttribute('data-fs-quest') === '1' &&
  questBounty.getAttribute('data-iw-quest-state') === 'active',
  questBounty.className + ' state=' + questBounty.getAttribute('data-iw-quest-state'));
check('bounty combat reward drives the combat accent',
  questBounty.style.getPropertyValue('--fs-quest-accent').trim() === '#B84A20',
  questBounty.style.getPropertyValue('--fs-quest-accent'));
check('bounty native title / objective / reward / progress get semantic roles',
  questBounty.querySelector('[data-iw-quest-role="title"]')?.textContent === 'Night Claw Bounty' &&
  questBounty.querySelector('[data-iw-quest-role="objective"]')?.textContent.includes('22/100') &&
  questBounty.querySelector('[data-iw-quest-role="reward"]')?.dataset.iwQuestReward === '+3,225g • +1350 combat XP' &&
  questBounty.querySelector('[data-iw-quest-role="progress-fill"]')?.style.width === '22%' &&
  questBounty.querySelector('[data-iw-quest-role="progress-label"]')?.dataset.iwQuestPercent === '22',
  'title=' + JSON.stringify(questBounty.querySelector('[data-iw-quest-role="title"]')?.textContent));
check('bounty gains a skin-owned sigil with the completion readout',
  questBounty.querySelectorAll('.fs-quest-sigil').length === 1 &&
  questBounty.querySelector('.fs-quest-sigil')?.dataset.iwQuestGlyph === '⚔' &&
  questBounty.querySelector('.fs-quest-sigil-pct')?.textContent === '22%');
check('bounty Turn In stays the native disabled control and opts out of the generic button skin',
  bountyTurnIn.getAttribute('data-iw-quest-role') === 'turn-in' && bountyTurnIn.disabled === true &&
  bountyTurnIn.isConnected === true);
check('work order with an enabled Turn In is marked ready',
  questWorkOrder.getAttribute('data-iw-quest-state') === 'ready' &&
  questWorkOrder.style.getPropertyValue('--fs-quest-accent').trim() === '#A56E86');
check('work order keeps the discipline kicker above the instruction title',
  questWorkOrder.querySelector('[data-iw-quest-role="kicker"]')?.textContent === 'Tailoring Work Order' &&
  questWorkOrder.querySelector('[data-iw-quest-role="title"]')?.textContent === 'Craft and turn in 1 Moonsilk Boots.');
check('work order Skip control is classified and left native',
  [...questWorkOrder.querySelectorAll('button')].find(b => /skip/i.test(b.textContent))?.getAttribute('data-iw-quest-role') === 'skip');
check('quest cards are not mistaken for skill panels',
  !questBounty.classList.contains('fs-skill-panel') && !questWorkOrder.classList.contains('fs-skill-panel'));

/* ── World Boss cards ────────────────────────────────────────────────── */

console.log('\nsmoke: world boss cards');
const bossTreant = window.document.getElementById('boss-treant');
const zoneControlCard = window.document.getElementById('zone-control-card');
check('boss cards in the World Bosses panel are tagged for the card material',
  bossTreant?.dataset.iwBoss === 'card' &&
  window.document.getElementById('boss-behemoth')?.dataset.iwBoss === 'card');
check('the Zone Control card in the same panel is tagged too',
  zoneControlCard?.dataset.iwBoss === 'card');
check('a compact-panel outside the boss panel is never tagged',
  !questBounty.dataset.iwBoss && !window.document.getElementById('jewel-panel').dataset.iwBoss);
check('boss cards are not mistaken for skill or quest panels',
  !bossTreant.classList.contains('fs-skill-panel') && !bossTreant.classList.contains('fs-quest-panel') &&
  bossTreant.getAttribute('data-fs-quest') === null);

const bountyObjective = questBounty.querySelector('[data-iw-quest-role="objective"]');
const workOrderObjective = questWorkOrder.querySelector('[data-iw-quest-role="objective"]');
check('known objective item turns the objective line into a tooltip trigger (attributes only)',
  bountyObjective?.getAttribute('data-iw-tooltip-trigger') === '1' &&
  bountyObjective?.getAttribute('data-iw-item') === 'night_claw' &&
  bountyObjective?.getAttribute('tabindex') === '0' &&
  bountyObjective?.childElementCount === 0 &&
  bountyObjective?.textContent === '💠 Night Claw 22/100' &&
  workOrderObjective?.getAttribute('data-iw-item') === 'moonsilk_boots',
  `bounty=[${bountyObjective?.getAttribute('data-iw-item')}] wo=[${workOrderObjective?.getAttribute('data-iw-item')}]`);
{
  const tip = window.document.querySelector('.iw-tip');
  await settle(150); // let the quest-render mutation burst drain before hovering
  const nativeMatches = bountyObjective.matches.bind(bountyObjective);
  bountyObjective.matches = sel => sel === ':hover' ? true : nativeMatches(sel);
  pointerTarget = bountyObjective;
  // A mousemove first so TooltipEngine's pointer invariant sees the cursor on
  // the anchor (its dom-flush orphan check closes cards with no known pointer).
  bountyObjective.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 20 }));
  bountyObjective.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true, clientX: 40, clientY: 20 }));
  await waitFor(() => tip.classList.contains('is-open') && tip.querySelector('.iw-tip-name')?.textContent === 'Night Claw', { timeout: 6000 });
  check('hovering the quest objective opens the item tooltip',
    tip.classList.contains('is-open') && tip.querySelector('.iw-tip-name')?.textContent === 'Night Claw',
    `open=${tip.classList.contains('is-open')} name=${JSON.stringify(tip.querySelector('.iw-tip-name')?.textContent)}`);
  pointerTarget = window.document.body;
  bountyObjective.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, clientX: 400, clientY: 400, relatedTarget: window.document.body }));
  window.document.body.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 400 }));
  await waitFor(() => !tip.classList.contains('is-open'));
  bountyObjective.matches = nativeMatches;
}

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
check('rich tooltip renders base value, work-order value and trader turn-in',
  richStatText.includes('Base value125g') && richStatText.includes('Work order720g') && richStatText.includes('Turn-in1 token'), richStatText);
check('rich tooltip preserves work-order context note',
  tooltip.querySelector('.iw-tip-stat-note')?.textContent.includes('+50% profession bonus') === true);
check('rich tooltip renders drop rate and boost source',
  (() => { const text = tooltip.querySelector('.iw-tip-acq-sub')?.textContent || ''; return text.includes('Rate 1/20000') && text.includes('boosted by Item Find %'); })(), tooltip.querySelector('.iw-tip-acq-sub')?.textContent || 'missing');
check('rich tooltip renders wiki link and cache provenance',
  tooltip.querySelector('.iw-tip-link')?.getAttribute('href')?.endsWith('/wiki/items/iron_sword') === true &&
  tooltip.querySelector('.iw-tip-source')?.textContent === 'cached data');
explicitItemRef.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, clientX: 300, clientY: 300, relatedTarget: window.document.body }));
await waitFor(() => !tooltip.classList.contains('is-open'));

const sourcedUnknownRef = window.document.createElement('span');
sourcedUnknownRef.className = 'iw-item-ref';
sourcedUnknownRef.setAttribute('data-iw-item', 'merchant_coffer');
sourcedUnknownRef.textContent = "Merchant's Coffer";
window.document.body.appendChild(sourcedUnknownRef);
await settle(80); // allow the delegated item-name scan to classify this late-mounted trigger
const nativeUnknownMatches = sourcedUnknownRef.matches.bind(sourcedUnknownRef);
sourcedUnknownRef.matches = selector => selector === ':hover' ? true : nativeUnknownMatches(selector);
pointerTarget = sourcedUnknownRef;
sourcedUnknownRef.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true, clientX: 50, clientY: 20 }));
let sourcedUnknownSnapshot = null;
await waitFor(() => {
  const name = tooltip.querySelector('.iw-tip-name')?.textContent || '';
  const main = tooltip.querySelector('.iw-tip-acq-main')?.textContent || '';
  const sub = tooltip.querySelector('.iw-tip-acq-sub')?.textContent || '';
  if (!tooltip.classList.contains('is-open') || name !== "Merchant's Coffer" || main !== 'Source details' || !sub.includes('Emberclad Juggernaut')) return false;
  sourcedUnknownSnapshot = { name, main, sub, text: tooltip.textContent };
  return true;
});
check('Unknown acquisition with authoritative text preserves source details',
  sourcedUnknownSnapshot?.main === 'Source details' &&
  sourcedUnknownSnapshot?.sub.includes('Emberclad Juggernaut') &&
  !sourcedUnknownSnapshot?.text.includes('Source not documented'),
  `main=${sourcedUnknownSnapshot?.main || 'none'} sub=${sourcedUnknownSnapshot?.sub || 'none'} name=${sourcedUnknownSnapshot?.name || 'none'}`);
sourcedUnknownRef.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, clientX: 300, clientY: 300, relatedTarget: window.document.body }));
await waitFor(() => !tooltip.classList.contains('is-open'));

explicitItemRef.focus();
explicitItemRef.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await waitFor(() => tooltip.classList.contains('is-open'));
check('keyboard activation opens an interactive dialog card',
  tooltip.getAttribute('role') === 'dialog' && tooltip.getAttribute('aria-modal') === 'false' && tooltip.contains(window.document.activeElement),
  `role=${tooltip.getAttribute('role')} active=${window.document.activeElement?.className || window.document.activeElement?.tagName}`);
check('keyboard trigger exposes dialog relationship',
  explicitItemRef.getAttribute('aria-haspopup') === 'dialog' && explicitItemRef.getAttribute('aria-controls') === 'iw-tip' && explicitItemRef.getAttribute('aria-expanded') === 'true');
pointerTarget = window.document.body;
window.document.body.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 300 }));
await settle(80);
check('keyboard-owned tooltip survives unrelated pointer movement', tooltip.classList.contains('is-open'));
tooltip.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await waitFor(() => !tooltip.classList.contains('is-open'));
check('Escape closes keyboard tooltip and restores trigger focus',
  window.document.activeElement === explicitItemRef && explicitItemRef.getAttribute('aria-expanded') === 'false');

explicitItemRef.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await waitFor(() => tooltip.classList.contains('is-open'));
const closeButton = tooltip.querySelector('.iw-tip-close');
closeButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await waitFor(() => !tooltip.classList.contains('is-open'));
check('close control dismisses keyboard tooltip and restores focus',
  !!closeButton && window.document.activeElement === explicitItemRef && explicitItemRef.getAttribute('aria-expanded') === 'false',
  `open=${tooltip.classList.contains('is-open')} active=${window.document.activeElement?.className || window.document.activeElement?.tagName}`);

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

const nativeIdentityBranch = row.children[0];
check('Inventory skin owns suppressed native display while active',
  nativeIdentityBranch.style.display === 'none', nativeIdentityBranch.style.cssText);
nativeIdentityBranch.style.display = 'grid';
await settle(80);

/* ── First disable ───────────────────────────────────────────────────── */

console.log('\nsmoke: first disable');
window.chrome.storage.onChanged._emit({ 'iw-skin-enabled': { newValue: false } });
await waitFor(() => window.document.querySelectorAll('.fs-inv-row').length === 0);

check('overlays removed', window.document.querySelectorAll('.fs-inv-row').length === 0);
check('ALL runtime stylesheets removed', window.document.querySelectorAll('style[data-iw-style]').length === 0);
check('ui role attributes removed', window.document.querySelectorAll('[data-iw-ui]').length === 0);
check('zone action tone hooks removed', window.document.querySelectorAll('[data-iw-zone-action]').length === 0);
check('activity panel role attributes removed',
  window.document.querySelectorAll('[data-iw-panel], [data-iw-panel-part]').length === 0);
check('header roles and decorative crest removed',
  window.document.querySelectorAll('[data-iw-header], .fs-header-crest').length === 0);
check('skill panel classes removed', window.document.querySelectorAll('.fs-skill-panel').length === 0);
check('skill medallion artwork removed on teardown', window.document.querySelectorAll('.fs-skill-medallion-art').length === 0);
check('skill presentation artifacts removed on teardown',
  window.document.querySelectorAll('.fs-skill-identity-progress, .fs-skill-base-exp, [data-iw-clean-text]').length === 0);
check('quest chrome fully removed on teardown',
  window.document.querySelectorAll('.fs-quest-panel, .fs-quest-sigil, .fs-quest-sigil-icon, [data-iw-quest-role], [data-iw-quest-zone], [data-fs-quest]').length === 0 &&
  !questBounty.style.getPropertyValue('--fs-quest-accent') &&
  questBounty.querySelector('button')?.isConnected === true &&
  !questBounty.querySelector('[data-iw-tooltip-trigger], [data-iw-item], [data-iw-item-name]') &&
  window.document.getElementById('quest-work-order').textContent.includes('Craft and turn in 1 Moonsilk Boots.'));
check('boss card tagging removed on teardown',
  window.document.querySelectorAll('[data-iw-boss]').length === 0);
check('native Equip button survived teardown',
  [...window.document.querySelector('.compact-row').querySelectorAll('button')]
    .some(b => b.textContent.trim() === 'Equip'));
check('Inventory teardown preserves React display changes made while skin was active',
  nativeIdentityBranch.style.display === 'grid', nativeIdentityBranch.style.cssText);
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
check('activity panel classification returns after re-enable',
  currentActionPanel?.dataset.iwPanel === 'current-action' &&
  actionLogPanel?.dataset.iwPanel === 'action-log' &&
  worldChatPanel?.dataset.iwPanel === 'world-chat');
check('header presentation returns after re-enable',
  window.document.getElementById('top-header')?.getAttribute('data-iw-header') === 'root' &&
  window.document.querySelectorAll('#profile-block > .fs-header-crest').length === 1);
check('skill presentation returns after re-enable', panel.classList.contains('fs-skill--mining'));
check('quest presentation returns after re-enable',
  window.document.getElementById('quest-bounty')?.classList.contains('fs-quest-panel') &&
  window.document.getElementById('quest-work-order')?.getAttribute('data-iw-quest-state') === 'ready');
check('exactly six stylesheets re-injected',
  window.document.querySelectorAll('style[data-iw-style]').length === 6,
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
check('tool-row ornament attribute removed on teardown',
  !window.document.getElementById('pkg-ornament').hasAttribute('data-iw-inventory-control'));
check('tool-row control attributes removed on teardown',
  [...window.document.querySelectorAll('#tool-row button')]
    .every(b => !b.hasAttribute('data-iw-inventory-control')));
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
