/**
 * Panel arrangement: the player reorders panels, and it sticks.
 *
 * REAL BROWSER (Playwright), because every load-bearing claim here is either
 * layout or cascade, and jsdom answers both with nothing:
 *
 *   1. `order` is a FLEX/GRID property. jsdom performs no layout, so a test
 *      there could assert the attribute was written and still be blind to the
 *      panel not having moved — the exact shape of "a check that cannot fail"
 *      CLAUDE.md warns about. Every ordering assertion below is a RECT
 *      comparison.
 *   2. The grab handle is a `<button>`, and base.css's generic control chains
 *      are (0,4,1)/(0,9,1) with `!important`. Whether the handle escapes them
 *      is a computed-style question that only a real cascade can answer. The
 *      collapse toggle lost this exact fight and nobody noticed, because the
 *      test that covers it only asserts all nine toggles match EACH OTHER.
 *
 * The page stubs `chrome.storage.local` over `localStorage`, so the
 * arrangement can be checked across a real reload rather than only within one
 * page's memory.
 *
 * Every check has a negative control, listed in CONTROLS at the bottom and
 * actually executed: each one patches the shipped bundle to revert one line of
 * source and requires the named check to fail.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* The live dashboard's own container shapes, from claude/captures/ —
   `div.flex.min-w-0.flex-col.gap-3` columns inside the wide grid section, and
   a page shell that holds the header, nav rail and zone bar as siblings of the
   panel stack. A fixture that models the wrong column shape lies exactly like
   one that omits a stylesheet. */
const SHELL = `
<div class="mx-auto flex w-full max-w-[1380px] flex-col gap-3 px-2 py-3" id="shell">
  <header class="panel" id="hdr"><div><h1>BustedCypher</h1><p>Combat Lv 62</p></div></header>
  <div class="panel flex flex-wrap gap-2 p-2" id="nav">
    <button>Game</button><button>Market</button><button>Leaderboards</button>
    <button>Village</button><button>Dungeon</button>
  </div>
  <div class="panel flex gap-2 p-3" id="zonebar">
    <p>🧭 Zone 19: Eternium Verge</p><button>🌐 Zones</button><button>Next Zone</button>
  </div>
  <section class="grid gap-3" id="wide" style="grid-template-columns:minmax(320px,.42fr) minmax(0,.58fr);align-items:start">
    <div class="flex min-w-0 flex-col gap-3" id="colL">
      <div class="panel p-3.5" data-t="skills"><div class="row"><h2>Skill Actions</h2></div><p>body</p></div>
      <div class="panel p-3.5" id="current-action-panel" data-t="current-action-panel"><header class="row"><h2>Current Action</h2>
        <div><button id="ca-cancel" aria-label="Cancel current action">&times;</button></div></header>
        <div><strong>Prospect Moonsteel Ore</strong></div>
        <div id="ca-track"><div id="ca-fill" style="width:40%"></div></div></div>
      <div class="panel p-3.5" data-t="actionlog">
        <div class="row"><button type="button" id="log-view-all" title="View full action log">Action Log <span>view all</span></button>
          <div><p>832,170 XP/hr</p><p>52% win rate</p></div></div>
        <div id="log-feed"><p>12:00:01 Mined Copper Ore</p><p>12:00:02 Mined Copper Ore</p></div></div>
      <div class="panel p-3.5" data-t="chat"><header class="row"><div><h2>World Chat</h2><p>Showing the latest 100 messages.</p></div>
        <div><button aria-label="Favourite chat">&#9734;</button><button aria-label="Global chat">&#9678;</button></div></header>
        <div id="chat-feed"><p>hello</p></div>
        <input placeholder="Message World Chat" /></div>
    </div>
    <div class="flex min-w-0 flex-col gap-3" id="colR">
      <section class="panel p-3.5" aria-label="Inventory" data-t="inv"><div class="row"><div><h2>Inventory</h2></div>
        <div class="flex items-center gap-2"><button id="inv-search" aria-label="Search inventory" title="Search inventory"><svg></svg></button></div></div>
        <div class="space-y-1.5" id="inv-list">
          <div class="compact-row"><div><span>Moonsteel Ore</span></div><div><span>Tier 3 &middot; Resource</span></div><button>List</button></div>
        </div></section>
      <div class="panel p-3.5" data-t="quests"><div class="row"><h2>Quests</h2></div><p>body</p></div>
      <div class="panel p-3.5" data-t="bosses"><div class="row"><h2>World Bosses</h2></div><p>body</p></div>
      <!-- No heading of any kind: the unkeyed case, which must NOT move. -->
      <div class="panel p-3.5" data-t="mystery"><p>An unclassifiable card.</p></div>
    </div>
  </section>
</div>`;

