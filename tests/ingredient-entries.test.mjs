/* Where a material line is CUT into cells, and the invariant that keeps the
 * skin's copied text out of its own input.
 *
 * Curtis, 2026-09-16: after refreshing a tab that had been idle, a skill card
 * rendered its own copy run together and repeated down three columns, wrapped
 * mid-number. Three columns and a mid-number wrap are `.iw-skill-v2-body`'s
 * 3-column grid and `.iw-skill-v2-body-row`'s `overflow-wrap: anywhere`, so
 * whatever went wrong went wrong in the text those cells are BUILT from.
 *
 * `ingredientEntries` anchored each cell at the last `•` or `\n` before its
 * count. Every fixture in this repo carried the one shape that makes those
 * anchors work — all materials on one line, in ONE text node, bullet-separated
 * — so no suite could see that neither anchor is reliable live:
 *
 *   - docs/traps quotes the game's own lines with an EMOJI per material
 *     ("📦 Bloodstone Building Parts 298/2600"), not a bullet;
 *   - `textContent` NEVER inserts a newline between elements, so materials
 *     shipped as separate nodes concatenate into one unbroken string.
 *
 * With neither anchor present `lastIndexOf` returns -1 and every cell starts at
 * offset 0, so each one holds the whole run-up to its own count and the last
 * holds the line's entire copy. The fix adds two anchors that are always there:
 * the end of the previous count, and the element boundary.
 *
 * NEGATIVE CONTROL (verified): restore `Math.max(bulletStart, lineStart)` in
 * `entryStart` and the emoji, split-<p> and split-<span> cases all fail with
 * the last cell holding the whole line — the bullet case keeps passing, which
 * is exactly why this defect survived.
 *
 * The containment check at the end is the class of bug, not this instance: the
 * skin copies text from game nodes into nodes of its own in three places, and
 * every one of them is only safe while its SOURCE is not an ancestor of its
 * TARGET. Nothing in the code enforces that, and a violation feeds a cell's own
 * text back into its input on every flush.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = readFileSync(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');
const settle = ms => new Promise(r => setTimeout(r, ms));

/* The same three materials in the four shapes the line is known to take. Only
   the first has ever been covered. */
const SHAPES = {
  bullets: '<p>• Moonsteel Building Parts 1220/2800 • Moonwood 35940/19600 • Moonsteel Ore 58097/9800</p>',
  emoji: '<p>📦 Moonsteel Building Parts 1220/2800 🌳 Moonwood 35940/19600 🪨 Moonsteel Ore 58097/9800</p>',
  splitParagraphs: '<div><p>📦 Moonsteel Building Parts 1220/2800</p><p>🌳 Moonwood 35940/19600</p><p>🪨 Moonsteel Ore 58097/9800</p></div>',
  splitSpans: '<div><span>📦 Moonsteel Building Parts 1220/2800</span><span>🌳 Moonwood 35940/19600</span><span>🪨 Moonsteel Ore 58097/9800</span></div>',
};

const EXPECTED = [
  { name: 'Moonsteel Building Parts', count: '1220/2800', state: 'unmet' },
  { name: 'Moonwood', count: '35940/19600', state: 'met' },
  { name: 'Moonsteel Ore', count: '58097/9800', state: 'met' },
];

function page(materials) {
  return `<!doctype html><html><head><title>IdleWorlds</title></head><body>
<div id="root" data-skin="default">
<header id="top-header"><div><h1>BustedCypher</h1></div></header>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><div class="row"><h2>Skill Actions</h2></div>
  <div class="compact-panel" id="construction">
    <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
      <div><p>🏗️ Construction</p><p>LV 56</p></div>
      <div>
        <p>Craft Sunforged Building Parts</p>
        <button title="Click to cycle XP display">Lv 56 - 55.9% • 4,120 to go</button>
        ${materials}
        <p>Missing materials — will queue (gather first)</p>
        <p class="text-red-400">Requires Construction Lv 80</p>
        <p>Base reward: +252 construction XP/task</p>
        <div role="progressbar"><div style="width:55.9%"></div></div>
      </div>
      <div><button><span class="relative z-10">Craft Parts</span></button></div>
    </div>
  </div>
</div></div></div></body></html>`;
}

