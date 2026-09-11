/**
 * Village scene: the plot composition actually LAYS OUT.
 *
 * The scene is five absolutely positioned plots around an absolutely
 * positioned house inside `.iw-vs-scene`, and every one of its failure modes
 * is invisible to jsdom and to a computed-style audit:
 *
 *   1. `.iw-vs-scene` had `max-width` + `margin:auto` but no `width`. Its host
 *      (`[data-iw-ui="section-frame"]`) is `display:flex; flex-direction:column`
 *      and an AUTO cross-axis margin on a flex item cancels the stretch, so the
 *      box fell back to shrink-to-fit — over children that are ALL out of flow,
 *      i.e. to its own 1px border. Every sprite and label was then clipped away
 *      by `overflow:hidden` while `getComputedStyle` still reported a perfectly
 *      correct background, height and position for the box. It read as broken
 *      artwork, not as a collapsed box.
 *   2. The house and the bottom-centre plot share the scene's centre column,
 *      and the plot rises from the floor, so whether they collide depends on
 *      the scene's height at the current width. Nothing in the cascade says
 *      they overlap. The house is anchored to the TOP edge and sized as a
 *      PERCENTAGE of the scene for exactly this reason; a fixed-px house
 *      clears the plot at one height and sits on it at the next.
 *
 * REAL BROWSER (Playwright): both are layout, and the second needs rects that
 * jsdom answers with zeros.
 *
 * The whole bundle boots here rather than the module alone, so this also pins
 * the wiring — UIFoundation's `ui:village-scene` pass, the sheet reaching
 * `ui-system.css`, and the anchor landing directly after the Skill Actions
 * panel. Assets and `/api/player` are served from a routed http origin because
 * `assetUrl()` falls back to a RELATIVE path outside the extension: from
 * file:// the sprites would silently 404 and the plots would measure as empty
 * boxes, which is the same lie the collapse told.
 *
 * Negative controls, verified by reverting the source:
 *   - drop `width:100%` from `.iw-vs-scene` and the scene measures 1px wide;
 *   - grow `.iw-vs-house`'s `height` share from 52% to 75% and it overlaps
 *     plot 5.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* A full village: every plot filled, and the longest building name the game
   ships ("Stormglass Chapel of Healing") in the bottom row, where the captions
   sit closest together. */
const PAYLOAD = {
  player: {
    housing: { tier: 5 },
    villageAddons: {
      totalSlots: 5,
      installed: [
        { slot: 1, itemKey: 'construction_building_tier_11', name: 'Voidiron Archive' },
        { slot: 2, itemKey: 'construction_building_tier_34', name: 'Primordial Wonder' },
        { slot: 3, itemKey: 'construction_building_tier_12', name: 'Celestial Exchange' },
        { slot: 4, itemKey: 'construction_building_tier_17', name: 'Stormglass Chapel of Healing' },
        { slot: 5, itemKey: 'construction_building_tier_33', name: 'Glacirite Royal Treasury' },
      ],
    },
  },
};

/* The dashboard's own left column: the game stacks the panels at
   `minmax(320px,0.42fr)`, so the scene is narrow long before the viewport is. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>
  *,::before,::after{box-sizing:border-box;border:0 solid}
  svg{display:block}button{background:none;font:inherit;color:inherit}
  body{margin:0}.panel{padding:14px}
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
      <div class="panel" id="actions"><h2>Skill Actions</h2><p>Existing action controls remain here.</p></div>
      <div class="panel" id="after"><h2>Action Log</h2><p>Later panels keep their place.</p></div>
    </div>
    <div class="col"><div class="panel"><h2>World Chat</h2><p>Right column.</p></div></div>
  </div>
</div>
<script>${bundle}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const PAGE_URL = `${ORIGIN}/village-scene-layout.html`;
const MIME = {
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

let apiReads = 0;
let apiHeaders = null;
let apiQuery = '';

async function serve(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/village-scene-layout.html') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
    }
    if (url.pathname === '/api/player') {
      apiReads += 1;
      apiHeaders = route.request().headers();
      apiQuery = url.search;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(PAYLOAD) });
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

/** Every box the composition has to keep apart, in viewport coordinates. */
async function measure(page) {
  return page.evaluate(() => {
    const box = el => {
      const r = el.getBoundingClientRect();
      return {
        left: +r.left.toFixed(1), right: +r.right.toFixed(1),
        top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
        width: +r.width.toFixed(1), height: +r.height.toFixed(1),
      };
    };
    const frame = document.querySelector('[data-iw-village-scene]');
    const scene = frame && frame.querySelector('.iw-vs-scene');
    if (!scene) return { scene: null };
    const style = getComputedStyle(frame);
    // clientWidth, not the border-box rect: the section frame draws a 1px
    // border and the scene may only ever fill the CONTENT box.
    const inner = frame.clientWidth
      - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const house = frame.querySelector('.iw-vs-house');
    // The CAPTION is what collides: the sprite above it carries transparent
    // margin the eye forgives, the text does not.
    const caption = [...house.children].filter(el =>
      el.tagName !== 'IMG' && !el.classList.contains('iw-vs-placeholder'));
    return {
      afterActions: document.querySelector('#actions').nextElementSibling === frame,
      beforeNext: frame.nextElementSibling && frame.nextElementSibling.id === 'after',
      innerWidth: +inner.toFixed(1),
      scene: box(scene),
      houseCaption: caption.map(box),
      plots: [...frame.querySelectorAll('.iw-vs-plot')].map(el => ({
        slot: el.dataset.slot, state: el.dataset.plotState, ...box(el),
      })),
      sprites: [...frame.querySelectorAll('img.iw-vs-sprite')]
        .map(img => ({ src: img.src.split('/').pop(), w: img.naturalWidth })),
    };
  });
}

