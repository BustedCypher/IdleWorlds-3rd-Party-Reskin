/**
 * Viewport-swap regression.
 *
 * IdleWorlds ships its whole panel stack TWICE: a wide `hidden xl:grid`
 * two-column section and a narrow `xl:hidden` single-column section, and
 * Tailwind swaps which one is actually rendering at its `xl` breakpoint
 * (1280px) — see claude/probe-panel-order.js, which confirmed this live, and
 * V1.6.0_MOBILE_LAYOUT_AUDIT.md.
 *
 * UIFoundation's section-frame / boss-card / activity-panel classifiers used
 * to pick which copy is real with a static `[class~="xl:hidden"]` string
 * test. That test is only correct ABOVE 1280px — below it, the "hidden
 * duplicate" is the one actually on screen, and the class test excludes the
 * WRONG column: the skin decorated the invisible copy and left the real one
 * bare. Two failure modes, both pinned below:
 *
 *   1. COLD BOOT below 1280px never decorates anything in the panel columns
 *      (section frames, activity panels, boss cards) at all.
 *   2. RESIZE across 1280px in either direction — even with the boot-time
 *      predicate fixed — left every classifier's cached resolution pointing
 *      at whichever column was live when it first resolved, because a
 *      viewport crossing mutates nothing and DOMWatcher's MutationObserver
 *      never sees it.
 *
 * The fix is Viewport.js (isRendered/preferRendered/pickRendered replacing
 * the class test; startLayoutWatch/getLayoutEpoch invalidating cached
 * resolutions on a real Tailwind breakpoint crossing via `matchMedia`) wired
 * into UIFoundation.js and DOMWatcher.js.
 *
 * This is a REAL BROWSER test (Playwright), not jsdom: the bug and the fix
 * both live in actual CSS layout (`display:none` from a media query,
 * `checkVisibility()`, `matchMedia` change events), none of which jsdom
 * renders.
 *
 * Negative control: this test is not vacuous. Reverting any one of —
 *   - the `preferRendered`/`pickRendered` calls in UIFoundation.js back to a
 *     bare `[class~="xl:hidden"]` exclusion,
 *   - the `entry.epoch === getLayoutEpoch()` checks in
 *     `*ResolutionValid`,
 *   - the `startLayoutWatch(...)` wiring in DOMWatcher.js's `startWatcher()`,
 * — reproduces failures 1 and/or 2 above and this test fails. Verified this
 * session by running it against the pre-fix source.
 */

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* One panel stack, reused for both layout columns. Minimal but real enough to
   exercise section frames, activity panels (Current Action / Action Log) and
   World Boss cards — the three UIFoundation surfaces that resolve INSIDE the
   duplicated columns. Inventory/Skills are deliberately omitted: their own
   resolution strategies (containment, event-driven) are already
   viewport-correct by construction (see the audit), so they are not part of
   this regression's blast radius. */
const stack = tag => `
  <div class="panel" data-col="${tag}">
    <h2>Current Action</h2>
    <div><strong>Prospect Moonsteel Ore</strong></div>
    <div role="progressbar" aria-valuenow="48" aria-valuemax="100"><div style="width:48%"></div></div>
  </div>
  <div class="panel" data-col="${tag}">
    <h2>Action Log</h2>
    <div><article><div><span>System</span><time>12:33:37</time></div><p>Prospect completed.</p></article></div>
  </div>
  <div class="panel" data-col="${tag}">
    <h2>World Bosses</h2>
    <div class="compact-panel"><p>Ancient Treant</p><button>Attack</button></div>
  </div>`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>
  *,::before,::after{box-sizing:border-box;border:0 solid}
  svg{display:block}button{background:none;font:inherit;color:inherit}
  .hidden{display:none}.grid{display:grid}.flex{display:flex}.items-center{align-items:center}
  .gap-2{gap:.5rem}.gap-3{gap:.75rem}.relative{position:relative}
  .panel{padding:8px;margin-bottom:8px}body{margin:0}
  /* The game's actual Tailwind \`xl\` breakpoint. This is the number the fix
     must key off, whether directly or (as Viewport.js does) by watching
     rendered state rather than hardcoding it. */
  @media (min-width:1280px){.xl\\:grid{display:grid}.xl\\:hidden{display:none}}
