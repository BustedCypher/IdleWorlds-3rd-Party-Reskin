/**
 * Compact header chrome: nav rail, announcement, zone bar (2026-09).
 *
 * These three frames used to cost ~240px of mostly padding for one row of
 * 32px tabs, a one-line message and a title/target/buttons row. CLAUDE.md
 * documents why a fixture that hand-tags roles rather than running them
 * through the real classifiers cannot see a regression here — the nav rail's
 * `.panel` gets re-tagged `section-frame` by `classifySectionFrames` AFTER
 * `classifyMainNav` runs, so the compaction has to survive the real boot
 * order, not a shortcut DOM. REAL BROWSER (Playwright), not jsdom: every
 * check below is a `getBoundingClientRect()` read, which jsdom answers with
 * zeros.
 *
 * Negative controls, each verified by reverting the source:
 *   - drop the `--iw-frame-pad-y/-x` re-point on the nav's frame and the rail
 *     reads ~120px (the shared panel's 26px top+bottom padding);
 *   - drop the `:not(:has([data-iw-ui="nav-tab"]))` opt-out from the shared
 *     corner rule and the rail draws the shared 34x32 flourish again;
 *   - drop `margin: 0` on the zone title/target lines and the zone bar reads
 *     ~55-70px instead of ~42px (a flex item's UA <p> margin does not
 *     collapse against its siblings);
 *   - make mainNavResolutionValid demand `main-nav` again and the flat shape
 *     reports a whole-document nav sweep on every flush (and, without the
 *     guard below, ~20 role flips as the two classifiers overwrite each other);
 *   - drop setNavRole's section-frame guard and a late tab's re-resolve
 *     writes `main-nav` over the frame (flips on resolve > 0);
 *   - key the rail CSS on `main-nav` again and the flat shape reads 26px
 *     padding and a 34px corner (the reported "nothing changed");
 *   - drop `box-sizing: border-box` on the announcement strip and it reads
 *     ~46px against its own `min-height: 32px`.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

// The zone bar / announcement follow tests/smoke.test.mjs; the nav rail is
// rendered in both shapes below.
const NAV_SHAPES = {
  // The LIVE shape (captured 2026-09): tabs directly inside the .panel, so
  // the track and the frame are one node. The first version of this test only
  // had the wrapped shape and passed while the live page did not change.
  // The game lays the tabs out itself (a wrapping row, ~12px gap measured off
  // the live screenshot); the skin adds no layout here, so the fixture must.
  flat: '<div class="panel flex flex-wrap items-center gap-3" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px"><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button></div>',
  wrapped: '<div class="panel"><nav><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button></nav></div>',
};
/* data-iw-page-hydrated: the latch src/page/hydration-signal.js sets on the live page once React
   has hydrated. Without it HydrationGate holds the first boot for its full timeout. */
const page_for = nav => `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title></head><body>
<div id="root" data-skin="default">
  <header id="top-header">
    <div id="profile-block"><h1>BustedCypher</h1><p>Gemcutter Supreme</p><p>⚔ Combat Lv 62 · Zone 19: Eternium Verge</p><p>● Players online: 141</p></div>
    <div id="utility-block"><button>☆</button><button>✉</button><button>+</button><button>🏆</button><button>1</button><button>⚙</button></div>
    <div id="status-grid"><div>💰 515,686</div><div>🧪 XP +36/task</div><div>⚔ ATK 292 · DEF 252 · HP 477</div></div>
  </header>
  ${nav}
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
  <div class="panel"><h2>Skill Actions</h2><div class="compact-panel"><p>Mine Copper Ore</p><button>Mine</button></div></div>
</div>
<script>${bundle}</` + `script></body></html>`;