const overlaps = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The scene keeps every plot and the house caption legible at `width`. */
async function run(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => errs.push(String(e)));
  await serve(page);
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-iw-village-scene] .iw-vs-plot').length === 5,
    null, { timeout: 20000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('img.iw-vs-sprite')].every(i => i.complete),
    null, { timeout: 20000 }).catch(() => {});
  const r = await measure(page);

  const tallestPlot = Math.max(...r.plots.map(p => p.height));
  const captionEnds = Math.max(...r.houseCaption.map(l => l.bottom)) - r.scene.top;
  const plotFive = r.plots.find(p => p.slot === '5');
  console.log(`\n@${width}px  scene ${r.scene.width}x${r.scene.height} in a ${r.innerWidth}px column`
    + `\n        tallest plot ${tallestPlot.toFixed(0)}px · house caption ends ${captionEnds.toFixed(0)}px down`
    + ` · plot 5 starts ${(plotFive.top - r.scene.top).toFixed(0)}px down`);
  check('the scene sits directly below Skill Actions', r.afterActions);
  check('the panel that followed Actions still follows the scene', r.beforeNext);
  // The collapse: auto cross-axis margins cancel a flex item's stretch, and
  // every child is out of flow, so shrink-to-fit is the border box alone.
  check('the scene fills its column instead of collapsing to its border',
    r.scene.width >= Math.min(r.innerWidth, 680) - 1,
    `${r.scene.width}px of ${r.innerWidth}px`);
  check('every building sprite decoded',
    r.sprites.length === 6 && r.sprites.every(s => s.w > 0),
    r.sprites.filter(s => !s.w).map(s => s.src).join(', ') || `${r.sprites.length} sprite(s)`);

  for (const plot of r.plots) {
    check(`plot ${plot.slot} stays inside the scene`,
      plot.left >= r.scene.left - 0.6 && plot.right <= r.scene.right + 0.6
      && plot.top >= r.scene.top - 0.6 && plot.bottom <= r.scene.bottom + 0.6,
      `plot ${plot.left}..${plot.right} / ${plot.top}..${plot.bottom}`
      + ` vs scene ${r.scene.left}..${r.scene.right} / ${r.scene.top}..${r.scene.bottom}`);
  }
  for (const line of r.houseCaption) {
    const hit = r.plots.find(p => overlaps(line, p));
    check('the house caption clears every plot', !hit,
      hit && `caption ${line.top}..${line.bottom} meets plot ${hit.slot} ${hit.top}..${hit.bottom}`);
  }
  for (let i = 0; i < r.plots.length; i += 1) {
    for (let j = i + 1; j < r.plots.length; j += 1) {
      check(`plots ${r.plots[i].slot} and ${r.plots[j].slot} keep apart`,
        !overlaps(r.plots[i], r.plots[j]),
        `${r.plots[i].left}..${r.plots[i].right} vs ${r.plots[j].left}..${r.plots[j].right}`);
    }
  }
  await page.close();
}

/* Widths chosen for the two things that fight: the scene is widest (and so
   shortest, relative to its composition) around 760-900, and its plots are
   NARROWEST — so their names wrap tallest — when the dashboard's 0.42fr column
   is itself narrow, around 1000-1400. */
await run(390, 900);
await run(760, 1000);
await run(900, 1000);
await run(1000, 1000);
await run(1200, 1000);
await run(1400, 1000);

console.log('\nThe read');
check('the scene reads the player API', apiReads >= 1, `${apiReads} read(s)`);
check('it asks for a section the app actually ships',
  /section=dashboard/.test(apiQuery) && /scope=core/.test(apiQuery), apiQuery || '(no read)');
// The page patches globalThis.fetch to stamp this header; an isolated world
// never sees that patch, and without it an SSF player gets a standard village.
check('it stamps the league header the app selects on',
  apiHeaders && apiHeaders['x-idleworlds-league'] === 'standard',
  (apiHeaders && apiHeaders['x-idleworlds-league']) || '(absent)');

await browser.close();

console.log(`\npageerrors: ${errs.length ? errs.join(' | ') : 'none'}`);
if (errs.length) failures += 1;

if (failures) {
  console.error(`\nFAIL village-scene-layout — ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS village-scene-layout');
