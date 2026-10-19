/**
 * Fantasy chrome (src/skins/fantasy/chrome/, styles/chrome.css), in Chromium
 * with the game's CSS and the port's fantasy.css from the 2026-10-16 fixture,
 * on header markup shaped like the live port's (tags as HeaderRenderer /
 * HeaderChrome write them):
 *
 *   - the ATK + DEF potion chips read as ONE frame with a summary; the combat
 *     line is never taken for a potion; an active potion keeps its detail;
 *     a grid with only one potion chip is left alone (negative control);
 *   - header travel controls are hidden on phone and desktop; phone hides
 *     the emerald last-action notice and keeps any other notice;
 *   - nav tabs gain padding without overflowing the row; the Daily XP Boost
 *     line is shorter than the port draws it;
 *   - stop() removes every attribute and the sheet.
 */

import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FIX = resolve(ROOT, 'tests/fixtures/live-2026-10-16');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};

const fantasyJs = (await build({
  entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')], bundle: true, write: false, format: 'iife',
  platform: 'browser', loader: { '.css': 'text' }, logLevel: 'silent', globalName: 'Fantasy',
})).outputFiles[0].text;

const chip = (text, extra = '') => `<button class="stat-chip text-center min-w-0 ${extra}" data-iw-header="status-card" title="View all active buffs &amp; stats">${text}</button>`;
const tab = (name, active = false) => `<a class="rounded-xl px-3 py-2 text-xs font-semibold" href="/${name.toLowerCase()}" data-iw-ui="nav-tab"${active ? ' data-iw-state="active"' : ''}>${name}</a>`;

const body = ({ atk = '⚔️ No ATK potion active', def = '🛡️ No DEF potion active', notice = 'emerald' } = {}) => `
<div data-iw-chrome="shell" class="mx-auto flex w-full flex-col gap-3">
  <header class="panel p-3.5" data-iw-header="root"><div class="grid gap-3" data-iw-header="layout">
    <div class="min-w-0"><h1>Player</h1></div>
    <div class="grid grid-cols-2 gap-2 min-w-0" data-iw-header="status-grid" id="grid">
      <div class="stat-chip" data-iw-header="status-card" data-iw-header-stat="gold">💰 1,686,204</div>
      ${chip('🧪 XP +40/task • 18h 56m left')}
      ${chip('ATK 250 • DEF 177 • HP 484')}
      ${atk == null ? '' : chip(atk, 'text-white/55')}
      ${def == null ? '' : chip(def, 'text-white/55')}
      ${chip('<span>⚡ BritishDemon boosted (1/4) · 4d 10h left</span>')}
    </div>
  </div></header>
  <div class="panel flex flex-wrap gap-2 p-2" data-iw-ui="section-frame" data-iw-chrome="nav" id="nav">
    ${tab('Game', true)}${tab('Market')}${tab('Leaderboards')}${tab('Village')}${tab('Guild')}<button class="rounded-xl px-3 py-2 text-xs" data-iw-ui="nav-tab">Dungeon</button>
  </div>
  ${notice === 'emerald' ? '<div id="notice" class="rounded-2xl px-3 py-2 text-sm border border-emerald-400/25 bg-emerald-400/10 text-emerald-100" data-iw-chrome="notice">Sunforged Ore x5</div>'
    : notice ? '<div id="notice" class="rounded-2xl px-3 py-2 text-sm border border-white/10 bg-white/5 text-white/60" data-iw-chrome="notice">Gather Stormsilk in progress.</div>' : ''}
  <div class="panel flex flex-col gap-2 p-3 text-xs sm:flex-row" data-iw-ui="zone-bar" data-iw-chrome="zone-bar">
    <div data-iw-chrome="zone-text"><p><span data-iw-ui="zone-title">🧭 Zone 15: Sunforge Expanse</span></p></div>
    <div class="flex flex-wrap gap-2" data-iw-chrome="zone-actions">
      <button class="button-secondary px-3 py-2 text-xs" data-iw-ui="zone-action" data-iw-zone-action="zones" id="zones"><span aria-hidden="true">🌐</span><span class="ml-1 text-xs">Zones</span></button>
      <button class="button-secondary px-3 py-2 text-xs" data-iw-ui="zone-action" data-iw-zone-action="prev" id="prev">Previous Zone</button>
      <button class="button-secondary px-3 py-2 text-xs" data-iw-ui="zone-action" data-iw-zone-action="next" id="next">Next Zone</button>
    </div>
  </div>
  <div class="panel p-3.5"><h2>Skill Actions</h2><div class="mt-1"><p id="boost" class="text-[10px] uppercase tracking-[0.14em] text-emerald-200/75" data-iw-skill-boost="1">Daily XP Boost: Spellcrafting + Woodcutting + Jewelcrafting +20% XP</p></div></div>
</div>`;