let PAGE = '';
const PAGE_URL = 'http://iw.test/header-compact.html';
const MIME = {
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

async function serve(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://iw.test') return route.abort();
    if (url.pathname === '/header-compact.html') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
    }
    try {
      const body = await readFile(resolve(ROOT, url.pathname.replace(/^\/+/, '')));
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      return route.fulfill({ contentType: MIME[ext] || 'application/octet-stream', body });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
}

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
for (const [shape, nav] of Object.entries(NAV_SHAPES)) {
  PAGE = page_for(nav);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => errs.push(String(e)));
  await serve(page);
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById('zone-bar-panel')?.dataset.iwUi === 'zone-bar' &&
      document.querySelector('[data-iw-ui="nav-tab"]'), null, { timeout: 20000 });
  await page.waitForFunction(
    () => document.getElementById('announcement')?.getAttribute('data-iw-header') === 'announcement',
    null, { timeout: shape === 'wrapped' ? 8000 : 1500 }).catch(() => {});

  const g = await page.evaluate(async () => {
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1) }; };
    // Find the rail by its TABS: on the live (flat) shape nothing is `main-nav`.
    const tab = document.querySelector('[data-iw-ui="nav-tab"]');
    const navFrame = tab?.closest('.panel');
    // Two classifiers writing one attribute on this node is the failure the
    // flat shape exposed. Count writes while real mutations drive flushes.
    let flips = 0;
    // resolveMainNav's whole-document sweep. A cache that never validates can
    // hide behind the guard (no role write, so no flip) and still pay this on
    // every flush, so count the sweep itself.
    let navSweeps = 0;
    const qsa = Document.prototype.querySelectorAll;
    Document.prototype.querySelectorAll = function (sel) {
      if (this === document && sel === 'button, a, [role="tab"]') navSweeps += 1;
      return qsa.call(this, sel);
    };
    const mo = new MutationObserver(recs => { flips += recs.length; });
    mo.observe(navFrame, { attributes: true, attributeFilter: ['data-iw-ui'] });
    for (let i = 0; i < 8; i += 1) {
      const s = document.createElement('span'); document.body.append(s);
      await new Promise(r => setTimeout(r, 120)); s.remove();
    }
    const steadyFlips = flips;
    const steadySweeps = navSweeps;
    Document.prototype.querySelectorAll = qsa;
    // A tab that mounts late (Dungeon unlocking) makes the nav re-resolve,
    // which is the path where it would write `main-nav` over the frame.
    const extra = document.createElement('button');
    extra.textContent = 'Dungeon';
    (navFrame.querySelector('nav') || navFrame).insertBefore(extra, (navFrame.querySelector('nav') || navFrame).children[4] || null);
    for (let i = 0; i < 8; i += 1) {
      const s = document.createElement('span'); document.body.append(s);
      await new Promise(r => setTimeout(r, 120)); s.remove();
    }
    mo.disconnect();
    const lateTabClassified = extra.dataset.iwUi === 'nav-tab';
    const navAfter = navFrame ? getComputedStyle(navFrame, '::after') : null;
    const zoneTitle = document.getElementById('zone-label');

    const shell = document.querySelector('[data-iw-chrome="shell"]');
    const chromeNav = document.querySelector('[data-iw-chrome="nav"]');
    const zoneText = document.querySelector('[data-iw-chrome="zone-text"]');
    const zoneActions = document.querySelector('[data-iw-chrome="zone-actions"]');
    const notice = document.querySelector('[data-iw-chrome="notice"]');
    const shellFrame = shell && getComputedStyle(shell, '::before');
    const tabBoxes = [...document.querySelectorAll('[data-iw-ui="nav-tab"]')].map(box);
    const actionBoxes = [...document.querySelectorAll('[data-iw-ui="zone-action"]')].map(box);
    const overlaps = (a, b) => !(a.left + a.w <= b.left || b.left + b.w <= a.left ||
      a.top + a.h <= b.top || b.top + b.h <= a.top);
    const boxWithLeft = el => { if (!el) return null; const r = el.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1), left: +r.left.toFixed(1) }; };
    const tabRects = [...document.querySelectorAll('[data-iw-ui="nav-tab"]')].map(boxWithLeft);
    const actionRects = [...document.querySelectorAll('[data-iw-ui="zone-action"]')].map(boxWithLeft);
    let rowOverlap = false;
    for (const t of tabRects) for (const a of actionRects) if (overlaps(t, a)) rowOverlap = true;

    return {
      navRole: navFrame?.dataset.iwUi,
      navFlips: steadyFlips,
      navSweeps: steadySweeps,
      navFlipsOnResolve: flips - steadyFlips,
      lateTabClassified,
      navFrame: box(navFrame),
      navCorner: navAfter && { width: navAfter.borderTopWidth, image: navAfter.borderImageSource !== 'none' },
      announcementClassified: document.getElementById('announcement')?.getAttribute('data-iw-header') === 'announcement',
      announcement: box(document.getElementById('announcement')),
      zoneBar: box(document.getElementById('zone-bar-panel')),
      zoneTitleTop: box(zoneTitle)?.top,
      zoneTargetTop: box(zoneTitle?.nextElementSibling)?.top,
      zoneActionHeights: [...document.querySelectorAll('[data-iw-ui="zone-action"]')].map(b => box(b).h),

      // Curtis (2026-09): the title's leading emoji starts on the first tab's
      // left edge. The emoji is the first glyph, so the text's first client
      // rect is where it starts.
      titleInk: (() => { const rg = document.createRange(); rg.selectNodeContents(zoneTitle);
        return +rg.getClientRects()[0].left.toFixed(1); })(),
      firstTab: +document.querySelector('[data-iw-ui="nav-tab"]').getBoundingClientRect().left.toFixed(1),
      whosHere: (() => { const b = document.getElementById('zone-whos-here'); const cs = getComputedStyle(b);
        return { link: b.dataset.iwZoneLink, bg: cs.backgroundColor, img: cs.backgroundImage,
          shadow: cs.boxShadow, border: cs.borderTopWidth, pad: cs.paddingLeft }; })(),
      chromeTagged: !!(shell && chromeNav && zoneText && zoneActions),
      chromeFrame: shellFrame && { border: shellFrame.borderTopWidth, style: shellFrame.borderTopStyle },
      navOwnFrame: navFrame ? getComputedStyle(navFrame).borderTopWidth : null,
      noticeTagged: !!notice,
      rowATop: Math.abs((box(zoneText)?.top ?? 0) - (box(notice)?.top ?? box(zoneText)?.top ?? 0)),
      rowBCenter: Math.abs(
        ((box(chromeNav)?.top ?? 0) + (box(chromeNav)?.h ?? 0) / 2) -
        ((box(zoneActions)?.top ?? 0) + (box(zoneActions)?.h ?? 0) / 2)),
      rowAAboveRowB: (box(zoneText)?.top ?? 0) < (box(chromeNav)?.top ?? Infinity),
      rowOverlap,
      chromeFrameHeight: shell && chromeNav && zoneText
        ? Math.round((box(chromeNav).top + box(chromeNav).h) - box(zoneText).top)
        : null,
    };
  });

  console.log(`\nNav shape: ${shape}`);
  check(`${shape}: the nav rail's panel wears the section frame`,
    g.navRole === 'section-frame', `role=${g.navRole}`);
  check(`${shape}: nothing fights over the rail's role attribute`,
    g.navFlips === 0, `flips=${g.navFlips}`);
  check(`${shape}: a settled nav does not re-resolve on every flush`,
    g.navSweeps === 0, `whole-document nav sweeps over 8 flushes: ${g.navSweeps}`);
  check(`${shape}: a tab that mounts late is classified`, g.lateTabClassified);
  check(`${shape}: re-resolving the nav does not strip the rail's frame role`,
    g.navFlipsOnResolve === 0, `flips=${g.navFlipsOnResolve}`);
  check(`${shape}: the nav rail is compact`, g.navFrame && g.navFrame.h <= 56, `h=${g.navFrame?.h}`);
  check(`${shape}: the nav rail draws no corner flourish`,
    g.navCorner && !g.navCorner.image, `border-image present, width=${g.navCorner?.width}`);
  // HeaderRenderer finds the announcement from a `main-nav` element, which the
  // flat shape does not have -- the same as the live page, so only the
  // wrapped shape can exercise its metrics.
  if (g.announcementClassified) {
    check(`${shape}: the announcement strip is compact`, g.announcement.h <= 40, `h=${g.announcement.h}`);
  }
  check(`${shape}: the zone bar is compact`, g.zoneBar && g.zoneBar.h <= 50, `h=${g.zoneBar?.h}`);
  check(`${shape}: the zone title and target share one row`,
    g.zoneTitleTop != null && Math.abs(g.zoneTitleTop - g.zoneTargetTop) <= 8,
    `title=${g.zoneTitleTop} target=${g.zoneTargetTop}`);
  check(`${shape}: every zone action button is the same compact height`,
    g.zoneActionHeights.length === 3 && g.zoneActionHeights.every(h => Math.abs(h - g.zoneActionHeights[0]) <= 0.6),
    JSON.stringify(g.zoneActionHeights));

  // Merged chrome (Curtis, 2026-09): nav + announcement + zone bar as one frame.
  check(`${shape}: the shell/nav/zone-text/zone-actions are all tagged`, g.chromeTagged);
  check(`${shape}: the merged frame paints a border`,
    g.chromeFrame && parseFloat(g.chromeFrame.border) > 0 && g.chromeFrame.style !== 'none',
    JSON.stringify(g.chromeFrame));
  check(`${shape}: the nav rail draws no border of its own inside the merged frame`,
    g.navOwnFrame === '0px', `border=${g.navOwnFrame}`);
  check(`${shape}: the zone title/target and the notice share row A`,
    !g.noticeTagged || g.rowATop <= 8, `delta=${g.rowATop}`);
  check(`${shape}: the nav tabs and the zone actions share row B`,
    g.rowBCenter <= 3, `delta=${g.rowBCenter}`);
  check(`${shape}: row A sits above row B`, g.rowAAboveRowB);
  check(`${shape}: nothing in row B overlaps`, !g.rowOverlap);
  check(`${shape}: the zone title's emoji starts on the first nav tab's left edge`,
    Math.abs(g.titleInk - g.firstTab) <= 1, `emoji=${g.titleInk} tab=${g.firstTab}`);
  check(`${shape}: "who's here?" is a plain link, not a plated button`,
    g.whosHere.link === '1' && g.whosHere.bg === 'rgba(0, 0, 0, 0)' && g.whosHere.img === 'none' &&
    g.whosHere.shadow === 'none' && g.whosHere.border === '0px' && g.whosHere.pad === '0px',
    JSON.stringify(g.whosHere));
  check(`${shape}: the merged frame is compact`,
    g.chromeFrameHeight != null && g.chromeFrameHeight <= 90, `h=${g.chromeFrameHeight}`);

  await page.close();
}

