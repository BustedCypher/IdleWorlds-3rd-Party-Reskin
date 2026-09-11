/**
 * Quest command rail: the frame follows the LABEL.
 *
 * A work order's turn-in reads "Turn In All (38)" and the count is live, so
 * this is the one control on the page whose label length is the game's to
 * choose. Two halves of one fix are pinned here:
 *
 *   1. CSS. The button used to be `aspect-ratio: 264/75` over a 148px floor
 *      with a FIXED `padding: 0 20px`, while the frame's end flourishes are a
 *      FRACTION of the box (12.9% each side) — so past ~155px the horns walked
 *      inward over the label and the text ran out of the frame. The height is
 *      the fixed axis now and the width follows the label; the art is drawn as
 *      three bands so only its flat middle stretches.
 *
 *   2. JS. Below 640px skillpanel.css takes the command block OUT OF FLOW
 *      (it is the last child in the DOM, so a float cannot lift it beside the
 *      earlier text the way the live card does) and the text lines reserve
 *      room for it by hand. That reserve was hard-coded at 116px, which was
 *      right only while the block's width was fixed. QuestPanelRenderer now
 *      measures the block and publishes `--fs-quest-cmd-w` on the card.
 *
 * REAL BROWSER (Playwright), not jsdom: both halves are layout — a shrink-to-
 * fit box, an absolutely positioned sibling and a getBoundingClientRect() that
 * jsdom answers with zeros (which is also why the smoke test cannot carry
 * this).
 *
 * The page is served over a ROUTED http origin rather than from file://,
 * because `assetUrl()` falls back to a relative path outside the extension and
 * a file:// page cannot fetch it (opaque origin). Without the atlas index the
 * panel never gains `data-iw-skills-ui-ready`, the button keeps its fallback
 * padding instead of the frame's cap width, and the narrow case stops growing
 * at all — the test would then pass or fail for the wrong reason. The art
 * itself (which band window lands on which source rect) is
 * build-tools/render-fixtures.mjs's half.
 *
 * Negative controls, both verified by reverting the source:
 *   - pin the button back to `width: 116px !important; max-width: 116px` and
 *     "the frame grows with the label" fails;
 *   - drop `measureCommandBlock()` (or its call) and the reserve falls back to
 *     116px against a ~160px block, so "the title clears the command block"
 *     fails by ~30px.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* Two work orders, identical but for the turn-in label — so the comparison
   below is about the label and nothing else. Shape is the live card's:
   content column and command block are siblings of one row, and the command
   block is LAST (which is why the narrow layout has to position it out of
   flow rather than float it). */
const card = (id, turnIn) => `
  <div class="compact-panel p-2.5" id="${id}">
    <div class="space-y-2">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Crafting Work Order</p>
          <p class="text-xs font-semibold text-white" data-title>Craft and turn in 38 Ironwood Planks.</p>
          <p class="mt-1 text-[11px] text-white/45">Ironwood Plank 38/38</p>
          <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +12,480g &bull; +9720 crafting XP</p>
        </div>
        <div class="flex shrink-0 flex-col gap-2" style="min-width:0px">
          <button>${turnIn}</button>
          <button>Skip (8)</button>
        </div>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 100%"></div></div>
      <div class="text-[11px] text-white/45">100% complete</div>
    </div>
  </div>`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>
  *,::before,::after{box-sizing:border-box;border:0 solid}
  svg{display:block}button{background:none;font:inherit;color:inherit}
  body{margin:0}.panel{padding:8px}.flex{display:flex}.flex-col{flex-direction:column}
  .items-start{align-items:flex-start}.justify-between{justify-content:space-between}
  .gap-2{gap:.5rem}.gap-3{gap:.75rem}.flex-1{flex:1 1 0%}.min-w-0{min-width:0}
  .shrink-0{flex-shrink:0}
</style></head><body>
<div id="root" data-skin="default">
  <header><div><h1>BustedCypher</h1><p>Combat Lv 62</p></div><div><button>1</button></div></header>
  <nav><button>Game</button><button>Market</button></nav>
  <div><p>Zone 19: Eternium Verge</p><button>Zones</button></div>
  <div class="panel" id="quests"><h2>Quests</h2>
    ${card('short', 'Turn In')}
    ${card('long', 'Turn In All (38)')}
  </div>
