#!/usr/bin/env node
/**
 * golden-examples.mjs — exact before/after markup for every skinned surface.
 *
 *   node handoff/native-render-migration/tools/golden-examples.mjs
 *
 * Renders live-shaped fixtures (shapes copied from the live captures and the
 * regression suites) twice in real Chromium: once as the game ships them, and
 * once with the committed extension bundle run over them. For each surface it
 * writes `<surface>.before.html` (the game's markup) and `<surface>.after.html`
 * (the same markup once the extension has settled), pretty-printed, into
 * generated/golden/<route>/. The difference between the two files IS the
 * native render's job for that surface.
 *
 * These are FIXTURES: real shapes, invented data. Where your live markup
 * differs, run tools/capture-skin-contract.js on the live page for the
 * authoritative answer. Asset URLs are rewritten to the default export base
 * (`/fantasy-skin/assets/…`) so they line up with generated/theme-constants.json.
 */
import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const OUT = path.join(ROOT, 'handoff', 'native-render-migration', 'generated', 'golden');
const ORIGIN = 'http://iw.test';
const ASSET_BASE = '/fantasy-skin/';
const bundle = await readFile(path.join(ROOT, 'dist', 'content.bundle.js'), 'utf8');

const ITEMS = JSON.stringify({ generatedAt: 'golden-examples', items: [
  { item_id: 'iron_sword', name: 'Iron Sword', category: 'Equipment', subcategory: 'Weapon Slot', tier: 4, atk: 12 },
  { item_id: 'moonsteel_ore', name: 'Moonsteel Ore', category: 'Resource', tier: 3 },
  { item_id: 'night_claw', name: 'Night Claw', category: 'Resource', tier: 9 },
  { item_id: 'construction_building_tier_11', name: 'Voidiron Archive', category: 'Trade Good', tier: 11, atk: 4, xp_per_task: 7, effects_raw: 'ATK +4, XP +7/task' },
] });
const PLAYER = JSON.stringify({ player: { housing: { tier: 3 }, villageAddons: { totalSlots: 3, installed: [
  { slot: 1, itemKey: 'construction_building_tier_11', name: 'Voidiron Archive' },
] } } });

const CHROME_SHIM = `window.chrome = (() => { const data = {}; const listeners = [];
  return { runtime: { id: 'golden', getURL: p => location.origin + '/' + String(p).replace(/^\\/+/, '') },
    storage: { local: { get: async k => (typeof k === 'string' ? { [k]: data[k] } : { ...data }),
      set: async bag => { const c = {}; for (const [k, v] of Object.entries(bag)) { c[k] = { oldValue: data[k], newValue: v }; data[k] = v; } for (const f of [...listeners]) f(c, 'local'); },
      remove: async k => { delete data[k]; } },
      onChanged: { addListener: f => listeners.push(f), removeListener: f => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); } } } }; })();`;

const GAME_CSS = `*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button,a{font:inherit;color:inherit;background:none;cursor:pointer}body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif}
p{margin:0}.panel{padding:14px;border:1px solid #1e293b;border-radius:16px;background:#111827}
.flex{display:flex}.grid{display:grid}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}
.items-start{align-items:flex-start}.justify-between{justify-content:space-between}.gap-2{gap:.5rem}.gap-3{gap:.75rem}
.min-w-0{min-width:0}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}.relative{position:relative}.absolute{position:absolute}
.fixed{position:fixed}.inset-0{inset:0}.z-50{z-index:50}.backdrop-blur{backdrop-filter:blur(4px)}.bg-black\\/60{background:rgba(0,0,0,.6)}
.mx-auto{margin-left:auto;margin-right:auto}.w-full{width:100%}.space-y-2>*+*{margin-top:.5rem}.space-y-1\\.5>*+*{margin-top:.375rem}
.rounded-full{border-radius:9999px}.h-1\\.5{height:.375rem}.h-full{height:100%}.bg-white\\/10{background:rgba(255,255,255,.1)}
.bg-emerald-400{background:#34d399}.overflow-hidden{overflow:hidden}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}`;

/* ── Surfaces (live shapes; see the header comment) ─────────────────────── */