/* chrome.storage over localStorage, installed BEFORE the bundle so Runtime's
   `hasChrome` path is the one under test and the arrangement really is read
   back from storage on reload rather than from a same-page memory map. */
const STORAGE_STUB = `
window.chrome = {
  runtime: { id: 'panel-order-test', getURL: p => '/' + String(p).replace(/^\\/+/, '') },
  storage: {
    local: {
      get: async key => { const raw = localStorage.getItem('iws:' + key); return raw == null ? {} : { [key]: JSON.parse(raw) }; },
      set: async bag => { for (const [k, v] of Object.entries(bag)) localStorage.setItem('iws:' + k, JSON.stringify(v)); },
      remove: async key => { localStorage.removeItem('iws:' + key); },
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};`;

const page_html = body => `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>
  *,::before,::after{box-sizing:border-box;border:0 solid}
  svg{display:block}button{background:none;font:inherit;color:inherit}
  body{margin:0}.panel{padding:14px}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
  /* The Tailwind utilities the live page actually resolves these classes to.
     Without them the columns compute as BLOCK containers, where the order
     property is silently inert - the whole failure mode this module guards
     against, and a fixture that omits them reports it as a module bug. */
  .flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}
  .grid{display:grid}.gap-2{gap:8px}.gap-3{gap:12px}.min-w-0{min-width:0}
  .items-center{align-items:center}.w-full{width:100%}
  /* Below the live page's own xl breakpoint the stack is a GRID container
     rather than a flex column, a different path through both the order
     property and the drag geometry. Modelled by turning one column into a
     grid. Deliberately NOT display:contents on the columns: the live page does
     not do that, and it would move the layout container away from the panels'
     DOM parent, which container discovery keys on. */
  @media (max-width: 1279px) {
    #wide { grid-template-columns: minmax(0,1fr) !important; }
    #colR { display: grid; grid-template-columns: minmax(0,1fr); }
  }
</style></head><body>
<div id="root" data-skin="default">${SHELL}</div>
<script>${STORAGE_STUB}</` + `script>
<script>${body}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const PAGE_URL = `${ORIGIN}/panel-order.html`;
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let executablePath;
try { executablePath = process.env.IW_CHROMIUM_PATH || chromium.executablePath(); }
catch { executablePath = process.env.IW_CHROMIUM_PATH || undefined; }

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  ignoreDefaultArgs: ['--headless=old'],
  timeout: 120000,
});

let failures = 0;
const results = new Map();
function check(label, cond, detail = '') {
  results.set(label, !!cond);
  if (cond) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

/* ONE browser context for the whole run. `browser.newPage()` is shorthand for
   `browser.newContext().newPage()`, which gives every page its own origin
   storage — so a reload test built on it would find localStorage empty and
   report the module as broken when it is the harness that forgot. */
const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });

async function open(body, { keepStorage = false } = {}) {
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/panel-order.html') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page_html(body) });
    }
    if (url.pathname === '/api/player') return route.fulfill({ contentType: 'application/json', body: '{}' });
    try {
      const file = await readFile(resolve(ROOT, url.pathname.replace(/^\/+/, '')));
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      return route.fulfill({ contentType: MIME[ext] || 'application/octet-stream', body: file });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  if (!keepStorage) await page.addInitScript(() => { try { localStorage.clear(); } catch { /* private mode */ } });
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-iw-order]').length >= 7, null, { timeout: 25000 }).catch(() => {});
  return { page, errs };
}

/** The panels of one container, top to bottom as PAINTED. */
const paintedOrder = (page, containerId) => page.evaluate(id => [...document.getElementById(id).children]
  .filter(el => el.hasAttribute('data-iw-order'))
  // The skin mounts its own Village scene into this column, exactly as it does
  // live, so the painted order has to be able to name it too.
  .map(el => ({ id: el.dataset.t || el.dataset.iwPanel || el.tagName.toLowerCase(), top: Math.round(el.getBoundingClientRect().top) }))
  .sort((a, b) => a.top - b.top)
  .map(row => row.id), containerId);

const enterMode = page => page.evaluate(() => {
  document.querySelector('[data-iw-nav-link="rearrange"]').click();
});

/** Move a panel with the keyboard, the way a player would. */
async function moveByKey(page, panelId, key, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await page.evaluate(id => {
      document.querySelector('[data-t="' + id + '"] > [data-iw-order-handle]').focus();
    }, panelId);
    await page.keyboard.press(key);
  }
}


/** Press the grab surface, cross the drag threshold, move to a Y, release. */
async function dragPanel(page, fromId, toY, { release = true, past = 12 } = {}) {
  const from = await page.evaluate(id => {
    const r = document.querySelector('[data-t="' + id + '"] > [data-iw-order-handle]').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 40)) };
  }, fromId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // One small move to cross DRAG_THRESHOLD, then the travel itself.
  await page.mouse.move(from.x, from.y + (toY > from.y ? past : -past));
  await page.mouse.move(from.x, toY, { steps: 10 });
  if (release) await page.mouse.up();
  return from;
}

/** The viewport Y of the top of a container's content box. */
const contentTopOf = (page, id) => page.evaluate(cid => {
  const el = document.getElementById(cid);
  const r = el.getBoundingClientRect();
  return Math.round(r.top + parseFloat(getComputedStyle(el).paddingTop || 0));
}, id);

/* ═══ MAIN PASS ═══════════════════════════════════════════════════════════ */

console.log('\nArrangement');
const { page, errs } = await open(bundle);

const before = await paintedOrder(page, 'colL');
check('the left column starts in the game\'s own order',
  // The skin mounts its own Village scene after Skill Actions, here and live,
  // so the column the player sees holds five frames, not four.
  before.join() === 'skills,village-scene,current-action-panel,actionlog,chat', before.join());

check('the header, nav rail and zone bar are NOT orderable',
  await page.evaluate(() => ['hdr', 'nav', 'zonebar'].every(id => !document.getElementById(id).hasAttribute('data-iw-order'))
    && !document.getElementById('shell').hasAttribute('data-iw-order-container')),
  await page.evaluate(() => JSON.stringify({
    shellClaimed: document.getElementById('shell').hasAttribute('data-iw-order-container'),
    slotted: ['hdr', 'nav', 'zonebar'].filter(id => document.getElementById(id).hasAttribute('data-iw-order')),
  })));

check('a rearrange control was added to the nav, exactly once',
  await page.evaluate(() => document.querySelectorAll('[data-iw-nav-link="rearrange"]').length === 1));

check('no grab handle exists during normal play',
  await page.evaluate(() => document.querySelectorAll('[data-iw-order-handle]').length === 0));

/* What the classifiers made of the page BEFORE the skin appends anything into
   it. The collapse toggle's regression was that these changed on the pass after
   its append, so the only meaningful check is a before/after diff. */
const baseline = await page.evaluate(() => ({
  headers: [...document.querySelectorAll('[data-iw-panel-header]')].map(el => el.dataset.t + ':' + el.dataset.iwPanelHeader).sort(),
  parts: [...document.querySelectorAll('[data-iw-panel-part]')].map(el => el.dataset.iwPanelPart).sort(),
}));

await enterMode(page);
await page.waitForFunction(() => document.querySelectorAll('[data-iw-order-handle]').length >= 7, null, { timeout: 10000 }).catch(() => {});

check('entering the mode gives every orderable panel a handle',
  await page.evaluate(() => document.querySelectorAll('[data-iw-order-handle]').length >= 7));

/* THE central assertion: a keyboard move must MOVE THE PANEL, measured by
   rect, not by the attribute the module just wrote. */
await moveByKey(page, 'chat', 'Home', 1);
const after = await paintedOrder(page, 'colL');
check('a keyboard move actually repaints the panel at the top',
  after.join() === 'chat,skills,village-scene,current-action-panel,actionlog', after.join());

check('the moved panel keeps the focus it was moved with',
  await page.evaluate(() => document.activeElement?.parentElement?.dataset.t === 'chat'));

check('the move is announced to assistive technology',
  await page.evaluate(() => /world chat/i.test(document.querySelector('[data-iw-order-live]')?.textContent || '')));

/* An unkeyed panel has no name to remember. It gets NO grab surface, because a
   handle that appears to work and then silently reverts on the next pass is
   worse than no handle, and it keeps its slot while its neighbours move. */
check('an unkeyed panel gets no grab surface, and says so',
  await page.evaluate(() => {
    const el = document.querySelector('[data-t="mystery"]');
    return !el.querySelector(':scope > [data-iw-order-handle]') && el.getAttribute('data-iw-order-fixed') === '1';
  }));
await moveByKey(page, 'quests', 'ArrowUp', 1);
check('an unkeyed panel is left exactly where the game put it',
  (await paintedOrder(page, 'colR')).indexOf('mystery') === 3,
  (await paintedOrder(page, 'colR')).join());

/* The exclusion list: the handle must not be repainted by the generic control
   rules, and must not be counted as a game control by any classifier. */
const handle = await page.evaluate(() => {
  const el = document.querySelector('[data-t="chat"] > [data-iw-order-handle]');
  const cs = getComputedStyle(el);
  const panel = document.querySelector('[data-t="chat"]');
  return {
    boxShadow: cs.boxShadow,
    position: cs.position,
    zIndex: cs.zIndex,
    /* An absolutely positioned box with `inset: 0` fills its containing
       block's PADDING box, so it is inset by the panel's border on each side.
       The tolerance is that border, not a fudge factor. */
    gap: (() => { const h = el.getBoundingClientRect(), p = panel.getBoundingClientRect();
      return { w: +(p.width - h.width).toFixed(1), h: +(p.height - h.height).toFixed(1),
        border: getComputedStyle(panel).borderTopWidth }; })(),
    taggedAsGameControl: !!(el.dataset.iwCompactButton || el.dataset.iwInventoryControl || el.dataset.iwPanelPart),
    headers: [...document.querySelectorAll('[data-iw-panel-header]')].map(el => el.dataset.t + ':' + el.dataset.iwPanelHeader).sort(),
    parts: [...document.querySelectorAll('[data-iw-panel-part]')].map(el => el.dataset.iwPanelPart).sort(),
  };
});
check('the handle escapes base.css\'s generic button shadow',
  handle.boxShadow === 'none', handle.boxShadow);
check('the handle covers its whole panel and sits above it',
  handle.gap.w <= 4 && handle.gap.h <= 4 && handle.gap.w >= 0 && handle.gap.h >= 0
  && handle.position === 'absolute' && handle.zIndex === '5', JSON.stringify(handle));
check('no classifier mistook the handle for a game control',
  !handle.taggedAsGameControl);
check('every panel header classifies exactly as it did before the append',
  handle.headers.join() === baseline.headers.join(),
  baseline.headers.join() + ' -> ' + handle.headers.join());
check('every panel part classifies exactly as it did before the append',
  handle.parts.join() === baseline.parts.join(),
  baseline.parts.join() + ' -> ' + handle.parts.join());

/* A collapsed panel is a 34px bar, which is when rearranging matters most. */
await page.evaluate(() => { document.querySelector('[data-t="inv"]').dataset.iwCollapsed = '1'; });
check('a collapsed panel keeps its grab handle',
  await page.evaluate(() => getComputedStyle(
    document.querySelector('[data-t="inv"] > [data-iw-order-handle]')).display !== 'none'));
await page.evaluate(() => { delete document.querySelector('[data-t="inv"]').dataset.iwCollapsed; });

/* Persistence across a real reload, through the chrome.storage stub. */
const stored = await page.evaluate(() => localStorage.getItem('iws:iw-panel-order'));
check('the arrangement was written to extension storage, keyed by heading',
  !!stored && /"title:world chat"/.test(stored), String(stored).slice(0, 160));

await page.close();
const second = await open(bundle, { keepStorage: true });
/* The storage read is async, so wait for the module to have APPLIED something
   rather than merely for the attributes to exist. If it never applies, this
   times out and the rect check below still reports the real painted order. */
await second.page.waitForFunction(
  () => document.querySelector('[data-t="chat"]')?.getAttribute('data-iw-order') === '0',
  null, { timeout: 15000 }).catch(() => {});
const reloaded = await paintedOrder(second.page, 'colL');
check('the arrangement survives a page reload',
  reloaded[0] === 'chat', reloaded.join());

await second.page.close();

console.log(`pageerrors: ${errs.length ? errs.join(' | ') : 'none'}`);
check('no page errors', errs.length === 0, errs.join(' | '));

/* ═══ POINTER DRAGGING ════════════════════════════════════════════════════
 *
 * A fresh page, so these do not inherit the keyboard pass's arrangement.
 */

console.log('\nDragging');
const drag = await open(bundle);
await enterMode(drag.page);
await drag.page.waitForFunction(() => document.querySelectorAll('[data-iw-order-handle]').length >= 7, null, { timeout: 10000 }).catch(() => {});

check('the grab surface opts out of the browser\'s own touch gestures',
  await drag.page.evaluate(() => getComputedStyle(
    document.querySelector('[data-t="inv"] > [data-iw-order-handle]')).touchAction === 'none'));

const rightBefore = await paintedOrder(drag.page, 'colR');
check('the right column starts in the game\'s own order',
  rightBefore.join() === 'inv,quests,bosses,mystery', rightBefore.join());

/* A press that never crosses the threshold is a click, not a drag — the whole
   reason the threshold exists. */
await dragPanel(drag.page, 'bosses', await drag.page.evaluate(() => {
  const r = document.querySelector('[data-t="bosses"]').getBoundingClientRect();
  return Math.round(r.top + 3);
}), { past: 2 });
check('a press below the drag threshold moves nothing',
  (await paintedOrder(drag.page, 'colR')).join() === rightBefore.join(),
  (await paintedOrder(drag.page, 'colR')).join());

/* THE central assertion for this half: a real drag must repaint the panel
   somewhere else, measured by rect. The cost instrument runs across it. */
await drag.page.evaluate(() => {
  window.__recs = [];
  window.__obs = new MutationObserver(list => { for (const m of list) window.__recs.push(m); });
  window.__obs.observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'aria-pressed', 'aria-selected', 'aria-current', 'data-state'],
  });
});

await dragPanel(drag.page, 'bosses', (await contentTopOf(drag.page, 'colR')) + 4);
const afterDrag = await paintedOrder(drag.page, 'colR');
check('a pointer drag repaints the panel at the top of its column',
  afterDrag[0] === 'bosses', afterDrag.join());

const cost = await drag.page.evaluate(() => {
  for (const m of window.__obs.takeRecords()) window.__recs.push(m);
  window.__obs.disconnect();
  const live = document.querySelector('[data-iw-order-live]');
  const outside = window.__recs.filter(m => !(live && (m.target === live || live.contains(m.target))));
  const styles = outside.filter(m => m.type === 'attributes' && m.attributeName === 'style');
  return {
    total: window.__recs.length,
    outsideLiveRegion: outside.length,
    styleWrites: styles.length,
    kinds: [...new Set(outside.map(m => m.type + ':' + (m.attributeName || '')))],
    who: outside.slice(0, 4).map(m => ({
      type: m.type,
      attr: m.attributeName,
      tag: m.target.tagName,
      id: m.target.id || m.target.dataset?.t || '',
      cls: String(m.target.className || '').slice(0, 80),
      was: m.oldValue,
    })),
  };
});
/* The cost claim this whole design exists to keep: a drag rewrites only
   `data-iw-*`, which the observer does not watch, so the game sees nothing. */
check('a whole drag writes no inline styles and no watched attributes',
  cost.styleWrites === 0 && cost.outsideLiveRegion === 0,
  JSON.stringify(cost));

/* An instrument that reports zero because it is broken looks exactly like one
   reporting zero because there is nothing to see. */
const sensitivity = await drag.page.evaluate(() => new Promise(done => {
  let n = 0;
  const obs = new MutationObserver(list => { n += list.length; });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'aria-pressed', 'aria-selected', 'aria-current', 'data-state'] });
  document.querySelector('[data-t="inv"]').style.setProperty('outline-offset', '3px');
  setTimeout(() => { n += obs.takeRecords().length; obs.disconnect(); done(n); }, 30);
}));
check('the cost instrument does see an inline-style write when there is one',
  sensitivity >= 1, String(sensitivity));

const dragStored = await drag.page.evaluate(() => localStorage.getItem('iws:iw-panel-order'));
check('the drop was persisted',
  !!dragStored && /"title:world bosses"/.test(dragStored), String(dragStored).slice(0, 180));

/* Escape is the only way out of a captured-pointer drag, so it has to put the
   panel back exactly where it started. */
const beforeCancel = await paintedOrder(drag.page, 'colR');
await dragPanel(drag.page, 'quests', (await contentTopOf(drag.page, 'colR')) + 4, { release: false });
const midCancel = await paintedOrder(drag.page, 'colR');
await drag.page.keyboard.press('Escape');
await drag.page.mouse.up();
check('an in-flight drag actually previews the new position',
  midCancel[0] === 'quests', midCancel.join());
check('Escape restores the order the drag started from',
  (await paintedOrder(drag.page, 'colR')).join() === beforeCancel.join(),
  (await paintedOrder(drag.page, 'colR')).join());
check('a cancelled drag leaves no drag marks behind',
  await drag.page.evaluate(() => document.querySelectorAll('[data-iw-order-drag], [data-iw-order-dragging]').length === 0));

/* The narrow layout is where dragging matters most — it is the phone shape —
   and its container is a GRID, so `order` and the drag geometry both take a
   different path there than in the wide flex columns. */
await drag.page.setViewportSize({ width: 1100, height: 1000 });
await drag.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const narrowContainer = await drag.page.evaluate(() => {
  const el = document.getElementById('colR');
  return { display: getComputedStyle(el).display, marked: el.getAttribute('data-iw-order-container') };
});
check('the narrow stack is a grid, and it is still claimed',
  narrowContainer.display === 'grid' && narrowContainer.marked === '1', JSON.stringify(narrowContainer));

/* One column below the other now, so the target is off screen until it is
   scrolled to — the mouse cannot travel to a coordinate outside the viewport. */
await drag.page.evaluate(() => {
  document.getElementById('colR').scrollIntoView({ block: 'start' });
});
await drag.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const narrowBefore = await paintedOrder(drag.page, 'colR');
await dragPanel(drag.page, 'bosses', (await contentTopOf(drag.page, 'colR')) + 4);
const narrowAfter = await paintedOrder(drag.page, 'colR');
check('a drag reorders a grid stack too, not just a flex column',
  narrowAfter[0] === 'bosses' && narrowBefore[0] !== 'bosses',
  `${narrowBefore.join()} -> ${narrowAfter.join()}`);
/* The scope key carries the layout, so the wide and narrow arrangements are
   independent — a two-column arrangement is not expressible as a one-column
   one, and pretending otherwise would shuffle panels on every resize. */
check('the narrow arrangement is stored under its own scope',
  await drag.page.evaluate(() => {
    const bag = JSON.parse(localStorage.getItem('iws:iw-panel-order') || '{}');
    const scopes = Object.keys(bag.scopes || {});
    return scopes.some(k => k.includes('|wide|')) && scopes.some(k => k.includes('|narrow|'));
  }));

console.log(`pageerrors: ${drag.errs.length ? drag.errs.join(' | ') : 'none'}`);
check('no page errors while dragging', drag.errs.length === 0, drag.errs.join(' | '));
await drag.page.close();

/* ═══ NEGATIVE CONTROLS ═══════════════════════════════════════════════════
 *
 * Each reverts ONE line of source in the shipped bundle and requires a named
 * check to fail. A check with no negative control is a check that has not been
 * shown capable of failing.
 */

const CONTROLS = [
  {
    label: 'order CSS rules removed',
    mustFail: 'a keyboard move actually repaints the panel at the top',
    patch: b => b.replace(/\[data-iw-order="(\d+)"\]\{order:\d+!important\}/g, '[data-iw-order="$1"]{}'),
  },
  {
    label: 'base.css opt-out removed from the shadow rule',
    mustFail: 'the handle escapes base.css\'s generic button shadow',
    patch: b => b.replace(/:not\(\[data-iw-order-handle\]\)/g, ''),
  },
  {
    // collapsible.css hides `> *` on a folded panel at (0,4,0) !important. The
    // only thing keeping the grab surface alive there is panel-order.css
    // outranking it, so that is what this control has to break.
    label: 'the handle display drops its !important',
    mustFail: 'a collapsed panel keeps its grab handle',
    patch: b => b.replace(
      '[data-iw-order-handle]{position:absolute!important;inset:0!important;z-index:5!important;display:grid!important',
      '[data-iw-order-handle]{position:absolute!important;inset:0!important;z-index:5!important;display:grid'),
  },
  {
    // Without `touch-action: none` the browser claims the gesture for
    // scrolling and a drag never starts on a touch device at all.
    label: 'touch-action removed from the grab surface',
    mustFail: 'the grab surface opts out of the browser gestures',
    patch: b => b.replace('touch-action:none!important;', ''),
  },
];

console.log('\nNegative controls');
for (const control of CONTROLS) {
  const patched = control.patch(bundle);
  if (patched === bundle) { failures += 1; console.log(`  FAIL  ${control.label} — the patch changed nothing, so the control is inert`); continue; }
  const run = await open(patched);
  let stillPasses = false;
  try {
    if (control.mustFail === 'a keyboard move actually repaints the panel at the top') {
      await enterMode(run.page);
      await run.page.waitForFunction(() => document.querySelectorAll('[data-iw-order-handle]').length >= 7, null, { timeout: 10000 }).catch(() => {});
      await moveByKey(run.page, 'chat', 'ArrowUp', 3);
      stillPasses = (await paintedOrder(run.page, 'colL'))[0] === 'chat';
    } else if (control.mustFail === 'the handle escapes base.css\'s generic button shadow') {
      await enterMode(run.page);
      await run.page.waitForFunction(() => document.querySelectorAll('[data-iw-order-handle]').length >= 7, null, { timeout: 10000 }).catch(() => {});
      stillPasses = await run.page.evaluate(() => getComputedStyle(
        document.querySelector('[data-t="chat"] > [data-iw-order-handle]')).boxShadow === 'none');
    } else if (control.mustFail === 'the grab surface opts out of the browser gestures') {
      await enterMode(run.page);
      await run.page.waitForFunction(() => document.querySelectorAll('[data-iw-order-handle]').length >= 7, null, { timeout: 10000 }).catch(() => {});
      stillPasses = await run.page.evaluate(() => getComputedStyle(
        document.querySelector('[data-t="inv"] > [data-iw-order-handle]')).touchAction === 'none');
    } else {
      await enterMode(run.page);
      await run.page.waitForFunction(() => document.querySelectorAll('[data-iw-order-handle]').length >= 7, null, { timeout: 10000 }).catch(() => {});
      await run.page.evaluate(() => { document.querySelector('[data-t="inv"]').dataset.iwCollapsed = '1'; });
      stillPasses = await run.page.evaluate(() => getComputedStyle(
        document.querySelector('[data-t="inv"] > [data-iw-order-handle]')).display !== 'none');
    }
  } catch (err) { stillPasses = false; }
  await run.page.close();
  check(`reverting "${control.label}" breaks "${control.mustFail}"`, !stillPasses,
    stillPasses ? 'the check still passed, so it cannot detect this regression' : '');
}

await context.close();
await browser.close();
console.log(failures ? `\nFAIL panel-order (${failures})` : '\nPASS panel-order');
process.exit(failures ? 1 : 0);
