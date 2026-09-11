/**
 * A QUIET PAGE MUST COST NOTHING.
 *
 * DOMWatcher observes `style` attributes, and several renderers write inline
 * styles. That is a loop waiting to happen: any write whose value differs from
 * what is already in the attribute produces a mutation record, which queues the
 * owning panel, which reconciles, which writes again — at animation-frame rate,
 * for as long as the tab is open, with the game doing nothing at all.
 *
 * That is exactly what shipped. `READOUT_STYLES` listed the `background`
 * SHORTHAND together with its own `background-color` longhand, so each
 * reconcile pass serialised the declaration two different ways in turn:
 *
 *     background: none !important   ->   background: none transparent !important
 *
 * Both writes were real attribute changes. Measured on a 12-panel fixture, a
 * page with every game timer stopped still drove ~120 flushes and ~1,440
 * skill-panel reconciles per second, and held the main thread at 40-92% busy
 * depending on inventory size. It reads to a player as general lag with no
 * obvious trigger, and no existing test could see it: every other suite asserts
 * what the DOM ends up looking like, and the end state here was correct.
 *
 * So this test asserts COST, not appearance, and it does it the only way that
 * cannot pass vacuously — by stopping every source of mutation and requiring
 * the skin to go completely silent.
 *
 * REAL BROWSER (Playwright), not jsdom: the bug is CSSOM shorthand
 * serialisation, which jsdom does not reproduce.
 *
 * SECOND FAMILY (2026-09). The same self-driving shape reached production twice
 * more, and this fixture could not see either, because a cost test is only as
 * good as the SHAPES it puts on the page:
 *
 *   A. `.compact-panel` is the game's shared card class, so every quest card
 *      also arrives at SkillPanelRenderer as a non-skill, where `renderPanel`
 *      called `clearPanelChrome()` unconditionally. That teardown strips the
 *      art variables and appended nodes QuestPanelRenderer owns on the SAME
 *      node; Quest re-applies them on the same flush and the two writers drive
 *      each other. Measured: ~400 apply/clear cycles a second from ONE quest
 *      card. This fixture had no quest card at all.
 *
 *   B. `ensureSkillPresentation` assigned `.textContent` unconditionally on the
 *      percent pip and the Base-EXP plaque. `textContent` is a REPLACE-ALL, so
 *      it emits a childList record even when the string is byte-identical, and
 *      DOMWatcher queues the owning panel on childList. This fixture wrote
 *      `Base EXP: 1,387`, which `baseExpValue()` does not match (it wants the
 *      live `Base reward: +N ... XP/task`), so the plaque was never created and
 *      the write never happened.
 *
 * B also shows why counting `iw:dom-flush` alone is not enough: a childList
 * record queues through `queueContext(..., { background: false })`, so
 * `bgRoots` stays empty and NO `iw:dom-flush` is emitted. Loop B ran at ~790
 * skill reconciles a second while the flush counter read zero. The
 * skill-reconcile and style-write counters are what catch it; the mutation
 * counter catches anything that drives neither.
 *
 * Negative controls, all verified by reverting the source:
 *   - put `'background-color': 'transparent'` back into READOUT_STYLES and
 *     phase B goes from 0 flushes to ~600 per 5s;
 *   - put it back into INGR_STYLES for the same result on ingredient lines;
 *   - drop the `ownsPanel(panel)` guard in `renderPanel`: 853 flushes, 3,412
 *     skill reconciles and 243,105 mutation records per 4s;
 *   - drop the `setOwnText` guards in `ensureSkillPresentation`: 0 flushes but
 *     3,740 skill reconciles and 56,100 mutation records per 4s.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* A skill panel per discipline: readouts are the surface that oscillated, and
   there must be several so a regression is unmistakable rather than marginal. */
const SKILLS = [
  ['⛏️ Mine', 'Mine'], ['⚔️ Combat', 'Fight'], ['💎 Prospect', 'Prospect'],
  ['🔨 Smelt', 'Smelt'], ['🧪 Brew', 'Brew'], ['✨ Enchant', 'Enchant'],
  ['🧵 Tailor', 'Tailor'], ['🎣 Fish', 'Fish'],
];

const skillPanel = (i, s) =>
  `<div class="compact-panel" id="skill-${i}">
     <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
       <div><p>${s[0]}</p><p>LV ${20 + i}</p></div>
       <div>
         <!-- The title carries the action's VERB, as every live card does
              ("Mine Copper Ore"). Without it the action-title role never
              resolves, distinctZones cannot find its anchors, and the panel
              gets no three-zone shell - so neither .fs-skill-identity-percent
              nor .fs-skill-base-exp is ever created and loop B has no surface.
              A fixture that models the wrong DOM shape lies exactly like one
              that omits a stylesheet. -->
         <p>${s[1]} Moonsteel Ore Vein</p>
         <button>Lv ${20 + i} - ${i * 3}% • 4,120 to go</button>
         <p>Requires: 12 Iron Bar</p>
         <!-- The LIVE phrasing. \`baseExpValue()\` matches \`Base reward: +N ... XP\`
              and nothing else, so the older \`Base EXP: 1,387\` copy meant
              \`.fs-skill-base-exp\` was never created and loop B could not run. -->
         <p>Base reward: +1387 mining XP/task</p>
         <div><div style="width:${i * 5}%"></div></div>
       </div>
       <!-- The command branch is its own THIRD sibling, as live cards ship it.
            distinctZones requires identity / action-title / action-button to
            resolve to three DIFFERENT children of the shell; with the pager and
            the action button nested in the content branch it sees two, and the
            whole three-zone layout silently falls back. -->
       <div><div><button>‹</button><button>›</button></div><button>${s[1]}</button></div>
     </div>
   </div>`;