const SHELL_TOP = `
  <header class="panel p-3.5 sm:p-4" id="g-header"><div class="grid gap-3">
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0 overflow-hidden">
        <p>IdleWorlds</p>
        <h1 class="header-player-name"><button title="View your profile">BustedCypher</button></h1>
        <p class="header-player-title">Craftbound Innovator</p>
        <p>&#9876;&#65039; Combat Lv 62 &bull; Zone 19: Eternium Verge</p>
        <button>Players online: 141</button>
      </div>
      <div class="flex items-center gap-2">
        <button class="header-icon-btn relative" aria-label="Mailbox" title="Mailbox"><svg viewBox="0 0 24 24" width="24" height="24"></svg><span class="absolute -right-1 -top-1 inline-flex min-w-[14px] items-center justify-center rounded-full bg-ember">3</span></button>
        <button class="header-icon-btn" aria-label="Notifications" title="Notifications"><svg viewBox="0 0 24 24" width="24" height="24"></svg></button>
        <button class="header-icon-btn" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" width="24" height="24"></svg></button>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 min-w-0"><div class="stat-chip">&#128176; 10,957,780</div><button class="stat-chip">ATK 350 &bull; DEF 358 &bull; HP 477</button><div class="stat-chip">&#9889; Kaelen boosted (5/5) &middot; 8d 11h left</div><div class="stat-chip">&#129514; XP +36/task &middot; 17h 17m left</div></div>
  </div></header>
  <div class="panel flex flex-wrap gap-2 p-2" id="g-nav"><button class="bg-orange-500">Game</button><button>Market</button><button>Leaderboards</button><button>Village</button><button>Dungeon</button></div>
  <div class="text-xs" id="g-notice">You will auto-attack Ancient Treant when it respawns.</div>
  <div class="panel flex flex-col gap-2 p-3 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between" id="g-zonebar">
    <div><p>&#129517; Zone 19: Eternium Verge<button>who's here?</button></p><p>Next zone target: ATK 287 / DEF 291 (or Lv 77 in any skill)</p></div>
    <div><button>&#127760; Zones</button><button>Previous Zone</button><button>Next Zone</button></div>
  </div>`;

const SKILL_ACTIONS = `
  <div class="panel p-3.5" id="g-skill-actions"><div class="flex items-center justify-between"><h2>Skill Actions</h2><div><p>Daily XP Boost: Jewelcrafting + Mining + Woodcutting +20% XP</p><p>Resets in 13:17</p></div></div>
    <div class="compact-panel" id="g-skill-card">
      <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
        <div><p>&#128142; Jewel</p><p>LV 70</p></div>
        <div>
          <p>&#128142; Prospect Moonsteel Ore</p>
          <button title="Click to cycle XP display" class="hover:text-white/70">Lv 70 - 41.1% &bull; 4,120 to go</button>
          <p class="text-red-400">Requires Jewelcrafting Lv 73</p>
          <p>&#128230; Moonsteel Ore 3/2 &bull; Silver Dust 1/4</p>
          <p>Base reward: +677 jewelcrafting XP/task</p>
          <div class="h-1.5 rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width:41%"></div></div>
        </div>
        <div><div><button aria-label="Previous">&lsaquo;</button><button aria-label="Next">&rsaquo;</button></div><button class="bg-ember">Prospect<span style="width: 38%"></span></button></div>
      </div>
    </div>
  </div>`;

const CURRENT_ACTION = `
  <div class="panel p-3.5" id="current-action-panel"><div class="flex items-center justify-between"><h2>Current Action</h2><div><button aria-label="Cancel current action">&times;</button></div></div>
    <div><strong>Prospect Moonsteel Ore</strong><p>00:00:04</p></div>
    <div class="h-1.5 rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width:40%"></div></div>
    <div><p>Queued</p><div><p>Mine Copper Ore x10</p><button>Remove</button></div></div>
  </div>`;

const ACTION_LOG = `
  <div class="panel p-3.5" id="g-action-log"><div class="flex items-center justify-between"><button type="button" title="View full action log">Action Log <span>view all</span></button>
    <div><p>832,170 XP/hr</p><p>52% win rate</p></div></div>
    <div class="feed-panel"><div><span>12:00:01</span><span>Mined Copper Ore</span></div><div><span>12:00:02</span><span>Mined Copper Ore</span></div></div>
  </div>`;

