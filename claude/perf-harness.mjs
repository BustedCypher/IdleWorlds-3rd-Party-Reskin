/**
 * perf-harness — what the skin costs the main thread on a live-shaped, TICKING
 * page. Built for the 2026-09-17 release pass; see docs/traps/performance.md.
 *
 *   node claude/perf-harness.mjs [--bundle dist/content.bundle.js] [--label name]
 *        [--runs 3] [--phases boot,active,mouse] [--noskin] [--width 1400]
 *        [--reduced-motion] [--full]
 *        [--mutprobe] [--callprobe] [--animprobe] [--selstats]
 *
 * The page is ~15k nodes with the skin on (both of the game's duplicate
 * columns, a 200-row inventory with +N gear, 100 chat and 50 log rows,
 * 12 skill cards, quests and bosses) and uses the REAL items.json (cached in
 * tmp/items.json; fetched once from idleworlds.com if missing). A simulated
 * game ticks it: progress fills every 250ms, timers/gold/XP every 1s, a chat
 * row every 1.5s, a log row and an inventory quantity every 3s.
 *
 * Phases, each measured with CDP Performance.getMetrics deltas plus a sampled
 * CPU profile in which every sample is charged to the NEAREST skin frame on
 * its stack (so a native querySelectorAll or a forced recalc counts against
 * the skin function that caused it):
 *   boot   inject the bundle after load, as document_idle does; 6s
 *   active the simulated game ticking; 10s
 *   mouse  the same, with the pointer sweeping chat and inventory; 5s
 *
 * Always compare against --noskin (the same page and ticks with no skin) and
 * against a second bundle, over --runs 3; one run is noise. Two traps this
 * harness already hit: a forced style read in a rAF often pays for recalc the
 * frame would do anyway (remove the reader and the cost moves, it does not
 * vanish - compare TaskDuration, not one function's share), and headless
 * software rendering inflates paint cost relative to a GPU.
 *
 * Probes (run after the active phase):
 *   --mutprobe   3s of mutation records grouped by (type, attribute, target),
 *                with old -> new samples: finds same-value write loops
 *   --callprobe  3s of checkVisibility / getBoundingClientRect /
 *                getComputedStyle calls grouped by caller and target
 *   --animprobe  which CSS animations/transitions are live
 *   --selstats   Chrome's per-selector match statistics over 4s
 * Output: tmp/perf/perf-<label>.json and a summary on stdout.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tmp/perf');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const flag = name => process.argv.includes(`--${name}`);
const BUNDLE = resolve(ROOT, arg('bundle', 'dist/content.bundle.js'));
const LABEL = arg('label', 'run');
const RUNS = Number(arg('runs', '1'));
const NOSKIN = flag('noskin');
const WIDTH = Number(arg('width', '1400'));
const PHASES = arg('phases', 'boot,active,mouse').split(',');

await mkdir(OUT, { recursive: true });
const ITEMS_CACHE = resolve(ROOT, 'tmp/items.json');
if (!existsSync(ITEMS_CACHE)) {
  const res = await fetch('https://idleworlds.com/items.json');
  if (!res.ok) throw new Error(`items.json: ${res.status}`);
  await writeFile(ITEMS_CACHE, Buffer.from(await res.arrayBuffer()));
}
const bundle = (await readFile(BUNDLE, 'utf8')) + '\n//# sourceURL=skin-bundle.js';
const itemsJson = await readFile(ITEMS_CACHE);
const names = JSON.parse(itemsJson).items.map(i => i.name).filter(n => n && n.length > 3 && !/[<>&]/.test(n));
const pick = i => names[(i * 7919) % names.length];

const VILLAGE = { player: { housing: { tier: 3 }, villageAddons: { totalSlots: 3, installed: [
  { slot: 1, itemKey: 'construction_building_tier_11', name: 'Voidiron Archive' },
  { slot: 3, itemKey: 'construction_building_tier_4', name: 'Copperbrand Smithy' },
] } } };
const SKILLS = [
  ['⛏️ Mine', 'Mine'], ['⚔️ Combat', 'Fight'], ['💎 Prospect', 'Prospect'], ['🔨 Smelt', 'Smelt'],
  ['🧪 Brew', 'Brew'], ['✨ Enchant', 'Enchant'], ['🧵 Tailor', 'Tailor'], ['🎣 Fish', 'Fish'],
  ['🪓 Wood', 'Chop'], ['🏗️ Build', 'Craft Parts'], ['🌿 Gathering', 'Gather'], ['🛠️ Smith', 'Forge'],
];
const skillPanel = (i, s, d) => `<div class="compact-panel" ${d ? '' : `id="skill-${i}"`}>
  <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
    <div><p>${s[0]}</p><p>LV ${20 + i}</p></div>
    <div><p>${s[0].split(' ')[0]} ${s[1]} ${pick(i + 11)}</p>
      <button data-sim="xp-${i}">Lv ${20 + i} - ${i * 3}.0% • 4,120 to go</button>
      <p>🪨 ${pick(i + 3)} ${i}/12 • 🧱 ${pick(i + 5)} 3/4</p>
      <p>Requires Smithing Lv 12</p>
      <p>Base reward: +${1387 + i} mining XP/task</p>
      <div role="progressbar"><div style="width:${i * 5}%"></div></div></div>
    <div><div><button>‹</button><button>›</button></div><button data-sim="action-${i}">${s[1]}${i === 0 ? '<span style="width:8%" data-sim="fill"></span>' : ''}</button></div>
  </div></div>`;
const questCard = (i, d) => `<div class="compact-panel p-2.5" ${d ? '' : `id="quest-${i}"`}><div class="space-y-2">
  <div class="flex items-start justify-between gap-3"><div class="min-w-0 flex-1">
    <p class="text-xs font-semibold text-white">${pick(i + 40)} Bounty</p>
    <p class="mt-1 text-[11px]">💠 ${pick(i + 40)} ${i * 11}/100</p>
    <p class="mt-1 text-[11px]">Reward: +1,875g • +810 combat XP</p></div>
    <div class="flex shrink-0 flex-col gap-2"><button>Turn In</button><button>Skip (8)</button></div></div>
  <div class="h-1.5"><div style="width: ${i * 11}%"></div></div><div class="text-[11px]">${i * 11}% complete</div></div></div>`;
const invRow = (i, d) => `<div class="compact-row">
  <div><span>${pick(i)}</span><span>+${i % 5}</span></div>
  <div><span>Tier ${1 + (i % 6)} · Weapon</span><span>DEF +${i}</span></div>
  <div><span ${d ? '' : `data-sim="qty-${i}"`}>x${i * 7 + 1}</span></div>
  <button>Equip</button><button>List</button></div>`;
const chatMsg = i => `<article><div><strong>Player${i % 37}</strong><time>12:${String(i % 60).padStart(2, '0')}:01</time></div><p>selling ${pick(i + 100)} x${i % 9 + 1}, also want ${pick(i + 200)}</p></article>`;
const logRow = i => `<article><div><span>System</span><time>12:33:${String(i % 60).padStart(2, '0')}</time></div><p>Prospect ${pick(i + 300)} completed 1 time. ${pick(i + 301)} x28.</p><p>XP jewelcrafting+1387</p></article>`;
const column = d => `
<section ${d ? '' : 'id="current-action-panel"'} class="panel">
  <header><h2>Current Action</h2><div><button aria-label="Cancel current action">×</button><span data-sim="ca-time">180s</span></div></header>
  <div><span>⚒</span><strong>Prospect ${pick(1)}</strong></div>
  <div aria-valuenow="4" aria-valuemax="100"><div data-sim="ca-fill" style="width:4%"></div></div>
  <p>6457 crafts left before the next queued action (~10h 45m)</p></section>
<section class="panel"><header><h2>Action Log</h2><button>View All</button><span data-sim="xphr">832,170 XP/hr</span></header>
  <div data-sim="log">${Array.from({ length: 50 }, (_, i) => logRow(i)).join('')}</div></section>
<section class="panel"><header><div><h2>World Chat</h2><p>Showing the latest 100 messages.</p></div><div><button aria-label="Chat settings">⚙</button></div></header>
  <div data-sim="chat">${Array.from({ length: 100 }, (_, i) => chatMsg(i)).join('')}</div>
  <form><input placeholder="Message world chat..."><button type="button">Send</button></form></section>
<h2>Inventory</h2>
<section aria-label="Inventory" class="panel">
  <div class="flex items-center gap-2"><div class="relative"><button aria-label="Filter inventory" title="Filter inventory"><svg></svg></button></div>
    <button aria-label="Search inventory" title="Search inventory"><svg></svg></button><svg class="lucide lucide-package text-ember"></svg></div>
  <div class="flex flex-wrap gap-1.5"><button>All</button><button>Gear</button><button>Materials</button></div>
  <div class="space-y-1.5" ${d ? '' : 'id="inv-list"'}>${Array.from({ length: 200 }, (_, i) => invRow(i, d)).join('')}</div></section>
<div class="panel p-3.5"><div class="mb-3 flex items-center justify-between"><h2>Skill Actions</h2></div>
  <p>Daily XP Boost: +10% XP</p>
  ${SKILLS.map((s, i) => skillPanel(i, s, d)).join('')}</div>
<div class="panel p-3.5"><div class="mb-2 flex items-center justify-between"><h2>Quests</h2></div>
  <div class="space-y-2">${[1, 2, 3].map(i => questCard(i, d)).join('')}</div></div>
<div class="panel p-3.5"><div class="mb-2 flex items-center justify-between"><h2>World Bosses</h2><span>Shared world events</span></div>
  <div class="space-y-2">
    <div class="compact-panel p-2.5"><div><p>🌍 Ancient Treant</p><p>Solo</p><p>Buff on kill: +4 XP/task for 1h</p><p>World boss participation</p><p data-sim="boss">Respawns 8m left</p></div><button>⏳ Prejoined</button></div>
    <div class="compact-panel p-2.5"><div><p>🌍 Abyssal Behemoth</p><p>Raid</p><p>Buff on kill: +8 XP/task for 2h</p><p>World boss participation</p><p>Respawns 1h 26m left</p></div><button>⏳ Prejoin</button></div>
  </div></div>`;

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a;color:#e2e8f0;font:14px/1.4 system-ui}
.panel{padding:8px;background:#111827;border:1px solid #1f2937;border-radius:12px}.flex{display:flex}.grid{display:grid}.gap-2{gap:.5rem}
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.stack{display:flex;flex-direction:column;gap:12px}
@media (min-width:1280px){.xl-hidden{display:none}} @media (max-width:1279px){.xl-grid{display:none}}</style>
</head><body><div id="root" data-skin="default"><div class="app">
<header><div><h1>BustedCypher</h1><p>⚔ Combat Lv 62 · Zone 14: Moonsteel Basin</p><p>● Players online: <span data-sim="online">145</span></p></div>
  <div><button>☆</button><button>✉</button><button>⚙</button></div>
  <div id="status-grid"><div>💰 <span data-sim="gold">515,686</span></div><div>🧪 XP +36/task · 22h 53m left</div><div>⚔ ATK 292 · DEF 252 · HP 477</div></div></header>
<nav><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>🧭 Zone 19: Eternium Verge</p><p>Next zone target: ATK 287 / DEF 291</p></div>
  <div><button>🌐 Zones</button><button>Previous Zone</button><button>Next Zone</button></div></div>
<div class="xl-grid cols stack">${column(false)}</div>
<div class="xl-hidden stack">${column(true)}</div>
</div></div>
<script>
//# sourceURL=sim.js
(() => {
  const all = sel => document.querySelectorAll('[data-sim="' + sel + '"]');
  let timers = [], n = 0, t = 180, fill = 8, ca = 4, gold = 515686, xp = 0, chatI = 1000, logI = 1000;
  const every = (ms, fn) => timers.push(setInterval(fn, ms));
  window.__sim = {
    start() {
      every(250, () => {
        ca = ca >= 100 ? 4 : ca + 2; all('ca-fill').forEach(e => { e.style.width = ca + '%'; });
        fill = fill >= 100 ? 8 : fill + 2; all('fill').forEach(e => { e.style.width = fill + '%'; });
      });
      every(1000, () => {
        t = t <= 1 ? 180 : t - 1; all('ca-time').forEach(e => { e.textContent = t + 's'; });
        gold += 37; all('gold').forEach(e => { e.textContent = gold.toLocaleString('en-US'); });
        xp = (xp + 0.1) % 100; all('xp-0').forEach(e => { e.textContent = 'Lv 20 - ' + xp.toFixed(1) + '% • ' + (4120 - Math.floor(xp * 10)).toLocaleString('en-US') + ' to go'; });
        all('xphr').forEach(e => { e.textContent = (832170 + (n++ % 50)).toLocaleString('en-US') + ' XP/hr'; });
      });
      every(1500, () => {
        const html = ${JSON.stringify(chatMsg(0))}.replace('Player0', 'Player' + (chatI++));
        all('chat').forEach(feed => { feed.insertAdjacentHTML('beforeend', html); if (feed.children.length > 100) feed.firstElementChild.remove(); });
      });
      every(3000, () => {
        const html = ${JSON.stringify(logRow(0))};
        all('log').forEach(feed => { feed.insertAdjacentHTML('afterbegin', html); if (feed.children.length > 50) feed.lastElementChild.remove(); });
        all('qty-' + (logI++ % 200)).forEach(e => { e.textContent = 'x' + (logI * 3); });
        all('boss').forEach(e => { e.textContent = 'Respawns ' + (8 - (logI % 8)) + 'm left'; });
      });
    },
    stop() { timers.forEach(clearInterval); timers = []; },
  };
})();
</script></body></html>`;

const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.csv': 'text/csv' };

/* In-page probes. Plain functions, serialised by page.evaluate. */
function describe(n) {
  if (!n) return '?';
  if (n.nodeType !== 1) return `${n.nodeName} in ${describe(n.parentElement)}`;
  const cls = typeof n.className === 'string' && n.className.trim() ? `.${n.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  const data = [...n.attributes].filter(a => /^data-(iw|sim)/.test(a.name) && !/signature/.test(a.name))
    .slice(0, 2).map(a => `[${a.name}=${a.value.slice(0, 24)}]`).join('');
  return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${cls}${data}`;
}
async function mutationProbe(describeSrc) {
  const describe = new Function(`return ${describeSrc}`)();
  const recs = new Map();
  let flushes = 0;
  const onFlush = () => { flushes += 1; };
  document.addEventListener('iw:dom-flush', onFlush);
  const mo = new MutationObserver(list => {
    for (const m of list) {
      const what = m.type === 'childList'
        ? `+${m.addedNodes.length}-${m.removedNodes.length}`
        : (m.attributeName || '');
      const key = `${m.type}:${what} @ ${describe(m.target)}`;
      const e = recs.get(key) || { n: 0, sample: [] };
      e.n += 1;
      if (e.sample.length < 2 && m.type === 'attributes') {
        e.sample.push(`${String(m.oldValue).slice(-60)} -> ${String(m.target.getAttribute(m.attributeName)).slice(-60)}`);
      }
      recs.set(key, e);
    }
  });
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
  await new Promise(r => setTimeout(r, 3000));
  mo.disconnect();
  document.removeEventListener('iw:dom-flush', onFlush);
  return { flushes, top: [...recs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25) };
}
async function callProbe(describeSrc) {
  const describe = new Function(`return ${describeSrc}`)();
  const stacks = new Map();
  let calls = 0;
  const wrap = (owner, name) => {
    const orig = owner[name];
    owner[name] = function (...args) {
      calls += 1;
      const frame = (new Error().stack || '').split('\n')[2] || '';
      const caller = `${(frame.match(/at (\S+)/) || [])[1]}:${(frame.match(/:(\d+):\d+\)?$/) || [])[1] || ''}`;
      const target = name === 'getComputedStyle' ? args[0] : this;
      const key = `${name} ${caller} @${describe(target)}`;
      stacks.set(key, (stacks.get(key) || 0) + 1);
      return orig.apply(this, args);
    };
    return () => { owner[name] = orig; };
  };
  const undo = [wrap(Element.prototype, 'checkVisibility'), wrap(Element.prototype, 'getBoundingClientRect'), wrap(window, 'getComputedStyle')];
  await new Promise(r => setTimeout(r, 3000));
  undo.forEach(f => f());
  return { calls, top: [...stacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20) };
}
async function animationProbe(describeSrc) {
  const describe = new Function(`return ${describeSrc}`)();
  const seen = new Map();
  for (let i = 0; i < 30; i += 1) {
    for (const a of document.getAnimations()) {
      const effect = a.effect;
      const timing = effect?.getComputedTiming?.() || {};
      const kind = a.constructor.name === 'CSSTransition' ? `transition:${a.transitionProperty}`
        : a.constructor.name === 'CSSAnimation' ? `animation:${a.animationName}` : a.constructor.name;
      const key = `${kind} ${a.playState}${timing.iterations === Infinity ? ' (infinite)' : ''} ${describe(effect?.target)}${effect?.pseudoElement || ''}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
}

function attribute(profile) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const owner = new Map();
  // Generic helpers are reported together with their caller.
  const HELPER = /^(isRendered|pickRendered|preferRendered|guard|guardEach|setText|setData|emit|\(anon\)):/;
  const ownerOf = id => {
    if (owner.has(id)) return owner.get(id);
    let key = null;
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const cf = byId.get(cur).callFrame;
      if (!/skin-bundle/.test(cf.url)) continue;
      const name = `${cf.functionName || '(anon)'}:${cf.lineNumber + 1}`;
      if (!key && HELPER.test(name)) { key = name; continue; }
      key = key ? `${key} <- ${name}` : name;
      break;
    }
    if (!key) {
      const leaf = byId.get(id).callFrame;
      key = leaf.url ? `(page) ${leaf.functionName || leaf.url.split('/').pop()}` : `(${leaf.functionName || 'program'})`;
    }
    owner.set(id, key);
    return key;
  };
  const self = new Map();
  profile.samples.forEach((sample, i) => {
    const k = ownerOf(sample);
    self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000);
  });
  const skinSelfMs = Math.round([...self].filter(([k]) => !k.startsWith('(')).reduce((a, [, v]) => a + v, 0));
  return { skinSelfMs, rows: [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v * 10) / 10]) };
}

async function runOnce(browser) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'idleworlds.com') return route.abort();
    if (url.pathname === '/game') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
    if (url.pathname === '/items.json') return route.fulfill({ contentType: 'application/json', body: itemsJson });
    if (url.pathname === '/api/player') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(VILLAGE) });
    try {
      const body = await readFile(resolve(ROOT, url.pathname.replace(/^\/+/, '')));
      return route.fulfill({ contentType: MIME[url.pathname.slice(url.pathname.lastIndexOf('.'))] || 'application/octet-stream', body });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  if (flag('reduced-motion')) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('https://idleworlds.com/game', { waitUntil: 'load' });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const KEYS = ['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'RecalcStyleCount', 'LayoutCount'];
  const measure = async body => {
    await page.evaluate(() => {
      window.__c = { flush: 0, name: 0, skill: 0, inv: 0, mut: 0 };
      for (const [t, k] of [['iw:dom-flush', 'flush'], ['iw:name-scan-flush', 'name'], ['iw:skill-panel', 'skill'], ['iw:inventory-row', 'inv']]) {
        document.addEventListener(t, () => { window.__c[k] += 1; });
      }
      window.__obs?.disconnect();
      window.__obs = new MutationObserver(l => { window.__c.mut += l.length; });
      window.__obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    const m0 = await metrics();
    await cdp.send('Profiler.start');
    await body();
    const { profile } = await cdp.send('Profiler.stop');
    const m1 = await metrics();
    const counts = await page.evaluate(() => { window.__obs.disconnect(); return window.__c; });
    const delta = Object.fromEntries(KEYS.map(k => [k, k.endsWith('Count') ? m1[k] - m0[k] : Math.round((m1[k] - m0[k]) * 10000) / 10]));
    return { ...delta, counts, top: attribute(profile) };
  };
  const inject = () => page.evaluate(src => {
    // The latch src/page/hydration-signal.js sets on the live page.
    document.documentElement.setAttribute('data-iw-page-hydrated', '1');
    const s = document.createElement('script');
    s.textContent = src;
    document.head.append(s);
  }, bundle);

  const out = {};
  if (PHASES.includes('boot')) {
    out.boot = await measure(async () => { if (!NOSKIN) await inject(); await page.waitForTimeout(6000); });
  } else if (!NOSKIN) {
    await inject();
    await page.waitForTimeout(6000);
  }
  await page.evaluate(() => window.__sim.start());
  await page.waitForTimeout(2000);
  if (PHASES.includes('active')) out.active = await measure(() => page.waitForTimeout(10000));

  const describeSrc = describe.toString();
  if (flag('mutprobe')) {
    const r = await page.evaluate(`(${mutationProbe})(${JSON.stringify(describeSrc)})`);
    console.log(`\nmutation probe, 3s: ${r.flushes} dom-flushes`);
    for (const [k, v] of r.top) console.log(`  x${v.n} ${k}${v.sample.length ? `\n       ${v.sample.join(' | ')}` : ''}`);
  }
  if (flag('callprobe')) {
    const r = await page.evaluate(`(${callProbe})(${JSON.stringify(describeSrc)})`);
    console.log(`\nlayout/style read probe, 3s: ${r.calls} calls`);
    for (const [k, v] of r.top) console.log(`  x${v} ${k}`);
  }
  if (flag('animprobe')) {
    const r = await page.evaluate(`(${animationProbe})(${JSON.stringify(describeSrc)})`);
    console.log('\nanimation probe (samples of 30 @100ms):');
    for (const [k, v] of r) console.log(`  ${v}/30 ${k}`);
  }
  if (flag('selstats')) {
    const events = [];
    cdp.on('Tracing.dataCollected', e => events.push(...e.value));
    const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['disabled-by-default-blink.debug', 'devtools.timeline'] } });
    await page.waitForTimeout(4000);
    await cdp.send('Tracing.end');
    await done;
    const agg = new Map();
    for (const e of events) {
      for (const s of e.args?.selector_stats?.selector_timings || []) {
        const a = agg.get(s.selector) || { us: 0, attempts: 0, matches: 0 };
        a.us += Number(s['elapsed (us)'] || 0);
        a.attempts += Number(s.match_attempts || 0);
        a.matches += Number(s.match_count || 0);
        agg.set(s.selector, a);
      }
    }
    const rows = [...agg].sort((a, b) => b[1].us - a[1].us);
    console.log(`\nselector stats, 4s: ${rows.length} selectors, ${(rows.reduce((t, [, a]) => t + a.us, 0) / 1000).toFixed(0)}ms matching in total`);
    for (const [sel, a] of rows.slice(0, 25)) console.log(`  ${(a.us / 1000).toFixed(1).padStart(6)}ms attempts=${a.attempts} matches=${a.matches}  ${sel.slice(0, 140)}`);
  }

  if (PHASES.includes('mouse')) {
    out.mouse = await measure(async () => {
      const boxes = await page.evaluate(() => ['[data-sim="chat"]', '#inv-list'].map(s => {
        const r = document.querySelector(s).getBoundingClientRect();
        return [r.left, r.width];
      }));
      await page.evaluate(() => window.scrollTo(0, 0));
      const end = Date.now() + 5000;
      for (let k = 0; Date.now() < end; k += 1) {
        const [left, width] = boxes[k % 2];
        await page.mouse.move(left + ((k * 37) % Math.max(1, width)), 60 + (k * 13) % 800);
      }
    });
  }
  out.nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  out.errors = errors;
  await context.close();
  return out;
}

const browser = await chromium.launch({ args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'], ignoreDefaultArgs: ['--headless=old'] });
const runs = [];
for (let r = 0; r < RUNS; r += 1) runs.push(await runOnce(browser));
await browser.close();

const median = arr => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const summary = { label: LABEL, bundle: NOSKIN ? null : BUNDLE, width: WIDTH, nodes: runs[0].nodes, errors: runs.flatMap(r => r.errors).slice(0, 5) };
for (const phase of PHASES) {
  const rs = runs.map(r => r[phase]).filter(Boolean);
  if (!rs.length) continue;
  summary[phase] = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'RecalcStyleCount', 'LayoutCount']
    .map(k => [k, median(rs.map(x => x[k]))]));
  summary[phase].skinSelfMs = median(rs.map(x => x.top.skinSelfMs));
  summary[phase].counts = rs[Math.floor(rs.length / 2)].counts;
  summary[phase].top = rs[Math.floor(rs.length / 2)].top.rows;
}
await writeFile(resolve(OUT, `perf-${LABEL}.json`), JSON.stringify({ summary, runs }, null, 2));
console.log(`\n== ${LABEL} (${NOSKIN ? 'no skin' : arg('bundle', 'dist/content.bundle.js')}) width=${WIDTH} nodes=${summary.nodes} runs=${RUNS} (medians)`);
if (summary.errors.length) console.log('  page errors:', summary.errors);
for (const phase of PHASES) {
  const p = summary[phase];
  if (!p) continue;
  console.log(`  ${phase.padEnd(6)} task=${p.TaskDuration}ms script=${p.ScriptDuration}ms style=${p.RecalcStyleDuration}ms (${p.RecalcStyleCount}x) layout=${p.LayoutDuration}ms (${p.LayoutCount}x) skin=${p.skinSelfMs}ms ${JSON.stringify(p.counts)}`);
  for (const [k, v] of p.top.slice(0, flag('full') ? 30 : 12)) console.log(`      ${String(v).padStart(8)}ms  ${k}`);
}
