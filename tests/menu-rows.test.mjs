/**
 * Menu rows on phones and tablets (Curtis, 2026-09-15).
 *
 *   1. The nav rail and the inventory filter tabs are ONE row below `xl`: the
 *      tabs never wrap, their type scales with the row instead (a size
 *      container plus measured per-label widths - see the comments in
 *      ui-system.css and inventory.css).
 *   2. On a phone there is no Toolkit link at all (Curtis, 2026-09-16: "the nav
 *      bar looks too crowded"), so the rail is the five route tabs and the
 *      three zone controls share their whole row. From 768px the link is back
 *      in the rail.
 *
 * REAL BROWSER (Playwright): wrapping, clipping and which copy is shown are all
 * layout. The game's own flex rows are modelled with inline styles (the live
 * page gets them from Tailwind: gap-2 on the rail and the zone actions,
 * gap-1.5 on the filters), because a fixture whose rows are not really flex
 * would pass every check here for the wrong reason.
 *
 * Negative controls, each verified by reverting one line of source:
 *   - drop `flex-wrap: nowrap` from the rail rule and the rail wraps at 320px,
 *     the one width where the fitted type alone does not hold it;
 *   - drop the ten 1px plate borders from the filter formula and "Consumables"
 *     clips inside its plate at 320px;
 *   - drop the phone `display: none` on the link and it is back in the rail on
 *     a phone, where the five-tab formula then clips every label.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const ROUTES = ['Game', 'Market', 'Leaderboards', 'Village', 'Dungeon'];
const row = gap => `display:flex;flex-wrap:wrap;align-items:center;gap:${gap}px`;
/* data-iw-page-hydrated: the latch src/page/hydration-signal.js sets on the live page once React
   has hydrated. Without it HydrationGate holds the first boot for its full timeout. */
