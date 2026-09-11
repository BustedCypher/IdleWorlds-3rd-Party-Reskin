/**
 * Per-panel collapse: every parent frame folds, and folds ALONE.
 *
 * REAL BROWSER (Playwright), because the two things most likely to be wrong
 * here are geometry, and jsdom answers geometry with zeros:
 *
 *   1. The toggle sits at the right end of the heading row, which is exactly
 *      where the game already puts its own header controls — Action Log's
 *      "View All", World Chat's three icon tools, Zone Control's button pair,
 *      Current Action's cancel. The head reserves a gutter for it; without
 *      that reservation the control lands on top of a game button and the
 *      player loses a click target rather than gaining one.
 *   2. Collapsing hides `> *`, so what actually disappears — and what
 *      survives — is a cascade question about direct children, not something
 *      any unit test can see.
 *
 * The panel set is the nine Curtis asked for, each carrying the live app's own
 * header shape (from the deployed bundle), because a fixture that models the
 * wrong header shape would hide the collision this file exists to catch.
 *
 * Negative controls, verified by reverting the source:
 *   - drop `[data-iw-collapse-head] { padding-right }` and the toggle overlaps
 *     the game's header control on Action Log, World Chat and Zone Control;
 *   - drop the `:not([data-iw-collapse-head])` clause from the fold rule and
 *     every collapsed panel loses its title too.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const VILLAGE = { player: { housing: { tier: 3 }, villageAddons: { totalSlots: 3, installed: [
  { slot: 1, itemKey: 'construction_building_tier_11', name: 'Voidiron Archive' },
] } } };

/* Header shapes are the live app's: a `justify-between` row whose right-hand
   side is already occupied on five of these nine. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>
  *,::before,::after{box-sizing:border-box;border:0 solid}
  svg{display:block}button{background:none;font:inherit;color:inherit}
  body{margin:0}.panel{padding:14px}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
  .cols{display:grid;gap:12px;grid-template-columns:minmax(320px,0.42fr) minmax(0,0.58fr);align-items:start}
  @media (max-width:900px){.cols{grid-template-columns:minmax(0,1fr)}}
  .col{display:flex;flex-direction:column;gap:12px;min-width:0}
</style></head><body>
<div id="root" data-skin="default">
  <header><div><h1>BustedCypher</h1><p>Combat Lv 62</p></div><div><button>1</button></div></header>
  <nav><button>Game</button><button>Market</button></nav>
  <div><p>Zone 19: Eternium Verge</p><button>Zones</button></div>
  <div class="cols">
    <div class="col">
      <section id="current-action-panel" class="panel">
        <header class="row"><h2>Current Action</h2><div><button id="ca-cancel" aria-label="Cancel current action">&times;</button><span>3s</span></div></header>
        <div><strong>Prospect Moonsteel Ore</strong></div>
        <div id="ca-track"><div id="ca-fill" style="width:40%"></div></div>
      </section>

      <div class="panel" id="skills"><div class="row"><h2>Skill Actions</h2><p id="skills-boost">Daily XP Boost</p></div>
        <div class="compact-panel" id="mine-panel">
          <div><p>&#9935; Mine</p><p>LV 2</p></div>
          <div><p>&#9935; Mine Copper Ore</p><button>Lv 2 - 10% &bull; 4,120 to go</button><p>Base reward: +8 mining XP/task</p></div>
          <div><button>Mine</button></div>
        </div>
      </div>

      <!-- Live shape: the heading and the TOOL ROW share one header row, so
           the toggle's gutter has to hold against real controls here too. -->
      <section aria-label="Inventory" id="inventory" class="panel">
        <div class="row">
          <div><h2>Inventory</h2></div>
          <div class="flex items-center gap-2" id="tool-row">
            <div class="relative"><button id="inv-filter" aria-label="Filter inventory" title="Filter inventory"><svg></svg></button></div>
            <button id="inv-search" aria-label="Search inventory" title="Search inventory"><svg></svg></button>
            <button id="inv-equip" aria-label="Equipment Window" title="Equipment Window"><svg></svg></button>
          </div>
        </div>
        <div class="space-y-1.5" id="inv-list">
          <div class="compact-row"><div><span>Moonsteel Ore</span></div><div><span>Tier 3 &middot; Resource</span></div><div><span>x14</span></div><button>List</button></div>
          <div class="compact-row"><div><span>Iron Sword</span></div><div><span>Tier 4 &middot; Weapon</span></div><div><span>x1</span></div><button>Equip</button></div>
        </div>
      </section>

      <div class="panel" id="quests"><div class="row"><h2>Quests</h2></div>
        <div class="compact-panel" id="quest-1">
          <p>&#9935; Mining Work Order</p><p>&#128142; Night Claw 22/100</p>
          <p>Reward: +1,875g &bull; +810 combat XP</p><p>22% complete</p>
          <button>Turn In</button><button>Skip</button>
        </div>
      </div>
    </div>

    <div class="col">
      <!-- The live Action Log, from the deployed bundle: its LABEL is a
           button, not a heading, and its rate readouts sit in their own div —
           the shape that decides whether classifyActivityPanels resolves its
           host to the card or to this header row. -->
      <div id="action-log" class="panel">
        <div class="row"><button type="button" id="log-view-all" title="View full action log">Action Log <span>view all</span></button>
          <div><p>832,170 XP/hr</p><p>52% win rate</p></div></div>
        <div id="log-feed" class="feed-panel" role="button" tabindex="0"><p>Mined Copper Ore</p><p>Mined Copper Ore</p></div>
      </div>

      <section id="world-chat" class="panel">
        <header class="row"><div><h2>World Chat</h2><p>Showing the latest 100 messages.</p></div>
          <div><button aria-label="Favourite chat">&#9734;</button><button aria-label="Global chat">&#9678;</button><button id="chat-settings" aria-label="Chat settings">&#9881;</button></div></header>
        <div id="chat-feed"><p>hello</p></div>
      </section>

      <div class="panel" id="bosses"><div class="row"><h2>World Bosses</h2><p>Shared world events</p></div>
        <div class="compact-panel"><div><p>&#127757; Ancient Treant</p><p>Solo</p><p>Respawns 8m left</p></div></div>
      </div>

      <div class="panel" id="zone-control"><div class="row"><h2>Zone Control</h2>
        <div><button id="zc-attack">Attack</button><button id="zc-refresh">Refresh</button></div></div>
        <p>Blue team controls this zone</p>
      </div>
    </div>
  </div>
</div>
<script>${bundle}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const PAGE_URL = `${ORIGIN}/collapsible-frames.html`;
const MIME = {
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

async function serve(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/collapsible-frames.html') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
    }
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
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
page.on('pageerror', e => errs.push(String(e)));
await serve(page);
await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });

/* The nine Curtis named, by the identity CollapsibleFrames keys them on. */
const WANTED = [
  'panel:current-action', 'panel:action-log', 'panel:world-chat',
  'panel:village-scene', 'title:skill actions', 'title:inventory',
  'title:quests', 'title:world bosses', 'title:zone control',
];