</div>
<script>${bundle}</` + `script></body></html>`;

const PAGE_URL = 'http://iw.test/quest-command-width.html';
const MIME = {
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

/** Serve the page and every relative asset the skin asks for out of the repo,
 *  so SkillsArtService really resolves the atlas index. */
async function serve(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://iw.test') return route.abort();
    if (url.pathname === '/quest-command-width.html') {
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

/** Geometry of one card's command rail, its turn-in and its title. */
async function measure(page) {
  return page.evaluate(() => {
    const read = id => {
      const cardEl = document.getElementById(id);
      const commands = cardEl.querySelector('[data-iw-quest-zone="commands"]');
      const turnIn = cardEl.querySelector('[data-iw-quest-role="turn-in"]');
      const title = cardEl.querySelector('[data-iw-quest-role="title"]');
      const box = el => {
        const r = el.getBoundingClientRect();
        return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) };
      };
      return {
        classified: cardEl.classList.contains('fs-quest-panel'),
        cmdVar: cardEl.style.getPropertyValue('--fs-quest-cmd-w'),
        commands: commands ? box(commands) : null,
        turnIn: turnIn ? box(turnIn) : null,
        // The title's own content edge, i.e. where its text may actually reach.
        titleTextRight: title
          ? +(title.getBoundingClientRect().right - parseFloat(getComputedStyle(title).paddingRight)).toFixed(1)
          : null,
      };
    };
    return { short: read('short'), long: read('long') };
  });
}

/* ── Narrow layout (the reported case: the command block is out of flow) ── */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errs.push(String(e)));
  await serve(page);
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll('.fs-quest-panel[data-iw-skills-ui-ready="1"]').length === 2,
    null, { timeout: 20000 });
  // The measurement is published on a later flush than the classification.
  // Bounded, and NOT fatal: a missing reserve is the regression this file
  // exists for, so it has to reach the checks below as a readable failure
  // rather than as a harness timeout.
  await page.waitForFunction(
    () => [...document.querySelectorAll('.fs-quest-panel')]
      .every(el => el.style.getPropertyValue('--fs-quest-cmd-w')), null, { timeout: 8000 })
    .catch(() => {});
  const r = await measure(page);
  console.log('\n@390px (narrow layout, command block absolute)');

  check('both work orders are classified', r.short.classified && r.long.classified);
  check('each card publishes the command block reserve',
    !!r.short.cmdVar && !!r.long.cmdVar, `${r.short.cmdVar || '(none)'} / ${r.long.cmdVar || '(none)'}`);
  check('the frame grows with the label instead of clipping it',
    r.long.turnIn.width > r.short.turnIn.width + 1,
    `short ${r.short.turnIn.width} vs long ${r.long.turnIn.width}`);
  check('growing sideways only — the button height is unchanged',
    Math.abs(r.long.turnIn.height - r.short.turnIn.height) <= 0.6,
    `short ${r.short.turnIn.height} vs long ${r.long.turnIn.height}`);
  check('the published --fs-quest-cmd-w matches the block it measured',
    Math.abs(parseFloat(r.long.cmdVar || 'NaN') - r.long.commands.width) <= 1,
    `${r.long.cmdVar} vs ${r.long.commands.width}px`);
  check('the two cards publish DIFFERENT reserves — the var tracks the label',
    r.short.cmdVar !== r.long.cmdVar, `${r.short.cmdVar} / ${r.long.cmdVar}`);
  check('the title clears the command block on the long card',
    r.long.titleTextRight <= r.long.commands.left + 0.6,
    `title text reaches ${r.long.titleTextRight}, block starts at ${r.long.commands.left}`);
  check('the title clears the command block on the short card',
    r.short.titleTextRight <= r.short.commands.left + 0.6,
    `title text reaches ${r.short.titleTextRight}, block starts at ${r.short.commands.left}`);
  await page.close();
}

/* ── Desktop: same growth, and the rail is in flow so nothing to reserve ── */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => errs.push(String(e)));
  await serve(page);
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll('.fs-quest-panel[data-iw-skills-ui-ready="1"]').length === 2,
    null, { timeout: 20000 });
  const r = await measure(page);
  console.log('\n@1400px (desktop layout)');
  check('the frame grows with the label here too',
    r.long.turnIn.width > r.short.turnIn.width + 1,
    `short ${r.short.turnIn.width} vs long ${r.long.turnIn.width}`);
  check('the short label still rests at the 148px floor',
    Math.abs(r.short.turnIn.width - 148) <= 1, `${r.short.turnIn.width}px`);
  check('both buttons keep the same height',
    Math.abs(r.long.turnIn.height - r.short.turnIn.height) <= 0.6,
    `${r.short.turnIn.height} vs ${r.long.turnIn.height}`);
  await page.close();
}

await browser.close();

console.log(`\npageerrors: ${errs.length ? errs.join(' | ') : 'none'}`);
if (errs.length) failures += 1;

if (failures) {
  console.error(`\nFAIL quest-command-width — ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS quest-command-width');
