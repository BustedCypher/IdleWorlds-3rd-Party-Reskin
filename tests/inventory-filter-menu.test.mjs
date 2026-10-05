/**
 * The inventory's Filter menu is not a row of filter tabs (2026-09-28).
 *
 * The game's Filter menu (the funnel button in the Inventory header) exists in
 * the DOM only while it is open: `div.relative > button[aria-label="Filter
 * inventory"] + div.absolute…` holding a Tier row and a Type row. Both rows
 * start with an "All" button, and the Type row also holds "Consumables" and
 * "Drops". Those are the filter tabs' own labels, and the label regex alone
 * used to take them for tabs. So, while the menu was open:
 *   - "All", "Consumables" and "Drops" in the menu were painted as tab plates
 *     (uppercase, compact layers, the active one in ember) beside the game's
 *     plain pills for every other type;
 *   - the tabs no longer shared ONE parent, so the real tab row lost
 *     `data-iw-inventory-filters`, and below 1280px its one-row sizing went
 *     with it: at 390px "Drops" wrapped onto a second line under the menu,
 *     and it stayed wrapped after the menu closed, until the next inventory
 *     row change swept the panel again.
 * The tab row is now the parent holding the most distinct tab labels, and a
 * tab-labelled button anywhere else gets no filter role.
 *
 * REAL BROWSER (Playwright): the wrap is layout. The game's flex rows are
 * modelled with inline styles, as in menu-rows.test.mjs.
 *
 * Negative control, verified by restoring the old rule (every tab-labelled
 * button is a filter; the row is marked only when all of them share one
 * parent): 13 checks fail, the menu, row and one-line checks in every case
 * and "closed again" after the menu has gone.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const row = gap => `display:flex;flex-wrap:wrap;align-items:center;gap:${gap}px`;
const pill = (label, on = false) => `<button class="rounded-xl border px-2 py-0.5 text-[10px] ${on
  ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-white/5 text-white/55 hover:bg-white/10'}">${label}</button>`;
/* The menu as the game's bundle renders it (tmp/iw-9075.js, 2026-09-21). */
const MENU = `<div id="menu" class="absolute right-0 top-full z-30 mt-1 w-56 rounded-2xl border border-white/15 bg-ink p-3 shadow-xl" style="position:absolute;right:0;top:100%;z-index:30;width:224px">
  <p class="mb-1.5 text-[10px] uppercase tracking-[0.15em] text-white/35">Tier</p>
  <div class="mb-3 flex flex-wrap gap-1" style="${row(4)}">${pill('All', true)}${[1, 2, 3].map(n => pill(n)).join('')}</div>
  <p class="mb-1.5 text-[10px] uppercase tracking-[0.15em] text-white/35">Type</p>
  <div class="flex flex-wrap gap-1" style="${row(4)}">${pill('All', true)}${['Amulets', 'Bars', 'Consumables', 'Drops', 'Gems'].map(t => pill(t)).join('')}</div>
</div>`;
const page = ({ menuOpen }) => `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button,a{font:inherit;color:inherit;background:none}body{margin:0}</style></head><body>
<div id="root" data-skin="default"><div id="shell" style="display:flex;flex-direction:column;gap:12px;padding:12px 8px">
  <header class="panel"><div><h1>BustedCypher</h1><p>Combat Lv 62</p></div><div><button>1</button></div></header>
  <section aria-label="Inventory" id="inventory" class="panel">
    <div style="${row(8)};justify-content:space-between"><div><h2>Inventory</h2></div>
      <div style="${row(8)}"><div id="menu-host" class="relative" style="position:relative"><button aria-label="Filter inventory"><svg width="16" height="16"></svg></button>${menuOpen ? MENU : ''}</div>
        <button aria-label="Search inventory"><svg width="16" height="16"></svg></button></div></div>
    <div id="filters" style="${row(6)}"><button class="bg-amber-400/10">All</button><button>Gear</button><button>Materials</button><button>Consumables</button><button>Drops</button></div>
    <div class="space-y-1.5"><div class="compact-row"><div><span>Iron Sword</span></div><div><span>Tier 4 &middot; Weapon</span></div><div><span>x1</span></div><button>Equip</button></div></div>
  </section>
</div></div>
<script>${bundle}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const errors = [];

async function open(width, menuOpen) {
  const tab = await browser.newPage({ viewport: { width, height: 900 } });
  tab.on('pageerror', e => errors.push(String(e)));
  const html = page({ menuOpen });
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await tab.waitForFunction(() => document.querySelector('[data-iw-inventory-root] [data-iw-inventory-control="filter"]'), null, { timeout: 20000 });
  await tab.evaluate(() => document.fonts.ready);
  await passes(tab);
  return tab;
}

/* Let the passes that follow a mutation land (the compact art, the overlay framer). */
const passes = tab => tab.evaluate(async () => { for (let i = 0; i < 3; i += 1) {
  const s = document.createElement('span'); document.body.append(s);
  await new Promise(r => setTimeout(r, 120)); s.remove(); } });

const MEASURE = () => {
  const menu = document.getElementById('menu');
  const tabs = [...document.querySelectorAll('#filters > button')];
  const tops = new Set(tabs.map(b => Math.round(b.getBoundingClientRect().top)));
  return {
    menuMarked: menu ? [...menu.querySelectorAll('button')].filter(b =>
      [...b.attributes].some(a => /^data-iw-(inventory|compact)-/.test(a.name))).map(b => b.textContent.trim()) : null,
    menuLayers: menu ? menu.querySelectorAll('[data-iw-compact-layer]').length : null,
    tabRoles: tabs.map(b => b.getAttribute('data-iw-inventory-control')),
    active: tabs.filter(b => b.getAttribute('data-iw-inventory-filter-state') === 'active').map(b => b.textContent.trim()),
    rowMarked: document.getElementById('filters').getAttribute('data-iw-inventory-filters') === '1',
    rowsMarked: document.querySelectorAll('[data-iw-inventory-filters]').length,
    lines: tops.size,
  };
};

const expectClean = (m, where) => {
  check(`${where}: no menu button carries an inventory or compact mark`, m.menuMarked?.length === 0 && m.menuLayers === 0,
    `marked ${JSON.stringify(m.menuMarked)}, ${m.menuLayers} layers`);
  check(`${where}: the five tabs are still filters`, m.tabRoles.every(r => r === 'filter'), JSON.stringify(m.tabRoles));
  check(`${where}: only the real tab is active`, JSON.stringify(m.active) === '["All"]', JSON.stringify(m.active));
  check(`${where}: the tab row keeps data-iw-inventory-filters, and it is the only one`, m.rowMarked && m.rowsMarked === 1,
    `row ${m.rowMarked}, ${m.rowsMarked} marked`);
};

for (const width of [390, 1100, 1440]) {
  console.log(`\nMenu open at boot, ${width}px`);
  const tab = await open(width, true);
  const m = await tab.evaluate(MEASURE);
  expectClean(m, `${width}px`);
  if (width < 1280) check(`${width}px: the tab row stays one line`, m.lines === 1, `${m.lines} lines`);
  await tab.close();
}

console.log('\nMenu opened, closed and reopened after boot, 390px');
{
  const tab = await open(390, false);
  const before = await tab.evaluate(MEASURE);
  check('closed: the tab row is marked and one line', before.rowMarked && before.lines === 1, JSON.stringify(before));
  // Open it the way React does: the menu is inserted into the live page. The
  // panel sweep runs on an inventory row's slow path, so a row that changes
  // while the menu is open (a gathered item, every few ticks live) is what
  // brings the menu under it; the same frame here.
  let n = 0;
  const openMenu = () => tab.evaluate(([menu, name]) => {
    document.getElementById('menu-host').insertAdjacentHTML('beforeend', menu);
    document.querySelector('.compact-row span').textContent = name;
  }, [MENU, `Iron Sword ${++n}`]);
  await openMenu();
  await passes(tab);
  const opened = await tab.evaluate(MEASURE);
  expectClean(opened, 'opened');
  check('opened: the tab row stays one line', opened.lines === 1, `${opened.lines} lines`);
  await tab.evaluate(() => document.getElementById('menu').remove());
  await passes(tab);
  const closed = await tab.evaluate(MEASURE);
  check('closed again: the tab row is marked and one line', closed.rowMarked && closed.rowsMarked === 1 && closed.lines === 1, JSON.stringify(closed));
  await openMenu();
  await passes(tab);
  expectClean(await tab.evaluate(MEASURE), 'reopened');
  await tab.close();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
if (failures) { console.log(`\nFAIL inventory-filter-menu - ${failures} check(s) failed`); process.exit(1); }
console.log('\nPASS inventory-filter-menu');