await page.waitForFunction(
  n => document.querySelectorAll('[data-iw-collapse]').length >= n,
  WANTED.length, { timeout: 25000 }).catch(() => {});

/** Every toggle on the page, with the frame it folds and the row it sits in. */
async function survey() {
  return page.evaluate(() => {
    const box = el => {
      const r = el.getBoundingClientRect();
      return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), top: +r.top.toFixed(1),
        bottom: +r.bottom.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) };
    };
    const norm = v => String(v || '').replace(/\s+/g, ' ').trim();
    const key = frame => {
      if (frame.dataset.iwPanel) return `panel:${frame.dataset.iwPanel}`;
      const t = frame.querySelector('[data-iw-ui="section-title"]')
        || frame.querySelector('[role="heading"]') || frame.querySelector('h1,h2,h3,h4');
      return `title:${norm(t && t.textContent).replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase()}`;
    };
    return [...document.querySelectorAll('[data-iw-collapse]')].map(button => {
      // The toggle lives INSIDE the heading row so it can centre on it, so the
      // frame it folds is that row's parent.
      const head = button.parentElement;
      const frame = head.parentElement;
      // Every control the GAME put in the same heading row.
      const rivals = head
        ? [...head.querySelectorAll('button, a, [role="button"]')]
            .filter(el => el !== button).map(el => ({ id: el.id || norm(el.getAttribute('aria-label')), ...box(el) }))
        : [];
      return {
        key: key(frame),
        frameId: frame.id || frame.getAttribute('aria-label') || '',
        collapsed: frame.dataset.iwCollapsed === '1',
        expanded: button.getAttribute('aria-expanded'),
        label: button.getAttribute('aria-label'),
        button: box(button),
        head: head ? box(head) : null,
        titleBox: (() => {
          const t = frame.querySelector('[data-iw-ui="section-title"]')
            || frame.querySelector('[role="heading"]') || frame.querySelector('h1,h2,h3,h4');
          return t ? box(t) : null;
        })(),
        rivals,
        // What a fold leaves standing, counting only the GAME's children: the
        // toggle itself is always visible and would mask the difference.
        visibleChildren: [...frame.children]
          .filter(el => !el.hasAttribute('data-iw-collapse'))
          .filter(el => getComputedStyle(el).display !== 'none').length,
        childCount: [...frame.children].filter(el => !el.hasAttribute('data-iw-collapse')).length,
      };
    });
  });
}