/* A quest card is the game's `.compact-panel` too, so it reaches BOTH
   QuestPanelRenderer and SkillPanelRenderer on the same `iw:skill-panel`
   event. Without one on the page, two modules can fight over one node all day
   and this test still reports silence. Shape per QuestPanelRenderer's own
   re-identification: a `^Reward:` line plus a Turn In control. */
const questCard = i =>
  `<div class="compact-panel" id="quest-${i}">
     <p>⛏️ Mining Work Order</p>
     <p>💠 Night Claw ${i * 11}/100</p>
     <p>Reward: +1,875g • +810 combat XP</p>
     <p>${i * 11}% complete</p>
     <button>Turn In</button><button>Skip</button>
   </div>`;

const invRow = i =>
  `<div class="compact-row">
     <div><span>Moonsteel Ore</span><span>+${i % 5}</span></div>
     <div><span>Tier ${1 + (i % 6)} · Weapon</span><span>DEF +${i}</span></div>
     <div><span>x${i * 7}</span></div>
     <button>Equip</button><button>List</button>
   </div>`;

/* The village the scene below Skill Actions will paint. */
const VILLAGE = { player: { housing: { tier: 3 }, villageAddons: { totalSlots: 3, installed: [
  { slot: 1, itemKey: 'construction_building_tier_11', name: 'Voidiron Archive' },
  { slot: 3, itemKey: 'construction_building_tier_4', name: 'Copperbrand Smithy' },
] } } };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a}
.panel{padding:8px}.flex{display:flex}.grid{display:grid}.gap-2{gap:.5rem}</style>
</head><body><div id="root" data-skin="default">
<header><div><h1>BustedCypher</h1><p>⚔ Combat Lv 62</p></div>
  <div><button>☆</button><button>✉</button><button>⚙</button></div>
  <div id="status-grid"><div id="gold-tile">💰 515,686</div><div>⚔ ATK 292 · DEF 252</div></div></header>
<nav><button>Game</button><button>Market</button><button>Village</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>🧭 Zone 19: Eternium Verge</p></div>
  <div><button>🌐 Zones</button><button>Next Zone</button></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<section id="current-action-panel" class="panel">
  <header><h2>Current Action</h2><span id="ca-time">3s</span></header>
  <div><strong>Prospect Moonsteel Ore</strong></div>
  <div id="ca-progress"><div id="ca-fill" style="width:4%"></div></div></section>
<h2>Inventory</h2>
<section aria-label="Inventory" id="inventory-section" class="panel">
  <div class="flex items-center gap-2">
    <div class="relative"><button aria-label="Filter inventory" title="Filter inventory"><svg></svg></button></div>
    <button aria-label="Search inventory" title="Search inventory"><svg></svg></button>
    <svg class="lucide lucide-package text-ember"></svg></div>
  <div class="space-y-1.5">${Array.from({ length: 30 }, (_, i) => invRow(i)).join('')}</div></section>
