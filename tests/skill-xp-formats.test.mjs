/* The skill card must not depend on the player's XP display format.
 *
 * Curtis, 2026-09-21: with the game's XP display cycled away from the percent
 * form, the V2 card broke. The whole-number counts ("6,676,891/24,850,867")
 * were read as a material, so a Woodcutting card with no materials grew a
 * three-cell grid of doubled numbers, and the compact form ("Lv 71+2 -
 * 5.24M/99.90M XP") was not recognised as the readout at all, so the hero
 * read "Lv —" and the raw line sat in the content column.
 *
 * The readout is PLAYER-FORMATTED data. It is resolved by the game's own
 * title hook first, kept out of every content classifier whatever its shape,
 * and shown in the hero as the game printed it, minus the level and percent
 * the medallion already shows.
 *
 * NEGATIVE CONTROLS (verified 2026-09-21):
 *   - drop the `readouts` guard from `neutraliseIngredients` and the split,
 *     non-button readouts fail on a Woodcutting ingredient grid;
 *   - make `findHookedReadout` return null and use only the strict
 *     LEVEL_PROGRESS_PATTERN, and the compact card fails with "Lv —".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = readFileSync(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');
const settle = ms => new Promise(r => setTimeout(r, ms));
const TITLE = 'title="Click to cycle XP display"';

/* Each readout form, in each DOM shape it could plausibly take live. `xp` is
   what the hero line must show, `lv` what the medallion must show. */
const READOUTS = {
  'percent': { html: `<button ${TITLE}>Lv 64 - 26.9% • 18,174,000 to go</button>`,
    lv: 'Lv 64', xp: '18,174,000 to go' },
  'whole': { html: `<button ${TITLE}>Lv 64 • 6,676,891/24,850,867 XP</button>`,
    lv: 'Lv 64', xp: '6,676,891 / 24,850,867 XP' },
  'compact': { html: `<button ${TITLE}>Lv 71+2 - 5.24M/99.90M XP</button>`,
    lv: 'Lv 71+2', xp: '5.24M / 99.90M XP' },
  'whole, split in button': {
    html: `<button ${TITLE}>Lv 64 • <span>6,676,891/24,850,867</span> <span>XP</span></button>`,
    lv: 'Lv 64', xp: '6,676,891 / 24,850,867 XP' },
  'whole, split, not a button': {
    html: `<p ${TITLE}><span>Lv 64 • </span><span>6,676,891/24,850,867</span><span>XP</span></p>`,
    lv: 'Lv 64', xp: '6,676,891 / 24,850,867 XP' },
  'whole, split, no title': {
    html: '<div><span>Lv 64 • </span><span>6,676,891/24,850,867</span><span> XP</span></div>',
    lv: 'Lv 64', xp: '6,676,891 / 24,850,867 XP' },
  'compact, split, not a button': {
    html: `<div ${TITLE}><span>Lv 71+2</span><span> - </span><span>5.24M/99.90M</span><span> XP</span></div>`,
    lv: 'Lv 71+2', xp: '5.24M / 99.90M XP' },
};

const MATERIALS = [
  { name: 'Moonsteel Building Parts', count: '1220/2800' },
  { name: 'Moonwood', count: '35940/19600' },
  { name: 'Moonsteel Ore', count: '58097/9800' },
];