const overlaps = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// The Village scene paints from an ASYNC read, so its frame arrives a beat
// after the rest; settle before surveying rather than racing it.
await page.waitForTimeout(1200);
console.log('\nCoverage');
let survey0 = await survey();
const found = new Set(survey0.map(r => r.key));
for (const want of WANTED) {
  check(`${want} has a collapse control`, found.has(want),
    [...found].join(', ') || '(none)');
}
check('no frame gets two toggles',
  survey0.length === new Set(survey0.map(r => r.key)).size,
  `${survey0.length} toggles, ${new Set(survey0.map(r => r.key)).size} frames`);
check('every toggle starts expanded',
  survey0.every(r => r.expanded === 'true' && !r.collapsed));

console.log('\nThe control clears the game\'s own header controls');
for (const row of survey0) {
  if (!row.rivals.length) continue;
  const hit = row.rivals.find(r => overlaps(row.button, r));
  check(`${row.key}: toggle does not cover "${row.rivals.map(r => r.id).join(', ')}"`,
    !hit, hit && `toggle ${row.button.left}..${row.button.right} over ${hit.id} ${hit.left}..${hit.right}`);
}
/* Named, not counted: "at least N panels have a rival" would still pass if the
   one panel whose header shape changed quietly stopped reporting any, and the
   overlap loop above skips a panel with no rivals — so without this the
   collision check could go silent instead of failing. */
for (const key of ['panel:current-action', 'panel:action-log', 'panel:world-chat',
  'title:zone control', 'title:inventory']) {
  const row = survey0.find(r => r.key === key);
  check(`${key} really does have a game control in its heading row`,
    !!row && row.rivals.length > 0, row ? `${row.rivals.length} rivals` : 'panel missing');
}

/* And it has to READ as part of that row. The frames disagree on their padding
   (`--iw-frame-pad-y` is 18px on an activity panel, 26px elsewhere) and on
   their title's font size, so a toggle pinned to one fixed offset floats above
   the heading on whichever family it was not tuned against. */
console.log('\nThe control sits ON the heading row');
for (const row of survey0) {
  const mid = (row.button.top + row.button.bottom) / 2;
  // Centred on the ROW, which is where the game centres its own header
  // controls too — not on the title, because World Chat's row carries a second
  // line under its heading and the game's icon tools sit level with the row.
  const headMid = (row.head.top + row.head.bottom) / 2;
  check(`${row.key}: toggle is centred on its heading row`,
    Math.abs(mid - headMid) <= 2,
    `off by ${(mid - headMid).toFixed(1)}px (head ${row.head.height}px tall)`);
}

console.log('\nFolding');
const target = 'title:quests';
await page.evaluate(k => {
  const button = [...document.querySelectorAll('[data-iw-collapse]')]
    .find(b => (b.parentElement.dataset.iwPanel ? `panel:${b.parentElement.dataset.iwPanel}`
      : `title:${String(b.parentElement.querySelector('[data-iw-ui="section-title"]')?.textContent || '')
        .replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase()}`) === k);
  button.click();
}, target);
await page.waitForTimeout(400);
const survey1 = await survey();
const quests = survey1.find(r => r.key === target);
check('the clicked panel is marked collapsed', quests.collapsed && quests.expanded === 'false');
check('its heading row survives the fold', quests.visibleChildren === 1,
  `${quests.visibleChildren} of ${quests.childCount} children still shown`);
check('its content is gone', quests.childCount > 1);
check('the control relabels itself for the new direction',
  /^Expand /.test(quests.label), quests.label);