<div class="panel" id="skill-actions"><h2>Skill Actions</h2>
${SKILLS.map((s, i) => skillPanel(i, s)).join('')}</div>
<h2>Quests</h2>
<div class="panel" id="quests">${[1, 2].map(questCard).join('')}</div>
</div>
</div><script>${bundle}</` + `script></body></html>`;

const PAGE_URL = 'http://iw.test/flush-quiescence.html';
const MIME = {
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

let executablePath;
try {
  executablePath = process.env.IW_CHROMIUM_PATH || chromium.executablePath();
} catch {
  executablePath = process.env.IW_CHROMIUM_PATH || undefined;
}

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  ignoreDefaultArgs: ['--headless=old'],
  timeout: 120000,
});

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

const errs = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => errs.push(String(e)));

/** Serve the page and every relative asset the skin asks for out of the repo,
 *  so the atlas really resolves and the panels really reach their ready state. */
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://iw.test') return route.abort();
  if (url.pathname === '/flush-quiescence.html') {
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
  }
  /* VillageScene reads this once and then holds its snapshot for minutes. A
     404 would be quiet too, but for the WRONG reason: the frame would render
     its error copy with no plots, and a loop inside the scene would then have
     nothing to run on — the same "nothing to be quiet about" hole the quest
     cards and Base-EXP plaques below exist to close. */
  if (url.pathname === '/api/player') {
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(VILLAGE) });
  }
  try {
    const body = await readFile(resolve(ROOT, url.pathname.replace(/^\/+/, '')));
    const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
    return route.fulfill({ contentType: MIME[ext] || 'application/octet-stream', body });
  } catch {
    return route.fulfill({ status: 404, body: '' });
  }
});

await page.goto(PAGE_URL, { waitUntil: 'load' });

/* Phase A: let the skin do its real first-pass work and settle. Everything it
   legitimately does on mount belongs here, not in the measured window. */
await page.waitForTimeout(4000);

/* Phase B: the page is now quiescent — nothing in this fixture mutates, there
   is no game timer, no input and no resize. Every count below is therefore the
   skin reacting to its OWN writes, and the only correct number is zero. */
console.log('\nQuiescence — 4s with no game mutation whatsoever');
await page.evaluate(() => {
  window.__c = { flush: 0, skill: 0, style: 0, mut: 0 };
  document.addEventListener('iw:dom-flush', () => { window.__c.flush += 1; });
  document.addEventListener('iw:skill-panel', () => { window.__c.skill += 1; });

  const sp = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (...a) {
    window.__c.style += 1;
    return sp.apply(this, a);
  };
  const rp = CSSStyleDeclaration.prototype.removeProperty;
  CSSStyleDeclaration.prototype.removeProperty = function (...a) {
    window.__c.style += 1;
    return rp.apply(this, a);
  };

  // Catches a loop that drives NEITHER counter above — loop B emitted no
  // iw:dom-flush at all, and a future one may write no inline style either.
  window.__obs = new MutationObserver(list => { window.__c.mut += list.length; });
  window.__obs.observe(document.body, {
    subtree: true, childList: true, attributes: true, characterData: true,
  });
});
await page.waitForTimeout(4000);

const c = await page.evaluate(() => {
  window.__obs.disconnect();
  return window.__c;
});
console.log(`  observed: ${c.flush} flushes, ${c.skill} skill reconciles, ${c.style} inline-style writes, ${c.mut} mutation records`);

check('a quiet page schedules no repeating flushes', c.flush <= 5, `${c.flush} flushes`);
check('a quiet page reconciles no skill panels', c.skill <= 5, `${c.skill} reconciles`);
check('the skin does not rewrite inline styles on a quiet page', c.style <= 10, `${c.style} style writes`);
check('a quiet page produces no DOM mutations at all', c.mut <= 10, `${c.mut} mutation records`);

/* Sanity: the readouts really were classified, so the checks above had
   something to be quiet ABOUT. A fixture the skin never reached would report
   silence for the wrong reason — the same failure mode as a check that can
   only pass. The quest cards and the Base-EXP plaques are asserted for exactly
   that reason too: each is the shape that exposed one of the two 2026-09
   loops, and without it this file is blind to that loop again. */
const readouts = await page.evaluate(() =>
  document.querySelectorAll('[data-iw-readout]').length);
check('the readouts under test are actually classified', readouts >= SKILLS.length,
  `${readouts} readouts`);

const shapes = await page.evaluate(() => ({
  quests: document.querySelectorAll('.fs-quest-panel').length,
  plaques: document.querySelectorAll('.fs-skill-base-exp').length,
  percents: document.querySelectorAll('.fs-skill-identity-percent').length,
  plots: document.querySelectorAll('[data-iw-village-scene] .iw-vs-plot').length,
  collapses: document.querySelectorAll('[data-iw-collapse]').length,
  ordered: document.querySelectorAll('[data-iw-order]').length,
}));
check('quest cards are classified, so loop A has a surface to run on',
  shapes.quests >= 2, `${shapes.quests} quest panels`);
check('Base-EXP plaques exist, so loop B has a surface to run on',
  shapes.plaques >= 1, `${shapes.plaques} plaques (needs the live "Base reward: +N ... XP" copy)`);
/* The village scene is the skin's own subtree — it OWNS every node in it and
   rewrites them from a signature, so it is the shape most able to drive itself.
   It also runs on every flush and holds a network read. */
check('the village scene is mounted, so its reconcile has a surface too',
  shapes.plots === 5, `${shapes.plots} plots`);
/* CollapsibleFrames runs on every flush and APPENDS a node, which is the one
   thing in this file's history that turns a classifier into a loop. Its guard
   is a `:scope >` probe; without a mounted control here the silence above
   would again be silence about nothing. */
check('collapse controls are mounted, so their pass has a surface too',
  shapes.collapses >= 3, `${shapes.collapses} controls`);
/* PanelOrder also runs on every flush and writes an attribute on a GAME node.
   That write is invisible to the observer by design, which is exactly the claim
   this file has to keep honest — so the panels have to be claimed here, or the
   zero above says nothing about it. */
check('panels carry arrangement slots, so the order pass has a surface too',
  shapes.ordered >= 3, `${shapes.ordered} ordered panels`);

check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
console.log(failures ? `\nFAIL flush-quiescence (${failures})` : '\nPASS flush-quiescence');
process.exit(failures ? 1 : 0);