const page = opts => `<!doctype html><html lang="en" data-skin="fantasy" data-iw-page-hydrated="1"><head><meta charset="utf-8">
<link rel="stylesheet" href="/game.css"><link rel="stylesheet" href="/reskin-bc/theme/fantasy.css"></head>
<body><main data-skin="fantasy" style="max-width:1400px;margin:0 auto;padding:12px">${body(opts)}</main></body></html>`;

const browser = await chromium.launch();

async function open(width, opts = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const tab = await context.newPage();
  tab.on('pageerror', err => check('no page error', false, err.message));
  await tab.route('http://iw.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/game.css') return route.fulfill({ contentType: 'text/css', body: await readFile(resolve(FIX, 'game.css')) });
    if (path === '/reskin-bc/theme/fantasy.css') return route.fulfill({ contentType: 'text/css', body: await readFile(resolve(FIX, 'port-fantasy.css')) });
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: page(opts) });
    return route.fulfill({ status: 404, body: '' });
  });
  await tab.goto('http://iw.test/');
  await tab.addScriptTag({ content: fantasyJs });
  return tab;
}
const frames = tab => tab.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const settle = async tab => { await frames(tab); await tab.waitForTimeout(120); await frames(tab); };
const start = async tab => { await tab.evaluate(() => window.Fantasy.start()); await settle(tab); };

const readState = tab => tab.evaluate(() => {
  const cards = [...document.querySelectorAll('#grid > *')];
  const potions = cards.filter(c => c.hasAttribute('data-iw-fantasy-potion'));
  return {
    marks: potions.map(c => ({ role: c.getAttribute('data-iw-fantasy-potion'), text: c.getAttribute('data-iw-fantasy-potion-text'),
      state: c.getAttribute('data-iw-fantasy-potion-state'), own: c.textContent, display: getComputedStyle(c).display })),
    after: (m => m && getComputedStyle(m, '::after').content)(document.querySelector('[data-iw-fantasy-potion="merged"]')),
    ownFont: (m => m && getComputedStyle(m).fontSize)(document.querySelector('[data-iw-fantasy-potion="merged"]')),
    combat: cards.find(c => /ATK 250/.test(c.textContent)).hasAttribute('data-iw-fantasy-potion'),
    zoneX: Object.fromEntries(['zones', 'prev', 'next'].map(id => [id, document.getElementById(id).getBoundingClientRect().x])),
    zoneHidden: ['zones','prev','next'].every(id=>!document.getElementById(id).checkVisibility()),
    notice: (n => n && getComputedStyle(n).display)(document.getElementById('notice')),
    boostH: document.getElementById('boost').getBoundingClientRect().height,
    navPad: parseFloat(getComputedStyle(document.querySelector('[data-iw-ui=nav-tab]')).paddingLeft),
    navOverflow: (n => n.scrollWidth - n.clientWidth)(document.getElementById('nav')),
    tabsClipped: [...document.querySelectorAll('[data-iw-ui=nav-tab]')].filter(t => t.scrollWidth > t.clientWidth + 1).length,
    sheets: document.querySelectorAll('style[data-iw-fantasy-style="chrome"]').length,
  };
});