check('every OTHER panel is untouched',
  survey1.filter(r => r.key !== target).every(r => !r.collapsed),
  survey1.filter(r => r.key !== target && r.collapsed).map(r => r.key).join(', '));
const before = survey0.find(r => r.key === target).head.height;
check('a collapsed panel is shorter than it was',
  quests.head.height <= before + 0.6, `head ${before} -> ${quests.head.height}`);

console.log('\nThe choice survives a re-render');
await page.evaluate(() => {
  // Force a full reclassify the way a route swap does, then let the skin settle.
  document.body.appendChild(document.createComment('kick'));
  document.getElementById('quests').appendChild(document.createElement('span'));
});
await page.waitForTimeout(600);
const survey2 = await survey();
check('the folded panel is still folded after a reclassify',
  survey2.find(r => r.key === target)?.collapsed === true);
check('and nothing else folded with it',
  survey2.filter(r => r.key !== target).every(r => !r.collapsed));

/* `IW_SHOT=<dir> node tests/collapsible-frames.test.mjs` writes the folded
   state out of this same fixture, so the picture and the checks can never
   drift apart. Not part of an ordinary run. */
if (process.env.IW_SHOT) {
  const ids = ['action-log', 'world-chat', 'zone-control', 'skills', 'inventory', 'quests'];
  await page.evaluate(list => list
    .forEach(id => document.querySelector(`#${id} [data-iw-collapse]`)?.click()), ids);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${process.env.IW_SHOT}/collapsed.png` });
  await page.evaluate(list => list
    .forEach(id => document.querySelector(`#${id} [data-iw-collapse]`)?.click()), ids);
  await page.waitForTimeout(500);
}

/* -- Every collapsed bar is the SAME bar -----------------------------
   The live page (capture, 2026-09) folded to nine different bars: heading rows
   of one to three lines, the game's 30-34px header controls still standing,
   and three different title treatments. Height and type are asserted together
   because either one alone still reads as "inconsistent". */
console.log('\nEvery collapsed bar is the same bar');
// Remember how many were open so this comparison can hand the page back
// unchanged — the checks after it depend on the state the checks before left.
const wasOpen = await page.evaluate(() => {
  const open = [...document.querySelectorAll('[data-iw-collapse]')]
    .filter(b => b.getAttribute('aria-expanded') === 'true');
  open.forEach(b => b.click());
  return open.length;
});
await page.waitForTimeout(500);
const bars = await page.evaluate(() => [...document.querySelectorAll('[data-iw-collapse]')].map(b => {
  const head = b.parentElement;
  const frame = head.parentElement;
  const title = frame.querySelector('[data-iw-collapse-title]');
  const cs = getComputedStyle(title);
  return {
    key: frame.dataset.iwPanel ? `panel:${frame.dataset.iwPanel}` : `title:${title.textContent.trim()}`,
    height: +frame.getBoundingClientRect().height.toFixed(1),
    type: [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.lineHeight,
      cs.letterSpacing, cs.textTransform, cs.color].join(' | '),
    titleVisible: title.getBoundingClientRect().width > 0,
    // The corner filigree is the frame's own ::after: each corner paints where
    // two border sides meet, so a side of zero width has no corner.
    ornament: (() => {
      const o = getComputedStyle(frame, '::after');
      return ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
        .map(k => Math.round(parseFloat(o[k]) || 0));
    })(),
    // How far the title's ink starts from the frame's own left edge, which is
    // what has to clear the surviving flourish.
    titleInset: +(title.getBoundingClientRect().left - frame.getBoundingClientRect().left).toFixed(1),
    control: (() => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return {
        box: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
        paint: [cs.borderTopWidth, cs.borderRadius, cs.padding, cs.minHeight,
          cs.backgroundImage.slice(0, 40), cs.boxShadow.slice(0, 40)].join(' | '),
        rightInset: +(frame.getBoundingClientRect().right - r.right).toFixed(1),
      };
    })(),
  };
}));
const heights = [...new Set(bars.map(b => b.height))];
const types = [...new Set(bars.map(b => b.type))];
check('every panel folds to the same height',
  heights.length === 1, bars.map(b => `${b.key} ${b.height}`).join(', '));
check('every panel folds to one title treatment',
  types.length === 1,
  bars.filter(b => b.type !== bars[0].type).map(b => `${b.key}: ${b.type}`).join(' /// '));
