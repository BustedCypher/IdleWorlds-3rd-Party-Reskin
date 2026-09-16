/**
 * The Village ledger: the numbers, and the disclosure that hides them.
 *
 * Three things here can be wrong without looking wrong:
 *
 *   1. THE JOIN. A building reaches the dashboard as an `itemKey` and a name;
 *      its stats live in items.json. Miss the join and every entry renders with
 *      a heading, a tidy layout and no numbers at all — which is exactly what a
 *      village with no buildings in it also looks like.
 *   2. THE SUM. "Overall stats" is the one figure on the panel a player cannot
 *      check at a glance, so it is pinned against hand-computed totals, and
 *      pinned to EXCLUDE housing: the home's slot count is not an ATK and
 *      adding it would invent a stat the game does not have.
 *   3. THE LATE STORAGE READ. The open/closed choice is read from
 *      chrome.storage AFTER the ledger has already rendered, and a change
 *      carried only by `data-iw-*` drives no mutation record and so no flush —
 *      nothing else will come along and apply it. If that callback is dropped,
 *      every entry silently reopens on the next page load and the panel just
 *      looks like it forgot.
 *
 * Bundled through one esbuild `stdin` entry so the ledger and the item database
 * share ONE module graph: two separate bundles would give two ItemDatabase
 * singletons and `isReady()` would answer for the wrong one.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

const ITEMS = [
  {
    item_id: 'construction_building_tier_11', name: 'Voidiron Archive', tier: 11,
    atk: 4, def: '', xp_per_task: 7, item_find_pct: 8, gold_find_pct: '',
    skill_bonus_skill: 'smithing', skill_bonus_value: 2,
    effects_raw: 'ATK +4, XP +7/task, Smithing Level +2, +8% item find',
  },
  {
    item_id: 'construction_building_tier_3', name: 'Silverroot Infirmary', tier: 3,
    atk: '', def: 1, xp_per_task: 2, double_gather_pct: 2,
    skill_bonus_skill: 'herbing', skill_bonus_value: 1,
    effects_raw: 'DEF +1, XP +2/task, Gathering Level +1, +2% 2x gather chance',
  },
  {
    item_id: 'construction_building_tier_20', name: 'Astral Museum', tier: 20,
    atk: 8, xp_per_task: 12, item_find_pct: 14,
    skill_bonus_skill: 'smithing', skill_bonus_value: 2,
    effects_raw: 'ATK +8, XP +12/task, Smithing Level +2, +14% item find',
  },
];

const compiled = await build({
  stdin: {
    contents: `export * from './src/modules/VillageLedger.js';
               export { ItemDatabase } from './src/modules/ItemDatabase.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: 'iife', globalName: 'Ledger',
});

const dom = new JSDOM('<main></main>', { url: 'https://idleworlds.com/', runScripts: 'outside-only' });
const w = dom.window;
w.fetch = async () => ({ ok: true, json: async () => ({ items: ITEMS, generatedAt: '2026-09-16' }) });
w.eval(compiled.outputFiles[0].text);
const { buildVillageLedger, buildingBenefits, totalBenefits, clearVillageLedger, ItemDatabase } = w.Ledger;

/* ── The numbers, before any DOM ── */

// Array.from: these come back from the jsdom realm, and deepStrictEqual
// compares prototypes as well as contents.
assert.deepEqual(Array.from(buildingBenefits(ITEMS[0]), r => `${r.label} ${r.value}`),
  ['ATK +4', 'XP / task +7', 'Item find +8%', 'Smithing level +2'],
  'a building lists exactly the effects the game prints for it');
assert.deepEqual(Array.from(buildingBenefits(null)), [], 'an unresolved building lists nothing rather than zeroes');

assert.deepEqual(Array.from(totalBenefits([ITEMS[0], ITEMS[1], ITEMS[2]]), r => `${r.label} ${r.value}`),
  ['ATK +12', 'DEF +1', 'XP / task +21', '2× gather +2%', 'Item find +22%',
    'Herbing level +1', 'Smithing level +4'],
  'totals sum each field, and skill levels per skill rather than pooled');
assert.deepEqual(Array.from(totalBenefits([])), [], 'no buildings totals to nothing, not to a row of zeroes');

/* ── The ledger itself ── */

await ItemDatabase.ready();
assert.ok(ItemDatabase.isReady(), 'the stubbed item table indexed');

function own(tag, cls, text) {
  const el = w.document.createElement(tag);
  el.className = cls;
  el.dataset.iwVillageSceneOwned = '1';
  if (text) el.textContent = text;
  return el;
}

const SNAPSHOT = {
  tier: 4,
  capacity: 4,
  slots: [
    { slot: 1, state: 'installed', name: 'Voidiron Archive', file: 'village/building_11.webp', itemKey: 'construction_building_tier_11' },
    { slot: 2, state: 'empty', name: '', file: null, itemKey: '' },
    { slot: 3, state: 'installed', name: 'Astral Museum', file: 'village/building_20.webp', itemKey: 'construction_building_tier_20' },
    { slot: 4, state: 'empty', name: '', file: null, itemKey: '' },
    { slot: 5, state: 'locked', name: '', file: null, itemKey: '' },
  ],
};
const HOUSE = { tier: 4, name: 'Manor', file: 'village/house_4.webp' };