// Two more shapes on the live (flat) nav: a narrow viewport, where the merged
// frame stacks into one column, and a zone bar with a child the recipe cannot
// place, where HeaderChrome must REFUSE and leave today's separate boxes.
async function loadFlat(width, mutate = '') {
  PAGE = page_for(NAV_SHAPES.flat).replace('<script>', `<script>${mutate}</` + `script><script>`);
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', e => errs.push(String(e)));
  await serve(page);
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById('zone-bar-panel')?.dataset.iwUi === 'zone-bar' &&
      document.querySelector('[data-iw-ui="nav-tab"]'), null, { timeout: 20000 });
  // Let the classify pass that follows the roles land.
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i += 1) {
      const s = document.createElement('span'); document.body.append(s);
      await new Promise(r => setTimeout(r, 120)); s.remove();
    }
  });
  return page;
}

for (const width of [800, 400]) {
  const page = await loadFlat(width);
  const n = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    const pick = role => document.querySelector(`[data-iw-chrome="${role}"]`);
    const parts = ['zone-text', 'notice', 'nav', 'zone-actions'].map(role => pick(role) && r(pick(role)));
    const tabs = [...document.querySelectorAll('[data-iw-ui="nav-tab"]')].filter(el => el.getBoundingClientRect().width > 0).map(r);
    const rows = [...new Set(tabs.map(t => Math.round(t.top)))].map(top => {
      const row = tabs.filter(t => Math.round(t.top) === top);
      return { left: Math.min(...row.map(t => t.left)), right: Math.max(...row.map(t => t.right)), n: row.length };
    });
    return { tagged: parts.every(Boolean), parts, rows };
  });
  console.log(`\nNarrow (${width}px)`);
  check(`narrow ${width}: every chrome part is tagged`, n.tagged);
  const stacked = n.tagged && n.parts.every((p, i) => i === 0 || p.top >= n.parts[i - 1].bottom - 0.5);
  check(`narrow ${width}: title, notice, nav and actions stack in that order without overlapping`, stacked,
    JSON.stringify(n.parts.map(p => p && [Math.round(p.top), Math.round(p.bottom)])));
  /* Stacked, every row spans the frame's inner width (mobile audit, 2026-09),
     measured against the nav row, which stretches by default. Controls: put
     `justify-self: start` back on the notice and it ends ~65px short; drop the
     (0,2,0) `!important` margin on the action row and header.css's
     `margin-left: auto` right-aligns it at its content width again. */
  if (n.tagged) {
    const [, notice, nav, actions] = n.parts;
    const spans = p => Math.abs(p.left - nav.left) <= 1 && Math.abs(p.right - nav.right) <= 1;
    check(`narrow ${width}: the notice spans the frame's inner width`, spans(notice),
      `notice ${Math.round(notice.left)}..${Math.round(notice.right)} nav ${Math.round(nav.left)}..${Math.round(nav.right)}`);
    check(`narrow ${width}: the zone action row spans the frame's inner width`, spans(actions),
      `actions ${Math.round(actions.left)}..${Math.round(actions.right)} nav ${Math.round(nav.left)}..${Math.round(nav.right)}`);
    /* The rail is ONE row on phones and tablets (Curtis, 2026-09-15; the width
       sweep and its controls live in tests/menu-rows.test.mjs). On a phone the
       route tabs also grow, so that one row is flush at both ends; at 800px
       they keep their content widths and start at the left, as on desktop. */
    check(`narrow ${width}: the nav is one row`, n.rows.length === 1, n.rows.map(row => `${row.n} tabs`).join(' | '));
    if (width <= 767) {
      check(`narrow ${width}: the nav row is flush at both ends`,
        n.rows.length === 1 && Math.abs(n.rows[0].left - nav.left) <= 1 && Math.abs(n.rows[0].right - nav.right) <= 1,
        n.rows.map(row => `${row.n} tabs ${Math.round(row.left)}..${Math.round(row.right)}`).join(' | ') + ` nav ${Math.round(nav.left)}..${Math.round(nav.right)}`);
    }
  }
  await page.close();
}