const page = ({ zoneBar }) => `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button,a{font:inherit;color:inherit;background:none}body{margin:0}</style></head><body>
<div id="root" data-skin="default"><div id="shell" style="display:flex;flex-direction:column;gap:12px;padding:12px 8px">
  <header class="panel"><div><h1>BustedCypher</h1><p>Combat Lv 62</p></div><div><button>1</button></div></header>
  <div class="panel" id="rail" style="${row(8)}">${ROUTES.map(r => `<button>${r}</button>`).join('')}</div>
  ${zoneBar ? `<div class="panel" id="zone-bar-panel" style="display:flex;flex-direction:column;gap:8px">
    <div><p>&#129517; Zone 19: Eternium Verge<button>who's here?</button></p><p>Next zone target: ATK 287 / DEF 291</p></div>
    <div id="zone-actions" style="${row(8)}"><button>&#127760; Zones</button><button>Previous Zone</button><button>Next Zone</button></div>
  </div>` : ''}
  <section aria-label="Inventory" id="inventory" class="panel">
    <div style="${row(8)};justify-content:space-between"><div><h2>Inventory</h2></div>
      <div style="${row(8)}"><button aria-label="Filter inventory"><svg width="16" height="16"></svg></button><button aria-label="Search inventory"><svg width="16" height="16"></svg></button></div></div>
    <div id="filters" style="${row(6)}"><button>All</button><button>Gear</button><button>Materials</button><button>Consumables</button><button>Drops</button></div>
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

async function open(width, zoneBar, pathname = '/') {
  const tab = await browser.newPage({ viewport: { width, height: 900 } });
  tab.on('pageerror', e => errors.push(String(e)));
  const html = page({ zoneBar });
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === pathname) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(`${ORIGIN}${pathname}`, { waitUntil: 'load' });
  await tab.waitForFunction(() => document.querySelector('[data-iw-nav-link="toolkit"]') &&
    document.querySelector('[data-iw-inventory-filters]'), null, { timeout: 20000 });
  await tab.evaluate(() => document.fonts.ready);
  // Let the pass that follows the roles (compact art, the rail flag) land.
  await tab.evaluate(async () => { for (let i = 0; i < 3; i += 1) {
    const s = document.createElement('span'); document.body.append(s);
    await new Promise(r => setTimeout(r, 120)); s.remove(); } });
  return tab;
}

const MEASURE = () => {
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const textBox = el => { let l = Infinity, r = -Infinity;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) { if (!t.nodeValue.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      for (const x of range.getClientRects()) if (x.width > 0) { l = Math.min(l, x.left); r = Math.max(r, x.right); } }
    return { l, r }; };
  const rowCount = boxes => { const lines = [];
    for (const b of boxes) { const line = lines.find(l => b.top < l.bottom - 0.5 && b.bottom > l.top + 0.5);
      if (line) { line.top = Math.min(line.top, b.top); line.bottom = Math.max(line.bottom, b.bottom); } else lines.push({ top: b.top, bottom: b.bottom }); }
    return lines.length; };
  const rowOf = items => {
    items = items.filter(shown);
    const clipped = items.filter(el => { const b = el.getBoundingClientRect(), s = getComputedStyle(el), t = textBox(el);
      return t.l < b.left + parseFloat(s.paddingLeft) - 1.5 || t.r > b.right - parseFloat(s.paddingRight) + 1.5; });
    const parent = items[0]?.parentElement.getBoundingClientRect();
    return { n: items.length, rows: rowCount(items.map(el => el.getBoundingClientRect())),
      clipped: clipped.map(el => el.textContent.trim()), inside: items.every(el => el.getBoundingClientRect().right <= parent.right + 0.5),
      font: items[0] && getComputedStyle(items[0]).fontSize };
  };
  const rail = document.querySelector('[data-iw-nav-link="toolkit"]');
  /* The zone controls, once the Toolkit link is out of their row: three equal
     buttons sharing the row's whole width. */
  const actions = [...document.querySelectorAll('[data-iw-ui="zone-action"]')].filter(shown);
  let zoneRow = null;
  if (actions.length) {
    const boxes = actions.map(el => el.getBoundingClientRect());
    const parent = actions[0].parentElement.getBoundingClientRect();
    zoneRow = {
      n: actions.length,
      rows: rowCount(boxes),
      widths: boxes.map(b => Math.round(b.width)),
      spread: +(Math.max(...boxes.map(b => b.width)) - Math.min(...boxes.map(b => b.width))).toFixed(1),
      leftGap: +(boxes[0].left - parent.left).toFixed(1),
      rightGap: +(parent.right - boxes[boxes.length - 1].right).toFixed(1),
    };
  }
  return {
    nav: rowOf([...document.querySelectorAll('[data-iw-ui="nav-tab"]')]),
    filters: rowOf([...document.querySelectorAll('[data-iw-inventory-control="filter"]')]),
    railShown: shown(rail), railExists: !!rail, zoneRow,
  };
};

for (const width of [320, 360, 390, 430, 767, 768, 900, 1100]) {
  const tab = await open(width, true);
  const m = await tab.evaluate(MEASURE);
  console.log(`\nGame route, ${width}px`);
  check(`${width}: the nav rail is one row`, m.nav.n >= 5 && m.nav.rows === 1 && m.nav.inside, JSON.stringify(m.nav));
  check(`${width}: no nav label is clipped`, m.nav.clipped.length === 0, m.nav.clipped.join(', '));
  check(`${width}: the filter tabs are one row`, m.filters.n === 5 && m.filters.rows === 1 && m.filters.inside, JSON.stringify(m.filters));
  check(`${width}: no filter label is clipped`, m.filters.clipped.length === 0, m.filters.clipped.join(', '));
  if (width <= 767) {
    check(`${width}: no Toolkit link on a phone`, m.railExists && !m.railShown, `exists=${m.railExists} shown=${m.railShown}`);
    check(`${width}: the three zone controls are one row of equal buttons`,
      m.zoneRow?.n === 3 && m.zoneRow.rows === 1 && m.zoneRow.spread <= 1, JSON.stringify(m.zoneRow));
    check(`${width}: the zone controls span the whole row`,
      !!m.zoneRow && m.zoneRow.leftGap <= 1 && m.zoneRow.rightGap <= 1, JSON.stringify(m.zoneRow));
  } else {
    check(`${width}: Toolkit shows in the rail`, m.railShown, `rail=${m.railShown}`);
  }
  await tab.close();
}

/* A route without a zone bar (Market, Village, ...): the phone hides the
   Toolkit link there too, so the rail is the same five unclipped tabs. */
for (const width of [360, 390]) {
  const tab = await open(width, false);
  const m = await tab.evaluate(MEASURE);
  console.log(`\nNo zone bar, ${width}px`);
  check(`${width} no zone bar: still no Toolkit link on a phone`, m.railExists && !m.railShown, `exists=${m.railExists} shown=${m.railShown}`);
  check(`${width} no zone bar: the five-tab rail is one unclipped row`, m.nav.n === 5 && m.nav.rows === 1 && m.nav.inside && m.nav.clipped.length === 0, JSON.stringify(m.nav));
  await tab.close();
}

/* Cold-load regression: Dungeon can be the FIRST route, before Game has
   mounted a Zone N label. The skin must not invent a zone theme, but it still
   needs a deterministic visual atlas so the top menu never falls back to the
   legacy button presentation. */
{
  const tab = await open(900, false, '/dungeon');
  const cold = await tab.evaluate(() => {
    const dungeon = [...document.querySelectorAll('[data-iw-ui="nav-tab"]')]
      .find(el => (el.dataset.iwTab || '').toLowerCase() === 'dungeon');
    const idle = dungeon?.querySelector('[data-iw-compact-layer="idle"]');
    const html = document.documentElement;
    return {
      zoneTheme: html.dataset.iwZoneTheme || '',
      zoneAtlas: html.style.getPropertyValue('--iw-zone-atlas'),
      compactAtlas: html.dataset.iwCompactAtlas || '',
      compactAtlasUrl: html.style.getPropertyValue('--iw-compact-atlas'),
      dungeonState: dungeon?.dataset.iwState || '',
      dungeonCompact: dungeon?.dataset.iwCompactButton || '',
      dungeonIdleImage: idle ? getComputedStyle(idle).backgroundImage : '',
      toolkitCount: document.querySelectorAll('[data-iw-nav-link="toolkit"]').length,
    };
  });
  console.log('\nCold /dungeon, 900px');
  check('cold Dungeon does not fabricate a zone palette',
    cold.zoneTheme === 'default' && !cold.zoneAtlas,
    JSON.stringify(cold));
  check('cold Dungeon receives the forged-metal compact visual fallback',
    cold.compactAtlas === 'compact-ghost-v3' &&
    /compact-ghost-v3\/forged-metal\.png/.test(cold.compactAtlasUrl),
    JSON.stringify(cold));
  check('cold Dungeon marks Dungeon active and paints compact art',
    cold.dungeonState === 'active' && cold.dungeonCompact === 'text' &&
    /forged-metal\.png/.test(cold.dungeonIdleImage),
    JSON.stringify(cold));
  check('cold Dungeon still appends exactly one Toolkit link',
    cold.toolkitCount === 1, `toolkit=${cold.toolkitCount}`);
  await tab.close();
}

await browser.close();
check('no page errors', errors.length === 0, errors.join(' | '));
if (failures) { console.log(`\nFAIL menu-rows - ${failures} check(s) failed`); process.exit(1); }
console.log('\nPASS menu-rows');
