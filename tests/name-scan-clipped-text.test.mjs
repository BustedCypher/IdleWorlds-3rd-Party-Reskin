/**
 * NameScanner: an item name scrolled out of an overflow container must not
 * open the item card.
 *
 * Live report (2026-09-21): in World Chat, a message naming "Stormsilk
 * Gloves+2" had scrolled up out of the list, yet hovering the empty panel area
 * above the list opened that item's card. A Range keeps its UNCLIPPED client
 * rects, so the scrolled-away word still geometrically "sat" over the panel's
 * heading area, and `hitTest`'s fallback - which walks the whole subtree of the
 * element under the pointer - found it there.
 *
 * Real Chromium, because the bug is overflow clipping and hit-testing, which
 * jsdom does not model.
 *
 * Checks: (1) hovering where the clipped word's rect lies opens nothing;
 * (2) positive control - the same word, scrolled back into view and hovered,
 * does open the card, so check 1 cannot pass by the scanner being dead.
 * Negative control: drop the `textPaintedAt` guard in NameScanner.hitInTextNode
 * and check 1 fails.
 */
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const compiled = await build({
  stdin: {
    contents: `
      import { ItemDatabase } from './src/modules/ItemDatabase.js';
      import { initTooltipEngine, isTooltipOpen } from './src/modules/TooltipEngine.js';
      import { scanForItemNames } from './src/modules/NameScanner.js';
      window.__iw = { ItemDatabase, initTooltipEngine, isTooltipOpen, scanForItemNames };
    `,
    resolveDir: ROOT,
  },
  bundle: true, write: false, format: 'iife', loader: { '.css': 'text', '.json': 'json' },
});

const PAGE = `<!doctype html><html><head><style>
  body { margin: 0; font: 16px/20px sans-serif; }
  #panel { position: absolute; left: 0; top: 0; width: 600px; padding: 0 0 0 0; }
  #panel h2 { display: inline-block; margin: 0; height: 100px; width: 120px; font-size: 16px; }
  #list { height: 100px; overflow-y: auto; }
  #list p { margin: 0; height: 20px; }
</style></head><body>
  <div id="panel">
    <h2>World Chat</h2>
    <div id="list">
      <p id="first"><span class="who">Alex</span> <span id="msg">upgraded Stormsilk Gloves+2 to +3</span></p>
      ${Array.from({ length: 30 }, (_, i) => `<p>filler line ${i}</p>`).join('')}
    </div>
  </div>
</body></html>`;

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
function check(label, cond, detail = '') {
  if (cond) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(PAGE);
  await page.addScriptTag({
    content: `window.chrome = { runtime: { id: 'test', getURL: p => p },
      storage: { local: { get: async () => ({}), set: async () => {} } } };`,
  });
  await page.addScriptTag({ content: compiled.outputFiles[0].text });

  // Seed the item index directly: the scanner only needs `all()` + `revision()`.
  const matched = await page.evaluate(() => {
    const { ItemDatabase, initTooltipEngine, scanForItemNames } = window.__iw;
    const item = { item_id: 'stormsilk_gloves_2', name: 'Stormsilk Gloves+2', category: 'Equipment' };
    ItemDatabase._items = [item];
    ItemDatabase._byId = new Map([[item.item_id, item]]);
    ItemDatabase._byName = new Map([[item.name.toLowerCase(), item]]);
    ItemDatabase._revision = 1;
    initTooltipEngine();
    return scanForItemNames(document.body);
  });
  check('the scanner indexed the chat line', matched === 1, `matched ${matched}`);

  /** Centre of the item name's first client rect. */
  const wordPoint = () => page.evaluate(() => {
    const text = document.getElementById('msg').firstChild;
    const at = text.nodeValue.indexOf('Stormsilk');
    const range = document.createRange();
    range.setStart(text, at);
    range.setEnd(text, at + 'Stormsilk Gloves+2'.length);
    const r = range.getClientRects()[0];
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const settle = () => page.waitForTimeout(400);
  const isOpen = () => page.evaluate(() => window.__iw.isTooltipOpen());

  /* 1. Scroll the line out of the list, then hover where its rect now lies. */
  await page.evaluate(() => { document.getElementById('list').scrollTop = 60; });
  const hidden = await wordPoint();
  const under = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.id || el.tagName : null;
  }, hidden);
  check('the clipped word\'s rect lies over the panel, not the list', under === 'panel', `element at point: ${under}`);
  await page.mouse.move(hidden.x - 5, hidden.y);
  await page.mouse.move(hidden.x, hidden.y);
  await settle();
  check('hovering a scrolled-away item name opens no card', (await isOpen()) === false);

  /* 2. Positive control: the same word, visible again, does open the card. */
  await page.mouse.move(790, 590);
  await page.evaluate(() => { document.getElementById('list').scrollTop = 0; });
  await settle();
  const shown = await wordPoint();
  await page.mouse.move(shown.x - 5, shown.y);
  await page.mouse.move(shown.x, shown.y);
  await settle();
  check('hovering the visible item name opens its card', (await isOpen()) === true);

  check('no page errors', errors.length === 0, errors.join('; '));
} finally {
  await browser.close();
}

if (failures) {
  console.error(`name-scan-clipped-text: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('name-scan-clipped-text: a scrolled-away item name opens no card; a visible one still does');