</style></head><body>
<div id="root" data-skin="default">
  <header><div><h1>BustedCypher</h1><p>Combat Lv 62</p><p>Players online: 145</p></div>
  <div><button>1</button></div></header>
  <nav><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button></nav>
  <div><p>Zone 19: Eternium Verge</p><button>Zones</button><button>Previous Zone</button><button>Next Zone</button></div>
  <section class="hidden xl:grid gap-3" id="wide">${stack('wide')}</section>
  <section class="grid gap-3 xl:hidden" id="narrow">${stack('narrow')}</section>
</div>
<script>${bundle}</` + `script></body></html>`;

const OUT = resolve(os.tmpdir(), 'iw-viewport-swap');
await mkdir(OUT, { recursive: true });
const fixturePath = resolve(OUT, 'viewport-swap.html');
await writeFile(fixturePath, PAGE, 'utf8');

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

/** Which column is actually decorated right now, and by how much. */
async function measure(page) {
  return page.evaluate(() => {
    const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const col = id => {
      const root = document.getElementById(id);
      return {
        onScreen: vis(root),
        frame: root.querySelectorAll('[data-iw-ui="section-frame"]').length,
        panel: root.querySelectorAll('[data-iw-panel]').length,
        boss: root.querySelectorAll('[data-iw-boss="card"]').length,
      };
    };
    return { wide: col('wide'), narrow: col('narrow') };
  });
}

function decorated(c) {
  return c.frame + c.panel + c.boss;
}

const errs = [];

/* ── 1. Cold boot below 1280px must decorate the narrow (visible) column ── */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(400);
  const r = await measure(page);
  console.log('\n1. Cold boot @390px (phone)');
  check('wide (offscreen) column has NO section frames', r.wide.frame === 0, `got ${r.wide.frame}`);
  check('wide (offscreen) column has NO activity panels', r.wide.panel === 0, `got ${r.wide.panel}`);
  check('wide (offscreen) column has NO boss cards', r.wide.boss === 0, `got ${r.wide.boss}`);
  check('narrow (visible) column IS decorated', decorated(r.narrow) > 0, `got ${JSON.stringify(r.narrow)}`);
  await page.close();
}

/* ── 2. Resize DOWN across 1280px must move decoration to the narrow column ── */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(300);
  const before = await measure(page);
  console.log('\n2. Resize 1400px -> 800px (desktop -> tablet)');
  check('boot @1400px decorates the wide column', decorated(before.wide) > 0, `got ${JSON.stringify(before.wide)}`);

  await page.setViewportSize({ width: 800, height: 900 });
  // No DOM mutation is triggered by a resize; only the matchMedia listener
  // Viewport.startLayoutWatch registers can react. Give it one tick.
  await page.waitForTimeout(300);
  const after = await measure(page);
  check('wide column is FULLY undecorated after the resize', decorated(after.wide) === 0, `got ${JSON.stringify(after.wide)}`);
  check('narrow column is decorated after the resize', decorated(after.narrow) > 0, `got ${JSON.stringify(after.narrow)}`);
  check('narrow column decoration matches the wide column\'s pre-resize count',
    decorated(after.narrow) === decorated(before.wide),
    `before(wide)=${decorated(before.wide)} after(narrow)=${decorated(after.narrow)}`);
  await page.close();
}

/* ── 3. Resize UP across 1280px, and back down again — bidirectional, repeatable ── */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(300);

  console.log('\n3. Round-trip resize: 1400 -> 800 -> 1400 -> 500 -> 1600');
  const widths = [800, 1400, 500, 1600];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    const r = await measure(page);
    const on = r.wide.onScreen ? r.wide : r.narrow;
    const off = r.wide.onScreen ? r.narrow : r.wide;
    check(`@${w}px: visible column decorated, hidden column clean`,
      decorated(on) > 0 && decorated(off) === 0,
      `visible=${JSON.stringify(on)} hidden=${JSON.stringify(off)}`);
  }
  await page.close();
}

console.log('\npageerrors:', errs.length ? errs : 'none');
check('no page errors', errs.length === 0, errs.join('; '));

console.log(failures === 0 ? '\nPASS viewport-swap' : `\nFAIL viewport-swap — ${failures} problem(s)`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