{
  // A third branch in the zone bar is a shape the grid has no cell for.
  // Inline, before the bundle: the zone bar is already parsed at that point.
  const page = await loadFlat(1400, `{
    const extra = document.createElement('div'); extra.id = 'zone-extra'; extra.textContent = 'Zone event: double drops';
    document.getElementById('zone-bar-panel').append(extra);
  }`);
  const f = await page.evaluate(() => ({
    marks: document.querySelectorAll('[data-iw-chrome]').length,
    zoneH: document.getElementById('zone-bar-panel').getBoundingClientRect().height,
    extraH: document.getElementById('zone-extra').getBoundingClientRect().height,
  }));
  console.log('\nRefusal (unexpected zone bar child)');
  check('refusal: an unplaceable zone bar child leaves the chrome unmerged', f.marks === 0, `marks=${f.marks}`);
  check('refusal: the zone bar keeps its own box (not display: contents)', f.zoneH > 0 && f.extraH > 0,
    `zone=${f.zoneH} extra=${f.extraH}`);
  await page.close();
}

{
  // The notice is conditional: the frame must follow it appearing and leaving.
  const page = await loadFlat(1400);
  const t = await page.evaluate(async () => {
    const tick = async () => { for (let i = 0; i < 3; i += 1) {
      const s = document.createElement('span'); document.body.append(s);
      await new Promise(r => setTimeout(r, 120)); s.remove(); } };
    const notice = document.getElementById('announcement');
    const before = notice.dataset.iwChrome;
    notice.remove();
    await tick();
    const gone = document.querySelectorAll('[data-iw-chrome="notice"]').length;
    const stillMerged = !!document.querySelector('[data-iw-chrome="shell"]');
    const nav = document.querySelector('[data-iw-chrome="nav"]');
    nav.after(notice);
    await tick();
    return { before, gone, stillMerged, back: notice.dataset.iwChrome };
  });
  console.log('\nNotice comes and goes');
  check('notice: tagged while present', t.before === 'notice', `before=${t.before}`);
  check('notice: the frame stays merged without one', t.stillMerged && t.gone === 0, JSON.stringify(t));
  check('notice: re-tagged when it returns', t.back === 'notice', `back=${t.back}`);
  await page.close();
}