function render() {
  const ledger = buildVillageLedger({
    snapshot: SNAPSHOT, house: HOUSE, perks: ['Base actions take 6s'], own,
  });
  w.document.querySelector('main').replaceChildren(ledger);
  return ledger;
}

let ledger = render();
assert.equal(ledger.querySelectorAll('[data-iw-vs-entry]').length, 3,
  'one entry for the home and one per installed building');
assert.equal(ledger.querySelectorAll('.iw-vs-ledger-vacant').length, 3,
  'the empty and locked plots are listed, so the ledger and the scene agree');
// The scene's teardown sweeps its OWN marker, so a node here that carried a
// second one (or none) would outlive the kill switch.
assert.equal(ledger.dataset.iwVillageSceneOwned, '1');
assert.ok([...ledger.querySelectorAll('*')].every(el => el.dataset.iwVillageSceneOwned === '1'),
  'every node in the ledger is stamped with the SCENE\'s ownership marker');

const home = ledger.querySelector('[data-iw-vs-entry="home"]');
assert.match(home.textContent, /Manor/);
assert.match(home.textContent, /Village slots/);
assert.match(home.textContent, /Base actions take 6s/,
  'the housing copy captured from the Village route survives into the home entry');

const archive = ledger.querySelector('[data-iw-vs-entry="building:voidiron archive"]');
assert.match(archive.textContent, /Slot 1 · tier 11/);
assert.match(archive.textContent, /Item find/);
assert.match(archive.textContent, /\+8%/);
assert.deepEqual(
  [...archive.querySelectorAll('[data-iw-vs-stat-kind="skill-level"]')]
    .map(row => row.textContent.trim()),
  ['Smithing level+2'],
  'only the building skill increase is marked for the mythic treatment',
);

const totals = ledger.querySelector('[data-iw-village-totals]');
assert.match(totals.textContent, /Overall stats/);
assert.match(totals.textContent, /ATK/);
// Voidiron Archive +4 and Astral Museum +8. The HOME is not in it.
assert.match(totals.textContent, /\+12/);
assert.doesNotMatch(totals.textContent, /Village slots/,
  'the totals are the buildings only — housing is a different currency');
assert.match(totals.textContent, /Summed from 2 installed buildings/);
assert.deepEqual(
  [...totals.querySelectorAll('[data-iw-vs-stat-kind="skill-level"]')]
    .map(row => row.textContent.trim()),
  ['Smithing level+4'],
  'the summed skill increase is marked for the same mythic treatment',
);

/* The whole list folds too, and what it must LEAVE behind is structural: the
   totals and the scene are outside the folding box, so no CSS accident can
   take them with it. */
assert.equal(totals.closest('.iw-vs-ledger-list'), null,
  'Overall stats sits outside the folding list, so folding cannot hide it');
assert.equal(ledger.querySelector('[data-iw-vs-entry="home"]').closest('.iw-vs-ledger-list')
  ?.parentElement, ledger, 'every entry is inside the one box the fold hides');

const section = ledger.querySelector('.iw-vs-ledger-toggle');
assert.equal(ledger.dataset.iwVsOpen, '1');
assert.equal(section.getAttribute('aria-expanded'), 'true');
section.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
assert.equal(ledger.dataset.iwVsOpen, '0', 'the section toggle folds the building list');
assert.equal(section.getAttribute('aria-expanded'), 'false');
assert.match(ledger.querySelector('.iw-vs-ledger-title').textContent, /Buildings/,
  'the heading survives the fold, so the folded list still says what it is');
assert.match(ledger.querySelector('[data-iw-village-totals]').textContent, /Overall stats/);
section.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
assert.equal(ledger.dataset.iwVsOpen, '1', 'and unfolds it');

/* ── The disclosure ── */

const head = archive.querySelector('[data-iw-vs-toggle]');
assert.equal(archive.dataset.iwVsOpen, '1', 'an entry starts open');
assert.equal(head.getAttribute('aria-expanded'), 'true');
head.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
assert.equal(archive.dataset.iwVsOpen, '0', 'a click folds that entry');
assert.equal(head.getAttribute('aria-expanded'), 'false');
assert.equal(ledger.querySelector('[data-iw-vs-entry="home"]').dataset.iwVsOpen, '1',
  'and folds only that entry');
head.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
assert.equal(archive.dataset.iwVsOpen, '1', 'a second click unfolds it');

// Fold it again, then re-render: the choice survives the rebuild the scene does
// on every village change.
head.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
ledger = render();
assert.equal(ledger.querySelector('[data-iw-vs-entry="building:voidiron archive"]').dataset.iwVsOpen, '0',
  'a rebuilt ledger keeps the entry the player folded');

/* The kill-switch round trip: the in-memory cache goes, the player's choice
   does not, and it is re-applied by the storage read LANDING AFTER the render —
   the path nothing else would drive, because a `data-iw-*` write schedules no
   flush. */
clearVillageLedger();
ledger = render();
const reopened = ledger.querySelector('[data-iw-vs-entry="building:voidiron archive"]');
assert.equal(reopened.dataset.iwVsOpen, '1', 'the first paint after a teardown is open');
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(reopened.dataset.iwVsOpen, '0',
  'the late storage read re-folds it without waiting for a flush');

clearVillageLedger();
w.close();
console.log('Village ledger: item join, per-building effects, building-only totals,'
  + ' disclosure, rebuild and late storage read passed.');