function page(readout) {
  return `<!doctype html><html><head><title>IdleWorlds</title></head><body>
<div id="root" data-skin="default">
<header id="top-header"><div><h1>BustedCypher</h1></div></header>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><div class="row"><h2>Skill Actions</h2></div>
  <div class="compact-panel" id="woodcutting">
    <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
      <div><p>🪓 Woodcutting</p><p>LV 64</p></div>
      <div>
        <p>🪓 Chop Stormwood</p>
        ${readout}
        <p>194 XP</p>
        <div role="progressbar"><div style="width:26.9%"></div></div>
        <p class="text-red-400">Needs level 65</p>
      </div>
      <div><button><span class="relative z-10">Chop</span></button></div>
    </div>
  </div>
  <div class="compact-panel" id="construction">
    <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
      <div><p>🏗️ Construction</p><p>LV 56</p></div>
      <div>
        <p>Craft Sunforged Building Parts</p>
        ${readout}
        <div>${MATERIALS.map(m => `<p>📦 ${m.name} ${m.count}</p>`).join('')}</div>
        <p>Base reward: +252 construction XP/task</p>
        <div role="progressbar"><div style="width:26.9%"></div></div>
      </div>
      <div><button><span class="relative z-10">Craft Parts</span></button></div>
    </div>
  </div>
</div></div></div></body></html>`;
}

async function boot(readout) {
  const dom = new JSDOM(page(readout), {
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
  window.document.documentElement.setAttribute('data-iw-page-hydrated', '1');
  window.eval(bundle);
  await settle(1400);
  return window;
}

const norm = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const failures = [];

for (const [form, want] of Object.entries(READOUTS)) {
  const window = await boot(want.html);
  const doc = window.document;
  try {
    for (const id of ['woodcutting', 'construction']) {
      const panel = doc.getElementById(id);
      assert.equal(panel.dataset.iwSkillV2, '1', `${form}/${id}: the card never reached the V2 design`);

      const readout = panel.querySelector('[data-iw-skill-role="level-progress"]');
      assert.ok(readout, `${form}/${id}: the XP readout was not recognised`);

      /* Nothing inside or around the readout may be read as a material. */
      for (const src of panel.querySelectorAll('[data-iw-ingr]')) {
        assert.ok(!src.contains(readout) && !readout.contains(src),
          `${form}/${id}: the readout was marked as an ingredient source ("${norm(src)}")`);
      }
      const cells = [...panel.querySelectorAll('.fs-skill-ingredient-item, .iw-skill-v2-body-row')].map(norm);
      for (const cell of cells) {
        assert.ok(!/24,850,867|99\.90M|6,676,891|5\.24M/.test(cell),
          `${form}/${id}: XP counts leaked into the materials ("${cell}")`);
      }

      /* The hero: level from the readout, XP under the discipline name. */
      assert.equal(norm(panel.querySelector('.iw-skill-v2-level')), want.lv, `${form}/${id}: medallion level`);
      const line = panel.querySelector('[data-iw-skill-zone="identity"] > [data-iw-skill-v2-xp]');
      assert.ok(line, `${form}/${id}: no hero XP line`);
      assert.equal(norm(line), want.xp, `${form}/${id}: hero XP line`);

      /* The line forwards to the game's own control, and only that. */
      let clicks = 0;
      readout.addEventListener('click', () => { clicks += 1; });
      line.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      line.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      line.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      assert.equal(clicks, 2, `${form}/${id}: click/Enter should each cycle the game's readout once`);
    }

    /* A card with no materials must have no grid at all. */
    const wood = doc.getElementById('woodcutting');
    assert.equal(wood.querySelectorAll('.fs-skill-ingredient-item').length, 0,
      `${form}: Woodcutting has no materials but grew an ingredient grid`);

    /* The crafting card keeps exactly its real materials. */
    const cells = [...doc.getElementById('construction').querySelectorAll('.fs-skill-ingredient-item')].map(norm);
    assert.equal(cells.length, MATERIALS.length, `${form}: construction cells ${JSON.stringify(cells)}`);
    MATERIALS.forEach((m, i) => assert.ok(cells[i].includes(m.name) && cells[i].endsWith(m.count),
      `${form}: construction cell ${i} "${cells[i]}"`));
  } catch (error) {
    failures.push(error.message);
  }
  window.close();
}

if (failures.length) {
  for (const message of failures) console.error('FAIL ' + message);
  process.exit(1);
}
console.log(`skill-xp-formats: ${Object.keys(READOUTS).length} XP display shapes keep the card intact`);
