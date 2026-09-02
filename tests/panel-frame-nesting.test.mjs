import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';

/**
 * Regression pin for the "panels nest inside layout columns" leaf-vs-container
 * split that ui-system.css draws around every framed surface, and for the
 * freeze-once caches in classifySectionFrames() / classifyActivityPanels()
 * (src/modules/UIFoundation.js) whose stable output that CSS contract depends
 * on.
 *
 * UIFoundation's heading walk and the skills section class both land on the
 * layout columns (the two-column grid, the Inventory-above-Quests wrapper)
 * as well as the real panels. The CSS has to tell them apart purely
 * structurally:
 *
 *   a framed element with NO framed descendant   -> LEAF panel: forged frame,
 *                                                   gold hairline, corner filigree
 *   a framed element WITH a framed descendant     -> layout COLUMN: stripped bare
 *
 * This renders a fixture that puts all three framed selectors
 * ([data-iw-ui="section-frame"], [data-iw-inventory-root="1"],
 * .fs-skills-section-frame[data-iw-skills-ui-ready="1"]) in both roles and
 * asserts the computed frame treatment each one actually gets.
 *
 * Portability:
 *   - the fixture and its inlined stylesheets are resolved from the repo the
 *     same way build-tools/render-fixtures.mjs does (HERE/.. as ROOT, real
 *     src/styles + file:// asset URLs) and written under os.tmpdir();
 *   - Chromium comes from Playwright's bundled build (chromium.executablePath()),
 *     overridable via IW_CHROMIUM_PATH for CI images that ship their own.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ASSET_URL = pathToFileURL(resolve(ROOT, 'assets')).href + '/';

const loadStyle = async name => (await readFile(resolve(ROOT, 'src/styles', `${name}.css`), 'utf8'))
  .replaceAll('../assets/', ASSET_URL);

const sheets = (await Promise.all(['base', 'inventory', 'ui-system'].map(loadStyle)))
  .map((css, i) => `<style id="iw-sheet-${i}">${css}</style>`)
  .join('\n');

// A framed COLUMN is any framed element that contains another framed element;
// a framed PANEL is a leaf. The fixture below is 4 columns wrapping 5 leaves,
// with every selector form (section-frame / inventory-root / skills-section)
// appearing in both roles.
const fixture = `<!doctype html><html><head><meta charset="utf-8">
${sheets}
<style>body { margin: 0; padding: 24px; background: #0c0b09; }</style>
</head><body>

<div data-iw-ui="section-frame" data-iw-nest-role="grid-column">
  <div data-iw-inventory-root="1" data-iw-nest-role="inventory-quests-stack">
    <section data-iw-ui="section-frame" data-iw-panel="inventory">
      <h2 data-iw-ui="section-title">Inventory</h2>
      <p>Iron Sword, Mythril Sword, Voidglass Gloves, Thalassic Shield and more,
         enough body text and enough child nodes to read as a real panel.</p>
      <div><button>Equip</button><button>List</button><button>Lock</button></div>
    </section>
    <section data-iw-ui="section-frame" data-iw-panel="quests">
      <h2 data-iw-ui="section-title">Quests</h2>
      <p>Slay the Bone Marauder. Prospect Moonsteel Ore. Deliver to the
         quartermaster before the tide turns.</p>
      <div><button>Track</button><button>Abandon</button></div>
    </section>
  </div>
  <div class="fs-skills-section-frame" data-iw-skills-ui-ready="1" data-iw-nest-role="skills-column">
    <section data-iw-ui="section-frame" data-iw-panel="skill-actions">
      <h2 data-iw-ui="section-title">Skill Actions</h2>
      <p>Mine Copper Ore, Forge Iron Sword, Harvest Duskroot, Brew ATK Potion.</p>
      <div><button>Start</button><button>Queue</button></div>
    </section>
  </div>
</div>

<div data-iw-ui="section-frame" data-iw-nest-role="activity-column">
  <section data-iw-ui="section-frame" data-iw-panel="current-action">
    <h2 data-iw-ui="section-title">Current Action</h2>
    <p>Prospect Moonsteel Ore — 6457 crafts left before the next queued action.</p>
    <div role="progressbar" aria-valuenow="48" aria-valuemax="100"><div style="width:48%"></div></div>
  </section>
  <section data-iw-ui="section-frame" data-iw-panel="action-log">
    <h2 data-iw-ui="section-title">Action Log</h2>
    <p>Prospect Moonsteel Ore completed. Salvage Material x28. XP jewelcrafting +1387.</p>
    <div><button>View All</button></div>
  </section>
</div>

</body></html>`;

const OUT = resolve(os.tmpdir(), 'iw-panel-frame-nesting');
await mkdir(OUT, { recursive: true });
const fixturePath = resolve(OUT, 'nest-inlined.html');
await writeFile(fixturePath, fixture, 'utf8');

let executablePath;
try {
  executablePath = process.env.IW_CHROMIUM_PATH || chromium.executablePath();
} catch {
  executablePath = process.env.IW_CHROMIUM_PATH || undefined;
}

const b = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  ignoreDefaultArgs: ['--headless=old'],
  // A cold first launch on a loaded box (right after the jsdom suite) can
  // outrun Playwright's 30s default.
  timeout: 120000,
});
const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.4 });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(pathToFileURL(fixturePath).href, { waitUntil: 'load', timeout: 60000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
await p.screenshot({ path: resolve(OUT, 'nest.png'), fullPage: true });

const res = await p.evaluate(() => {
  const FRAMED = '[data-iw-ui="section-frame"], [data-iw-inventory-root="1"], .fs-skills-section-frame[data-iw-skills-ui-ready="1"]';
  const all = [...document.querySelectorAll(FRAMED)];
  return all.map(el => {
    const cs = getComputedStyle(el);
    const af = getComputedStyle(el, '::after');
    const bf = getComputedStyle(el, '::before');
    const isColumn = !!el.querySelector(FRAMED);
    const label = el.dataset.iwNestRole
      || (el.querySelector('[data-iw-ui="section-title"]')?.textContent || '').trim()
      || el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') || el.tagName.toLowerCase();
    return {
      label: isColumn ? `COLUMN (${label || el.tagName.toLowerCase()})` : `PANEL  ${label}`,
      isColumn,
      border: cs.borderTopWidth,
      padding: cs.paddingTop,
      hasTexture: cs.backgroundImage.includes('skills_panel_texture'),
      corners: af.borderImageSource !== 'none' && af.content !== 'none',
      hairline: bf.content !== 'none',
    };
  });
});

let fail = 0;
console.log('element                              border  pad   texture corners hairline   verdict');
console.log('-'.repeat(92));
for (const r of res) {
  const wantFrame = !r.isColumn;
  const got = r.hasTexture && r.corners && r.hairline && r.border !== '0px';
  const bare = !r.hasTexture && !r.corners && !r.hairline && r.border === '0px';
  const ok = wantFrame ? got : bare;
  if (!ok) fail += 1;
  console.log(
    r.label.padEnd(36) +
    r.border.padEnd(8) + r.padding.padEnd(6) +
    String(r.hasTexture).padEnd(8) + String(r.corners).padEnd(8) + String(r.hairline).padEnd(11) +
    (ok ? 'ok' : '*** FAIL ***')
  );
}
console.log('-'.repeat(92));
const panels = res.filter(r => !r.isColumn).length;
const cols = res.filter(r => r.isColumn).length;
console.log(`${panels} leaf panels framed, ${cols} layout columns stripped`);
if (panels < 3 || cols < 3) {
  console.log('*** fixture did not exercise both cases — check the structure ***');
  fail += 1;
}
console.log('pageerrors:', errs.length ? errs : 'none');
console.log(fail === 0 ? '\nPASS' : `\nFAIL - ${fail} problem(s)`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