check('and that bar is thin', heights[0] <= 40, `${heights[0]}px`);
check('every folded title is still readable',
  bars.every(b => b.titleVisible), bars.filter(b => !b.titleVisible).map(b => b.key).join(', '));
check('all nine panels were folded for that comparison',
  bars.length === WANTED.length, `${bars.length} bars`);
/* Curtis, 2026-09: one flourish, top left, and the title clear of it. */
check('a folded bar keeps only its top-left flourish',
  bars.every(b => b.ornament[1] === 0 && b.ornament[2] === 0
    && b.ornament[0] > 0 && b.ornament[3] > 0),
  bars.map(b => `${b.key} [${b.ornament}]`).join(', '));
/* The control has to be the SAME control on every panel: Curtis's capture
   (2026-09) showed it rendering at two different sizes and two different
   plates depending on which frame family the panel belonged to. */
{
  const boxes = [...new Set(bars.map(b => b.control.box))];
  const paints = [...new Set(bars.map(b => b.control.paint))];
  const insets = [...new Set(bars.map(b => b.control.rightInset))];
  check('every collapse control is the same size',
    boxes.length === 1, bars.map(b => `${b.key} ${b.control.box}`).join(', '));
  check('every collapse control is painted the same',
    paints.length === 1,
    bars.filter(b => b.control.paint !== bars[0].control.paint)
      .map(b => `${b.key}: ${b.control.paint}`).join(' /// '));
  check('every collapse control sits the same distance from the frame edge',
    insets.length === 1, bars.map(b => `${b.key} ${b.control.rightInset}`).join(', '));
}
check('the folded title clears that flourish',
  bars.every(b => b.titleInset >= bars[0].ornament[3] + 8),
  bars.map(b => `${b.key} ${b.titleInset}`).join(', '));
check('the comparison folded panels that were open, not an already-folded page',
  wasOpen === WANTED.length - 1, `${wasOpen} were open`);
// Hand the page back exactly as it was: Quests folded, everything else open.
await page.evaluate(() => document.querySelectorAll('[data-iw-collapse]').forEach(b => {
  const frame = b.parentElement.parentElement;
  if (frame.id !== 'quests' && b.getAttribute('aria-expanded') === 'false') b.click();
}));
await page.waitForTimeout(400);

/* The opt-out that hands the collapsed ornament to collapsible.css lives on
   ui-system.css's own selector, so it could just as easily strip the corners
   from an EXPANDED panel — which nothing else here would notice. */
const expandedCorners = await page.evaluate(() => {
  const frame = [...document.querySelectorAll('[data-iw-ui="section-frame"]')]
    .find(el => !el.dataset.iwCollapsed && !el.querySelector('[data-iw-ui="section-frame"]'));
  const o = getComputedStyle(frame, '::after');
  return ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
    .map(k => Math.round(parseFloat(o[k]) || 0));
});
check('an EXPANDED panel still gets all four corners',
  expandedCorners.every(w => w > 0), `[${expandedCorners}]`);
/* Tied to the art, not to a number: the corner is one quadrant of a fixed
   sheet, so the folded panel has to window it at the same width-for-height the
   expanded panel does or the flourish renders as a smear. Reported live
   (2026-09) as "the corner filigree is squashed somehow" when a 32x34 window
   was cut to 32x15. */
check('the folded corner keeps the expanded corner proportions',
  Math.abs((bars[0].ornament[0] / bars[0].ornament[3])
    - (expandedCorners[0] / expandedCorners[3])) < 0.02,
  `folded ${bars[0].ornament[3]}x${bars[0].ornament[0]}, expanded ${expandedCorners[3]}x${expandedCorners[0]}`);

console.log('\nUnfolding');
await page.evaluate(() => {
  document.querySelector('#quests [data-iw-collapse]').click();
});
await page.waitForTimeout(300);
const survey3 = await survey();
const reopened = survey3.find(r => r.key === target);
check('the panel opens again', !reopened.collapsed && reopened.expanded === 'true');
check('every child comes back', reopened.visibleChildren === reopened.childCount,
  `${reopened.visibleChildren} of ${reopened.childCount}`);

await page.close();
await browser.close();

console.log(`\npageerrors: ${errs.length ? errs.join(' | ') : 'none'}`);
if (errs.length) failures += 1;

if (failures) {
  console.error(`\nFAIL collapsible-frames — ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS collapsible-frames');