{
  // The utility column BESIDE the player-info frame (Curtis, 2026-09-22). The
  // game's 2026-09 header update collapsed six icon buttons to three
  // (Notifications, a "…" menu, Settings) and nests some of them in wrappers —
  // which is what left Settings stretching alone while the other two stayed
  // narrow. Both markups are rendered: every button a direct child, and the
  // bell (with its badge) and the "…" menu (with a hidden dropdown) wrapped.
  //
  // The column must: stack three equal squares top to bottom; sit a small seam
  // right of the frame; span exactly the frame's height (top button's top and
  // bottom button's bottom on the frame's edges); and finish the frame — frame
  // right corners sharp, the column's two outer corners (top button top-right,
  // bottom button bottom-right) rounded, every other button corner square.
  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>';
  const btn = (label, extra = '') => `<button class="header-icon-btn relative" aria-label="${label}" title="${label}">${icon}${extra}</button>`;
  // The game's own unread pill (bundle, 2026-09-22): rendered only while the
  // count is above 0, directly inside the button.
  const badge = '<span class="absolute -right-1 -top-1 inline-flex min-w-[14px] items-center justify-center rounded-full bg-ember" style="position:absolute;right:-4px;top:-4px">3</span>';
  const SHAPES = {
    direct: `${btn('Notifications', badge)}${btn('More')}${btn('Settings')}`,
    wrapped: `<div class="relative">${btn('Notifications', badge)}</div>` +
      `<div class="relative">${btn('More')}<div class="absolute right-0 top-full" style="display:none">menu</div></div>` +
      `${btn('Settings')}`,
  };
  for (const [shapeName, utilityMarkup] of Object.entries(SHAPES)) {
    const liveHeader = `<header class="panel"><div class="grid gap-3">
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div class="min-w-0 overflow-hidden">
          <p>IdleWorlds</p>
          <h1 class="header-player-name"><button title="View your profile">BustedCypher</button></h1>
          <p class="header-player-title">Craftbound Innovator</p>
          <p>⚔️ Combat Lv 62 • Zone 19: Eternium Verge</p>
          <button>Players online: 141</button>
        </div>
        <div class="flex items-center gap-2">${utilityMarkup}</div>
      </div>
      <div class="grid grid-cols-2 gap-2 min-w-0"><div class="stat-chip">💰 10,957,780</div><button class="stat-chip">ATK 350 • DEF 358 • HP 477</button></div>
    </div></header>`;
    console.log(`\nUtility column (${shapeName} buttons, three)`);
    for (const width of [1440, 1024, 390]) {
      // Tailwind's preflight (`box-sizing: border-box` on everything) is on the
      // live page but not in this fixture; without it the header's `width:100%`
      // plus padding overflows its parent by ~30px and the column's position
      // is measured off a header the game never renders.
      PAGE = page_for(NAV_SHAPES.flat)
        .replace('<title>IdleWorlds</title>', '<title>IdleWorlds</title><style>*,::before,::after{box-sizing:border-box}</style>')
        .replace(/<header id="top-header">[\s\S]*?<\/header>/, liveHeader);
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', e => errs.push(String(e)));
      await serve(page);
      await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(
        () => document.querySelectorAll('[data-iw-header="utility-button"]').length === 3 &&
          document.querySelector('[data-iw-header="identity-region"]'), null, { timeout: 20000 }).catch(() => {});
      const u = await page.evaluate(() => {
        const region = document.querySelector('[data-iw-header="identity-region"]');
        const els = [...document.querySelectorAll('[data-iw-header="utility-button"]')];
        if (!region || !els.length) return { n: els.length };
        const btns = els.map(b => b.getBoundingClientRect());
        const r = region.getBoundingClientRect();
        const before = getComputedStyle(region, '::before');
        // The frame is the ::before, a grid item spanning the crest + profile
        // tracks and bleeding by its negative margins.
        const profile = document.querySelector('[data-iw-header="profile"]').getBoundingClientRect();
        const frame = {
          top: profile.top - (profile.top - r.top) + parseFloat(before.marginTop),
          bottom: r.bottom - parseFloat(before.marginBottom),
          right: profile.right - parseFloat(before.marginRight),
        };
        const radius = (el, corner) => parseFloat(getComputedStyle(el)[`border${corner}Radius`]) || 0;
        const round = v => +v.toFixed(1);
        return {
          n: els.length,
          lefts: new Set(btns.map(b => Math.round(b.left))).size,
          stacked: btns.every((b, i) => !i || b.top >= btns[i - 1].bottom - 0.5),
          square: Math.max(...btns.map(b => Math.abs(b.width - b.height))),
          size: round(Math.min(...btns.map(b => b.width))),
          seams: btns.slice(1).map((b, i) => round(b.top - btns[i].bottom)),
          frameSeam: round(btns[0].left - frame.right),
          insideHeader: btns.every(b => b.right <= document.querySelector('[data-iw-header="root"]').getBoundingClientRect().right + 0.5),
          topFlush: round(btns[0].top - frame.top),
          bottomFlush: round(frame.bottom - btns.at(-1).bottom),
          frameTR: parseFloat(before.borderTopRightRadius) || 0,
          frameBR: parseFloat(before.borderBottomRightRadius) || 0,
          frameTL: parseFloat(before.borderTopLeftRadius) || 0,
          firstTR: radius(els[0], 'TopRight'),
          lastBR: radius(els.at(-1), 'BottomRight'),
          otherCorners: els.flatMap((el, i) => [
            radius(el, 'TopLeft'), radius(el, 'BottomLeft'),
            i ? radius(el, 'TopRight') : 0, i < els.length - 1 ? radius(el, 'BottomRight') : 0,
          ]).filter(v => v > 0.5).length,
          // §4d: the button carrying the game's unread pill pulses; the rest do not.
          alert: els.map(el => getComputedStyle(el, '::after').animationName),
          pill: (() => {
            const p = els[0].querySelector(':scope > span.rounded-full');
            if (!p) return null;
            const pr = p.getBoundingClientRect(), br = els[0].getBoundingClientRect();
            const hr = document.querySelector('[data-iw-header="root"]').getBoundingClientRect();
            const cs = getComputedStyle(p);
            return {
              // Centred on the button's top-right corner, so it covers little of the icon.
              onCorner: Math.abs((pr.left + pr.right) / 2 - br.right) <= 4 && Math.abs((pr.top + pr.bottom) / 2 - br.top) <= 4,
              // Not clipped by the header root's overflow: hidden.
              unclipped: pr.top >= hr.top && pr.right <= hr.right,
              circle: Math.abs(pr.width - pr.height) <= 0.5 && parseFloat(cs.borderTopLeftRadius) >= pr.width / 2 - 0.5,
              font: parseFloat(cs.fontSize),
              // Fixed red / white, never the zone theme's ember.
              colours: [cs.backgroundColor, cs.color, cs.borderTopWidth].join(' | '),
            };
          })(),
        };
      });
      const tag = `column ${shapeName} ${width}`;
      check(`${tag}: all three header buttons are classified`, u.n === 3, `n=${u.n}`);
      check(`${tag}: one column, stacked top to bottom`, u.lefts === 1 && u.stacked, JSON.stringify(u));
      check(`${tag}: every button is a square`, u.square <= 1, JSON.stringify(u));
      check(`${tag}: small, even seams between the buttons`,
        u.seams && u.seams.every(g => g >= 4 && g <= 8) && Math.max(...u.seams) - Math.min(...u.seams) <= 1, JSON.stringify(u));
      check(`${tag}: a small seam between the frame and the column`,
        u.frameSeam >= 4 && u.frameSeam <= 8, JSON.stringify(u));
      check(`${tag}: the column stays inside the header`, u.insideHeader, JSON.stringify(u));
      check(`${tag}: the column spans the frame's full height`,
        Math.abs(u.topFlush) <= 1 && Math.abs(u.bottomFlush) <= 1, JSON.stringify(u));
      check(`${tag}: the frame's right corners are sharp, its left ones round`,
        u.frameTR === 0 && u.frameBR === 0 && u.frameTL > 0, JSON.stringify(u));
      check(`${tag}: the column's outer corners are rounded, the rest square`,
        u.firstTR > 0 && u.lastBR > 0 && u.otherCorners === 0, JSON.stringify(u));
      check(`${tag}: every button is still a usable tap target`, u.size >= 34, `size=${u.size}`);
      check(`${tag}: only the button with an unread pill pulses`,
        u.alert?.[0] === 'iw-hd-alert-ring' && u.alert.slice(1).every(a => a === 'none'), JSON.stringify(u.alert));
      check(`${tag}: the unread pill is a circle on the button's top-right corner, unclipped and readable`,
        u.pill?.onCorner && u.pill.unclipped && u.pill.circle && u.pill.font >= 10, JSON.stringify(u.pill));
      check(`${tag}: the unread pill is red with a white number and no outline`,
        u.pill?.colours === 'rgb(211, 47, 47) | rgb(255, 255, 255) | 0px', u.pill?.colours);
      // Negative control: the game drops the pill when the count reaches 0,
      // and the pulse must stop with it.
      const cleared = await page.evaluate(async () => {
        document.querySelector('[data-iw-header="utility-button"] > span.rounded-full')?.remove();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return [...document.querySelectorAll('[data-iw-header="utility-button"]')]
          .map(el => getComputedStyle(el, '::after').animationName);
      });
      check(`${tag}: the pulse stops when the pill is gone`, cleared.every(a => a === 'none'), JSON.stringify(cleared));
      await page.close();
    }
  }
}
await browser.close();

console.log(`\npageerrors: ${errs.length ? errs.join(' | ') : 'none'}`);

if (failures) {
  console.error(`\nFAIL header-compact — ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS header-compact');