/* ── 1. desktop, both potions empty ─────────────────────────────────── */
{
  const tab = await open(1400);
  await settle(tab);
  const before = await readState(tab);
  await start(tab);
  const s = await readState(tab);
  check('control: nothing marked before start', before.marks.length === 0 && before.sheets === 0);
  check('the chrome sheet is injected', s.sheets === 1);
  check('ATK chip becomes the merged frame, DEF chip folds', s.marks.length === 2
    && s.marks[0].role === 'merged' && s.marks[1].role === 'folded' && s.marks[1].display === 'none', JSON.stringify(s.marks));
  check('both empty: one-line summary', s.marks[0].text === '⚔️🛡️ No potions active' && s.marks[0].state === 'none', s.marks[0]?.text);
  check('the summary is what paints', s.after === '"⚔️🛡️ No potions active"' && s.ownFont === '0px', `${s.after} / ${s.ownFont}`);
  check('the game text is untouched', s.marks[0].own === '⚔️ No ATK potion active' && s.marks[1].own === '🛡️ No DEF potion active');
  check('the combat line is not a potion', !s.combat);
  check('desktop: travel is removed from the page header', s.zoneHidden);
  check('desktop: the notice stays', s.notice !== 'none');
  check('nav tabs gain padding', s.navPad > before.navPad && s.navPad >= 18, `${before.navPad} -> ${s.navPad}`);
  check('Daily XP Boost line is slimmer', s.boostH < before.boostH, `${before.boostH} -> ${s.boostH}`);

  await tab.evaluate(() => window.Fantasy.stop());
  await settle(tab);
  const left = await tab.evaluate(() => document.querySelectorAll('[data-iw-fantasy-potion],[data-iw-fantasy-potion-text],[data-iw-fantasy-potion-state],style[data-iw-fantasy-style]').length);
  check('stop: no attribute or sheet remains', left === 0, String(left));
  await tab.context().close();
}

/* ── 2. an active potion keeps its detail and updates on a text tick ── */
{
  const tab = await open(1400, { atk: '⚔️ ATK +25 • 42m left' });
  await start(tab);
  const s = await readState(tab);
  check('active ATK: two-line summary with the detail', s.marks[0]?.text === '⚔️ ATK +25 • 42m left\n🛡️ No DEF potion' && s.marks[0]?.state === 'active', s.marks[0]?.text);
  await tab.evaluate(() => { document.querySelector('[data-iw-fantasy-potion="merged"]').firstChild.data = '⚔️ ATK +25 • 41m left'; });
  await settle(tab);
  const t = await readState(tab);
  check('a timer tick re-reads the summary', /41m left/.test(t.marks[0]?.text || ''), t.marks[0]?.text);
  await tab.context().close();
}

/* ── 3. negative control: one potion chip alone is not merged ────────── */
{
  const tab = await open(1400, { def: null });
  await start(tab);
  const s = await readState(tab);
  check('control: a lone ATK chip stays the game\'s', s.marks.length === 0, JSON.stringify(s.marks));
  await tab.context().close();
}

/* ── 4. phone ───────────────────────────────────────────────────────── */
for (const width of [360, 390]) {
  const tab = await open(width);
  await settle(tab);
  const before = await readState(tab);
  await start(tab);
  const s = await readState(tab);
  check(`${width}px control: the port draws Zones first`, before.zoneX.zones < before.zoneX.prev);
  check(`${width}px: travel is removed from the page header`, s.zoneHidden);
  check(`${width}px: the green last-action notice is hidden`, before.notice !== 'none' && s.notice === 'none');
  check(`${width}px: nav tabs fit the row`, s.navOverflow <= 0 && s.tabsClipped === 0, `${s.navOverflow} / ${s.tabsClipped}`);
  check(`${width}px: nav padding grows`, s.navPad > before.navPad, `${before.navPad} -> ${s.navPad}`);
  await tab.context().close();
}
{
  const tab = await open(390, { notice: 'plain' });
  await start(tab);
  const s = await readState(tab);
  check('phone: a non-green notice stays', s.notice !== 'none');
  await tab.context().close();
}

await browser.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nfantasy-chrome: all checks passed');