const WORLD_CHAT = `
  <div class="panel p-3.5" id="g-world-chat"><div class="flex items-center justify-between"><div><h2>World Chat</h2><p>Showing the latest 100 messages.</p></div>
    <div><button aria-label="Favourite chat">&#9734;</button><button aria-label="Chat settings">&#9881;</button></div></div>
    <div><div><span>12:00:01</span><button class="chat-name-3 hover:underline">Kaelen</button><span>hello</span></div><div><span>12:00:02</span><button class="chat-name-1 hover:underline">Mira</button><span>hi</span></div></div>
    <form class="flex gap-2"><input placeholder="Message World Chat"><button>Send</button></form>
  </div>`;

const QUESTS = `
  <div class="panel p-3.5" id="g-quests"><div class="flex items-center justify-between"><h2>Quests</h2></div>
    <div class="compact-panel p-2.5" id="g-quest">
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Crafting Work Order</p>
            <p class="text-xs font-semibold text-white">Craft and turn in 38 Ironwood Planks.</p>
            <p class="mt-1 text-[11px] text-white/45">&#128160; Night Claw 22/100</p>
            <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +12,480g &bull; +9720 crafting XP</p>
          </div>
          <div class="flex shrink-0 flex-col gap-2"><button disabled>Turn In</button><button>Skip (8)</button></div>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 22%"></div></div>
        <div class="text-[11px] text-white/45">22% complete</div>
      </div>
    </div>
  </div>`;

const INVENTORY = `
  <div class="panel p-3.5" id="g-inventory">
    <div class="flex items-center justify-between">
      <div><h2>Inventory</h2></div>
      <div class="flex items-center gap-2">
        <div class="relative"><button aria-label="Filter inventory" title="Filter inventory"><svg width="16" height="16"></svg></button></div>
        <button aria-label="Search inventory" title="Search inventory"><svg width="16" height="16"></svg></button>
        <button aria-label="Equipment Window" title="Equipment Window"><svg width="16" height="16"></svg></button>
        <svg class="lucide lucide-package h-4 w-4 text-ember" width="16" height="16"></svg>
      </div>
    </div>
    <div class="flex gap-2"><button class="bg-orange-500">All</button><button>Gear</button><button>Materials</button><button>Consumables</button><button>Drops</button></div>
    <div class="space-y-1.5">
      <div class="compact-row py-2"><div><span>Moonsteel Ore</span></div><div><span>Tier 3 &middot; Resource</span></div><div><span>x14</span></div><button>List</button></div>
      <div class="compact-row py-2"><div><span>Iron Sword</span></div><div><span>Tier 4 &middot; Weapon</span><span>In loadout I</span></div><div><span>x1</span></div><button>Equip</button><button>List</button></div>
    </div>
    <div class="flex items-center justify-between"><button>Prev</button><span>1 / 3</span><button>Next</button></div>
  </div>`;

const WORLD_BOSSES = `
  <div class="panel p-3.5" id="g-world-bosses"><div><h2>World Bosses</h2><p>Shared world events</p></div>
    <div class="compact-panel"><div><div><p>&#127757; Ancient Treant</p><p>Solo</p><p>Buff on kill: +4 XP/task for 1h</p></div><button>Prejoin</button></div><div class="h-1.5 rounded-full"><div style="width: 40%"></div></div><button>World boss participation</button><div class="fighter-details"><p>Top Fighters</p></div><div><p>Respawns 3m left</p></div></div>
    <h2>Zone Control</h2>
    <div class="compact-panel"><div><p>&#128308; Red Team controls Zone 12</p></div><p>12,500 / 20,000 HP</p><div class="h-1.5 rounded-full"><div style="width: 62.5%"></div></div><p>Protected for 1h</p><button>Last battle participants</button></div>
  </div>`;