async function boot(materials) {
  const dom = new JSDOM(page(materials), {
    url: 'https://idleworlds.com/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.fetch = () => Promise.reject(new Error('offline fixture'));
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  const store = new Map();
  window.chrome = {
    runtime: { id: 'test', getURL: p => `chrome-extension://test/${p}` },
    storage: {
      local: {
        get: async k => (store.has(k) ? { [k]: store.get(k) } : {}),
        set: async b => { for (const [k, v] of Object.entries(b)) store.set(k, v); },
        remove: async k => { store.delete(k); },
      },
      onChanged: { _l: [], addListener(f) { this._l.push(f); }, removeListener(f) { this._l = this._l.filter(x => x !== f); } },
    },
  };
  window.CSS = { highlights: new Map() };
  window.Highlight = class extends Set { constructor(...r) { super(r); } };
  window.eval(bundle);
  await settle(1400);
  return window;
}

const failures = [];
for (const [shape, materials] of Object.entries(SHAPES)) {
  const window = await boot(materials);
  const panel = window.document.getElementById('construction');
  const cells = [...panel.querySelectorAll('.fs-skill-ingredient-item')];

  try {
    assert.equal(cells.length, EXPECTED.length,
      `${shape}: expected ${EXPECTED.length} ingredient cells, got ${cells.length}`);

    cells.forEach((cell, i) => {
      const text = cell.textContent.replace(/\s+/g, ' ').trim();
      const want = EXPECTED[i];
      /* One material per cell. The count must be the cell's TAIL and the name
         its head; a cell that swallowed the run-up holds the earlier
         materials' copy as well, which is the whole defect. */
      assert.ok(text.endsWith(want.count), `${shape}: cell ${i} should end at its own count, got "${text}"`);
      assert.ok(text.includes(want.name), `${shape}: cell ${i} should name ${want.name}, got "${text}"`);
      for (const other of EXPECTED) {
        if (other === want) continue;
        assert.ok(!text.includes(other.name),
          `${shape}: cell ${i} swallowed "${other.name}" — anchored at the start of the blob, not at its own material ("${text}")`);
      }
      /* Met/unmet is the game's own arithmetic and is what rule 5 protects. */
      assert.equal(cell.dataset.iwIngredientState, want.state,
        `${shape}: cell ${i} state should be ${want.state}`);
    });

    /* The V2 frame copies those cells into its own rows, so a swallowed cell
       is what actually reaches the screen. */
    const rows = [...panel.querySelectorAll('.iw-skill-v2-body-row')]
      .map(el => el.textContent.replace(/\s+/g, ' ').trim());
    assert.equal(rows.length, EXPECTED.length, `${shape}: expected ${EXPECTED.length} body rows, got ${rows.length}`);
    for (const row of rows) {
      assert.ok(row.length <= 60, `${shape}: body row is a run-together blob (${row.length} chars): "${row.slice(0, 120)}"`);
    }

    /* The class of bug, not this instance. Every place the skin writes text it
       read from a game node is safe only while the source is not an ancestor
       of the target; a violation concatenates the previous pass forever. */
    const PAIRS = [
      ['[data-iw-ingr]', '[data-iw-skill-ingredient-list]', 'an ingredient source contains its own generated list'],
      ['[data-iw-skill-v2-section]', '[data-iw-skill-v2-body]', 'a marked section contains the V2 body built from it'],
      ['[data-iw-skill-v2-section]', '[data-iw-skill-v2-req-note]', 'a marked section contains the requirement note copied from it'],
    ];
    for (const [srcSel, dstSel, why] of PAIRS) {
      for (const src of panel.querySelectorAll(srcSel)) {
        for (const dst of panel.querySelectorAll(dstSel)) {
          assert.ok(src === dst || !src.contains(dst), `${shape}: ${why}`);
        }
      }
    }
  } catch (error) {
    failures.push(error.message);
  }
  window.close();
}

if (failures.length) {
  for (const message of failures) console.error('FAIL ' + message);
  process.exit(1);
}
console.log(`ingredient-entries: ${Object.keys(SHAPES).length} material-line shapes cut correctly, containment invariant holds`);