const OVERLAY = `
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur" id="g-overlay" style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.6);backdrop-filter:blur(4px)">
    <div class="panel mx-auto" style="max-width:420px;margin-top:80px"><h2>Character Stats</h2>
      <div class="compact-panel"><p>Lifetime Stats</p>
        <div class="flex items-center justify-between"><p class="text-xs text-white/70">Monsters Defeated</p><p class="text-xs font-semibold text-white">1,204</p></div>
        <div class="flex items-center justify-between"><p class="text-xs text-white/70">Wood Chopped</p><p class="text-xs font-semibold text-white">88,410</p></div>
      </div>
      <button>Close</button>
    </div>
  </div>`;

const DASHBOARD = `
<div id="root" data-skin="default">
<div class="mx-auto flex w-full max-w-[1380px] flex-col gap-3 overflow-x-hidden px-2 py-3 sm:px-4 sm:py-5" id="g-shell">${SHELL_TOP}
  <div class="hidden xl:grid xl:grid-cols-2 gap-3" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px">
    <div class="flex min-w-0 flex-col gap-3">${SKILL_ACTIONS}${CURRENT_ACTION}${ACTION_LOG}${WORLD_CHAT}</div>
    <div class="flex min-w-0 flex-col gap-3">${INVENTORY}${QUESTS}${WORLD_BOSSES}</div>
  </div>
</div>
${OVERLAY}
</div>`;

const VILLAGE = `
<div id="root" data-skin="default">
<div class="mx-auto flex w-full max-w-[1380px] flex-col gap-3 overflow-x-hidden px-2 py-3" id="g-shell">
  <header class="panel p-3.5 sm:p-4"><div class="grid gap-3"><div class="flex min-w-0 items-start justify-between gap-3"><div class="min-w-0 overflow-hidden"><p>IdleWorlds</p><h1 class="header-player-name"><button>BustedCypher</button></h1><p>&#9876;&#65039; Combat Lv 62 &bull; Zone 19: Eternium Verge</p><button>Players online: 141</button></div><div class="flex items-center gap-2"><button class="header-icon-btn" aria-label="Settings"><svg width="24" height="24"></svg></button></div></div><div class="grid grid-cols-2 gap-2 min-w-0"><div class="stat-chip">&#128176; 10,957,780</div><button class="stat-chip">ATK 350 &bull; DEF 358 &bull; HP 477</button></div></div></header>
  <div class="panel flex flex-wrap gap-2 p-2"><button>Game</button><button>Market</button><button>Leaderboards</button><button class="bg-orange-500">Village</button><button>Dungeon</button></div>
  <div class="grid gap-3" style="display:grid;gap:12px">
    <div class="panel p-3.5" id="g-housing"><h2>Village</h2>
      <div class="compact-panel">
        <p>&#127968; Villa</p>
        <p>Current tier: 3 &bull; Base actions take 7s</p>
        <p>Salvage Material owned: 1,240</p>
        <p>Next upgrade: Manor &bull; 250,000,000g &bull; 5,000 Salvage Material</p>
        <button>Upgrade Housing</button>
      </div>
    </div>
    <div class="panel p-3.5" id="g-addons"><h2>&#127959;&#65039; Village Add-ons</h2>
      <p>3 slots available (1 per housing tier). Assemble buildings through Construction.</p>
      <div class="space-y-2">
        <div class="compact-panel"><div class="flex items-start justify-between gap-3"><div><p>Slot 1</p><p>Voidiron Archive</p><p>+4 ATK &bull; +7 XP/task</p></div><div><button>Destroy</button><button>Uninstall (100k)</button></div></div></div>
        <div class="compact-panel"><div class="flex items-start justify-between gap-3"><div><p>Slot 2</p><p>Empty slot</p></div><button>Install</button></div></div>
      </div>
      <p>Assemble a building to install it here.</p>
    </div>
  </div>
</div></div>`;

const MARKET = `
<div id="root" data-skin="default">
<div class="mx-auto flex w-full max-w-[1380px] flex-col gap-3 overflow-x-hidden px-2 py-3" id="g-shell">
  <div class="panel flex flex-wrap gap-2 p-2"><button>Game</button><button class="bg-orange-500">Market</button><button>Leaderboards</button><button>Village</button><button>Dungeon</button></div>
  <div class="panel p-3.5" id="g-market"><h2>Market</h2>
    <div class="space-y-2">
      <div class="compact-row"><button class="text-left flex-1"><p>Moonsteel Ore</p><p>x200 &bull; 45g each</p></button><button>Buy</button></div>
      <div class="compact-row"><button class="text-left flex-1"><p>Iron Sword</p><p>x1 &bull; 1,200g</p></button><button>Buy</button></div>
    </div>
  </div>
</div></div>`;

const ROUTES = [
  { route: '/', body: DASHBOARD, ready: ['[data-iw-chrome="shell"]', '#g-skill-card[data-iw-skill-v2="1"]', '#g-quest[data-fs-quest="1"]', '#g-inventory .fs-inv-row', '[data-iw-encounter]', '.iw-village-scene .iw-vs-plot', '[data-iw-overlay="scrim"]'],
    surfaces: {
      'header-chrome': { selector: '#g-shell', trim: '#g-shell > div:not([id])' },
      'skill-actions': { selector: '#g-skill-actions' },
      'village-scene': { selector: '[data-iw-village-scene]', afterOnly: true },
      'current-action': { selector: '#current-action-panel' },
      'action-log': { selector: '#g-action-log' },
      'world-chat': { selector: '#g-world-chat' },
      'inventory': { selector: '#g-inventory' },
      'quests': { selector: '#g-quests' },
      'world-bosses': { selector: '#g-world-bosses' },
      'overlay': { selector: '#g-overlay' },
    } },
  { route: '/housing', body: VILLAGE, ready: ['[data-iw-village="housing"]', '[data-iw-village="slot"]'],
    surfaces: { 'village-housing': { selector: '#g-housing' }, 'village-addons': { selector: '#g-addons' } } },
  { route: '/market', body: MARKET, ready: ['[data-iw-market="root"]'],
    surfaces: { 'market': { selector: '#g-market' } } },
];

const page = (body, withBundle) => `<!doctype html><html${withBundle ? ' data-iw-page-hydrated="1"' : ''}><head><meta charset="utf-8"><title>IdleWorlds</title><style>${GAME_CSS}</style></head><body>${body}
${withBundle ? `<script>${CHROME_SHIM}</` + `script><script>${bundle}</` + `script>` : ''}</body></html>`;

/** Pretty-print a DOM subtree in the page, skipping the skin's <style> nodes. */
const PRETTY = `(root, trimSelector) => {
  const VOID = new Set(['input','img','br','hr','meta','link']);
  const clone = root.cloneNode(true);
  if (trimSelector) for (const el of clone.querySelectorAll(trimSelector.replace(/^#g-shell\\s*>\\s*/, ':scope > '))) el.replaceWith(document.createComment(' panel columns omitted: see the per-panel files '));
  const esc = v => v.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const walk = (node, depth) => {
    const pad = '  '.repeat(depth);
    if (node.nodeType === 8) return pad + '<!--' + node.data + '-->\\n';
    if (node.nodeType === 3) { const t = node.textContent.replace(/\\s+/g, ' ').trim(); return t ? pad + t.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '\\n' : ''; }
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const attrs = [...node.attributes].map(a => ' ' + a.name + '="' + esc(a.value) + '"').join('');
    if (VOID.has(tag)) return pad + '<' + tag + attrs + '>\\n';
    const kids = [...node.childNodes].filter(k => k.nodeType !== 3 || k.textContent.trim());
    if (!kids.length) return pad + '<' + tag + attrs + '></' + tag + '>\\n';
    if (kids.length === 1 && kids[0].nodeType === 3) return pad + '<' + tag + attrs + '>' + kids[0].textContent.replace(/\\s+/g,' ').trim().replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</' + tag + '>\\n';
    return pad + '<' + tag + attrs + '>\\n' + kids.map(k => walk(k, depth + 1)).join('') + pad + '</' + tag + '>\\n';
  };
  return walk(clone, 0);
}`;

const rebase = text => text.replaceAll(`${ORIGIN}/assets/`, `${ASSET_BASE}assets/`);

const browser = await chromium.launch();
await rm(OUT, { recursive: true, force: true });
const index = [];
try {
  for (const { route, body, ready, surfaces } of ROUTES) {
    const dir = path.join(OUT, route === '/' ? 'dashboard' : route.replace(/^\//, ''));
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const html = { before: page(body, false), after: page(body, true) };
    await context.route('**/*', async r => {
      const url = new URL(r.request().url());
      if (/items\.json$/.test(url.pathname)) return r.fulfill({ contentType: 'application/json', body: ITEMS });
      if (url.origin !== ORIGIN) return r.abort();
      if (url.pathname === '/api/player') return r.fulfill({ contentType: 'application/json', body: PLAYER });
      if (url.pathname === route) return r.fulfill({ contentType: 'text/html; charset=utf-8', body: url.searchParams.has('before') ? html.before : html.after });
      try {
        const file = await readFile(path.join(ROOT, url.pathname.slice(1)));
        const type = { '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.csv': 'text/csv' }[path.extname(url.pathname)] || 'application/octet-stream';
        return r.fulfill({ contentType: type, body: file });
      } catch { return r.fulfill({ status: 404, body: '' }); }
    });

    const before = await context.newPage();
    await before.goto(`${ORIGIN}${route}?before`, { waitUntil: 'load' });
    const after = await context.newPage();
    const errors = [];
    after.on('pageerror', e => errors.push(String(e)));
    await after.goto(`${ORIGIN}${route}`, { waitUntil: 'load' });
    for (const sel of ready) {
      await after.waitForSelector(sel, { timeout: 20000, state: 'attached' }).catch(() => errors.push(`never appeared: ${sel}`));
    }
    await after.waitForTimeout(1200);

    const rootState = await after.evaluate(() => {
      const h = document.documentElement;
      const attributes = {}; for (const a of h.attributes) if (a.name !== 'style') attributes[a.name] = a.value;
      const inlineStyle = {}; for (let i = 0; i < h.style.length; i += 1) inlineStyle[h.style[i]] = h.style.getPropertyValue(h.style[i]);
      return { attributes, inlineStyle };
    });
    await writeFile(path.join(dir, 'html-root.after.json'), rebase(JSON.stringify(rootState, null, 2)) + '\n');

    for (const [name, { selector, trim, afterOnly }] of Object.entries(surfaces)) {
      const dump = async (p) => p.evaluate(([sel, fn, trimSel]) => {
        const el = document.querySelector(sel);
        return el ? (0, eval)(`(${fn})`)(el, trimSel) : null;
      }, [selector, PRETTY, trim || null]);
      if (!afterOnly) {
        const b = await dump(before);
        if (b) await writeFile(path.join(dir, `${name}.before.html`), b);
      }
      const a = await dump(after);
      if (a) await writeFile(path.join(dir, `${name}.after.html`), rebase(a));
      index.push({ route, name, selector, before: !afterOnly && !!a, after: !!a });
      if (!a) errors.push(`surface not found after skin: ${name} (${selector})`);
    }
    if (errors.length) console.log(`  ${route}: ${errors.join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}

const lines = ['# Golden before/after examples', '',
  '> Generated by `tools/golden-examples.mjs` from live-shaped fixtures and the committed extension bundle. Real shapes, invented data. Regenerate; do not edit.', '',
  'Each `*.before.html` is markup as the game renders it. Each `*.after.html` is the SAME markup after the extension has settled on it: every added attribute, class, inline style and appended node is visible by diffing the pair (`git diff --no-index a.before.html a.after.html`). `html-root.after.json` is the `<html>` element\'s state on that route.', '',
  'Values that depend on live data or timing (the measured `--iw-progress-duration`, fill widths, label font fit, `data-iw-skill-v2-label-fit`) are whatever the fixture produced; the chapters give the rule for each.', '',
  '| Route | Surface | Before | After |', '| --- | --- | --- | --- |'];
for (const e of index) {
  const dir = e.route === '/' ? 'dashboard' : e.route.replace(/^\//, '');
  lines.push(`| \`${e.route}\` | ${e.name} | ${e.before ? `[before](${dir}/${e.name}.before.html)` : '(skin-only)'} | ${e.after ? `[after](${dir}/${e.name}.after.html)` : 'missing'} |`);
}
await writeFile(path.join(OUT, 'README.md'), lines.join('\n') + '\n');
console.log(`Wrote ${index.length} surfaces to ${path.relative(ROOT, OUT)}`);
