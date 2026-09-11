/**
 * VillagePanels: role classification, building-art resolution, live state
 * changes, idempotence and teardown.
 *
 * The fixture markup is transcribed from the deployed Next.js bundle (2026-09),
 * class names included — every hook on this route is anonymous Tailwind, so a
 * fixture that models a tidier DOM than the game's would pass while the live
 * page stayed bare (CLAUDE.md, "A fixture that models the wrong DOM shape lies
 * exactly like a missing stylesheet").
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

/* ---- generated map vs its source of truth, and the files it names -------- */

const manifest = JSON.parse(await readFile(resolve(projectRoot, 'assets/village/buildings.json'), 'utf8'));
const moduleSource = await readFile(resolve(projectRoot, 'src/modules/villageBuildings.js'), 'utf8');
assert.equal(manifest.buildings.length, 34, 'every Construction building tier has art');
assert.equal(manifest.houses.length, 5, 'every housing tier has art');
for (const entry of [...manifest.buildings, ...manifest.houses]) {
  await access(resolve(projectRoot, 'assets', entry.file));
  assert.ok(
    moduleSource.includes(JSON.stringify(entry.name.toLowerCase())) && moduleSource.includes(JSON.stringify(entry.file)),
    `villageBuildings.js is in step with buildings.json for ${entry.name} — re-run npm run import:village-art`);
}

/* ---- the live DOM shape ------------------------------------------------- */

const slot = (n, body) => `<div class="compact-panel p-2.5">${body}</div>`;
const installed = (n, name, effects) => slot(n, `<div class="flex items-center justify-between gap-2">` +
  `<div class="min-w-0">` +
    `<p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Slot ${n}</p>` +
    `<p class="text-sm font-semibold text-white">${name}</p>` +
    `<p class="mt-0.5 text-[11px] text-white/55">${effects}</p>` +
  `</div>` +
  `<div class="flex shrink-0 flex-col gap-1">` +
    `<button class="button-secondary px-3 py-1.5 text-xs">Destroy</button>` +
    `<button class="button-secondary px-3 py-1.5 text-xs">Uninstall (100k)</button>` +
  `</div></div>`);
const vacant = n => slot(n, `<div class="flex items-center justify-between gap-2">` +
  `<div class="min-w-0">` +
    `<p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Slot ${n}</p>` +
    `<p class="text-xs text-white/40">Empty slot</p>` +
  `</div>` +
  `<button class="button-primary shrink-0 px-3 py-1.5 text-xs">Install</button></div>`);

const HOUSING = `<div class="panel p-3.5" id="housing">
  <div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold text-white">Village</h2></div>
  <div class="compact-panel p-3">
    <p class="text-sm font-semibold text-white">\u{1F3E0} Manor</p>
    <p class="mt-1 text-xs text-white/60">Current tier: 4 • Base actions take 6s</p>
    <p class="mt-1 text-[11px] text-white/45">Longer crafts also speed up proportionally.</p>
    <p class="mt-2 text-xs text-white/70">Salvage Material owned: 12,004</p>
    <p class="mt-2 text-xs text-emerald-100/85">Next upgrade: Citadel • 1,000,000,000g • 100,000,000 salvage</p>
    <button class="button-primary mt-3 px-3 py-2 text-xs">Upgrade Housing</button>
  </div>
</div>`;

const ADDONS = `<div class="panel p-3.5" id="addons">
  <div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold text-white">\u{1F3D7}\u{FE0F} Village Add-ons</h2></div>
  <p class="mb-3 text-[11px] text-white/50">4 slots available (1 per housing tier). Only one of each building type per village.</p>
  <div class="space-y-2">
    ${installed(1, 'Voidiron Archive', '+4 ATK • +7 XP/task • +8% Item Find • +2 smithing level')}
    ${installed(2, 'Celestial Exchange', '+7 XP/task • +8% Gold Find • +4% Double Gather • +2 gathering level')}
    ${vacant(3)}
    ${vacant(4)}
    <p class="text-[11px] text-white/40">Assemble a building in the Construction skill panel first.</p>
  </div>
</div>`;

const compiled = await build({
  stdin: {
    // ItemDatabase rides along so the test can prime the singleton VillagePanels
    // actually reads — esbuild bundles one instance, so this is the same object.
    contents: [
      "export * from './src/modules/VillagePanels.js';",
      "export { ItemDatabase } from './src/modules/ItemDatabase.js';",
    ].join('\n'),
    resolveDir: projectRoot,
  },
  bundle: true, write: false, format: 'iife', globalName: 'Village', loader: { '.css': 'text' },
});
const dom = new JSDOM(`<div id="page">${HOUSING}${ADDONS}</div>`, { runScripts: 'outside-only' });
// A two-item stand-in for /items.json, so the tooltip binding below is exercised
// rather than silently skipped by an unready database.
dom.window.fetch = async () => ({
  ok: true,
  json: async () => ({
    generatedAt: '2026-09-07T00:00:00Z',
    items: [
      { item_id: 'construction_building_tier_11', name: 'Voidiron Archive', category: 'Trade Good' },
      { item_id: 'construction_building_tier_12', name: 'Celestial Exchange', category: 'Trade Good' },
    ],
  }),
});
dom.window.eval(compiled.outputFiles[0].text);
const { decorateVillagePanel, clearVillagePanel, ItemDatabase } = dom.window.Village;
await ItemDatabase.ready();
assert.ok(ItemDatabase.isReady(), 'the stand-in item table indexed');
const doc = dom.window.document;
const page = doc.querySelector('#page');
const housing = doc.querySelector('#housing');
const addons = doc.querySelector('#addons');
const original = page.innerHTML;

/* ---- add-on slots ------------------------------------------------------- */

let clicks = 0;
const destroy = addons.querySelector('button');
destroy.addEventListener('click', () => clicks++);

decorateVillagePanel({ root: addons, kind: 'addons' });
const cards = [...addons.querySelectorAll('.compact-panel')];
assert.equal(addons.dataset.iwVillage, 'addons');
assert.equal(cards[0].dataset.iwVillageState, 'installed');
assert.equal(cards[2].dataset.iwVillageState, 'vacant');
assert.equal(cards[0].querySelector('[data-iw-village-role="name"]').textContent, 'Voidiron Archive');
assert.equal(cards[0].querySelector('[data-iw-village-role="index"]').textContent, 'Slot 1');
assert.match(cards[0].querySelector('[data-iw-village-role="effects"]').textContent, /\+4 ATK/);
assert.equal(cards[2].querySelector('[data-iw-village-role="vacant"]').textContent, 'Empty slot');

// The name line becomes a TooltipEngine trigger by attributes only — no wrapper,
// so NameScanner (which skips [data-iw-tooltip-trigger]) cannot stack a second
// highlight on the same text, and React still owns the node.
const nameLine = cards[0].querySelector('[data-iw-village-role="name"]');
assert.equal(nameLine.dataset.iwTooltipTrigger, '1');
assert.equal(nameLine.dataset.iwItemName, 'Voidiron Archive');
assert.equal(nameLine.getAttribute('aria-haspopup'), 'dialog');
assert.equal(nameLine.childElementCount, 0, 'the trigger wraps nothing');
// A control must NOT be described as opening a dialog.
assert.equal(cards[2].querySelector('button').hasAttribute('aria-haspopup'), false);

// The art is the whole point: the two installed slots must resolve to their own
// hand-painted tiers, not to a shared placeholder.
const art = card => card.querySelector('.iw-village-art');
// The sprite rides on a custom property because it is painted by a
// ::before (see the layering note in VillagePanels.ensureArt).
const sprite = el => el?.style.getPropertyValue('--iw-village-sprite') || '';
assert.match(sprite(art(cards[0])), /building_11\.webp/, 'Voidiron Archive is tier 11');
assert.match(sprite(art(cards[1])), /building_12\.webp/, 'Celestial Exchange is tier 12');
assert.equal(art(cards[0]).dataset.iwVillageArt, 'building');
assert.equal(art(cards[0]).getAttribute('aria-hidden'), 'true', 'art is decorative');
assert.equal(art(cards[2]).dataset.iwVillageArt, 'generic', 'an empty plot carries no building sprite');
assert.equal(sprite(art(cards[2])), '', 'an empty plot paints no image at all');

// Controls keep their handlers and gain only role attributes.
assert.equal(destroy.dataset.iwVillageAction, 'destroy');
assert.equal([...cards[0].querySelectorAll('button')][1].dataset.iwVillageAction, 'uninstall');
assert.equal(cards[2].querySelector('button').dataset.iwVillageAction, 'install');
destroy.click();
assert.equal(clicks, 1, 'native handler survives decoration');
assert.equal(destroy.textContent, 'Destroy', 'native control copy is untouched');

// The trailing hint is a sibling of the cards, not a card.
const note = [...addons.querySelectorAll('p')].find(p => /Assemble a building/.test(p.textContent));
assert.equal(note.dataset.iwVillageRole, 'note');
assert.equal(addons.querySelector('.mb-3').dataset.iwVillageRole, 'intro');

/* ---- idempotence and live state ----------------------------------------- */

const artNode = art(cards[0]);
decorateVillagePanel({ root: addons, kind: 'addons' });
assert.equal(cards[0].querySelectorAll('.iw-village-art').length, 1, 'a second pass appends nothing');
assert.equal(art(cards[0]), artNode, 'a second pass reuses the same art layer');

// Uninstall: React swaps the card's copy in place. The signature guard must
// notice, or the card would keep a building it no longer holds.
const copy = cards[0].querySelector('[data-iw-village-role="copy"]');
copy.querySelector('[data-iw-village-role="name"]').remove();
copy.querySelector('[data-iw-village-role="effects"]').remove();
copy.insertAdjacentHTML('beforeend', '<p class="text-xs text-white/40">Empty slot</p>');
decorateVillagePanel({ root: addons, kind: 'addons' });
assert.equal(cards[0].dataset.iwVillageState, 'vacant', 'an uninstalled slot re-reads as vacant');
assert.equal(sprite(art(cards[0])), '', 'the old building sprite is cleared');
assert.equal(art(cards[0]).dataset.iwVillageArt, 'generic');

/* ---- the install picker ------------------------------------------------- */

cards[3].insertAdjacentHTML('beforeend', `<div class="mt-2.5 space-y-1.5 border-t border-white/10 pt-2.5">
  <button class="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-left">
    <p class="text-xs font-semibold text-white">Sunforge Arena <span class="text-white/40">×2</span></p>
    <p class="mt-0.5 text-[11px] text-emerald-200/80">+9 ATK</p>
  </button>
  <div class="space-y-1">
    <div class="rounded-xl border border-white/5 bg-white/[0.02] p-2 opacity-50">
      <p class="text-xs font-semibold text-white/60">Voidiron Archive <span class="text-white/30">×1</span></p>
      <p class="mt-0.5 text-[10px] text-white/35">Already installed elsewhere in your village</p>
    </div>
  </div>
</div>`);
decorateVillagePanel({ root: addons, kind: 'addons' });
const picker = cards[3].querySelector('[data-iw-village-role="picker"]');
assert.ok(picker, 'the open picker is identified');
const option = picker.querySelector('[data-iw-village-role="option"]');
assert.equal(option.tagName, 'BUTTON');
assert.match(sprite(option.querySelector('.iw-village-option-art')), /building_15\.webp/,
  'Sunforge Arena is tier 15 — the picker is where the art earns the most');
const ownedTile = picker.querySelector('[data-iw-village-role="option-owned"]');
assert.match(sprite(ownedTile.querySelector('.iw-village-option-art')), /building_11\.webp/);
// The wrapper div around the owned tile must not answer for the tile inside it.
assert.equal(picker.querySelector('div.space-y-1').dataset.iwVillageRole, undefined,
  'a wrapper with no direct-child <p> is not an option');

/* ---- housing hero ------------------------------------------------------- */

decorateVillagePanel({ root: housing, kind: 'housing' });
const house = housing.querySelector('.compact-panel');
assert.equal(housing.dataset.iwVillage, 'housing');
assert.equal(house.dataset.iwVillage, 'house');
assert.equal(house.dataset.iwVillageTier, '4');
assert.match(sprite(art(house)), /house_4\.webp/, 'the Manor hero is tier 4 art');
assert.equal(house.querySelector('[data-iw-village-role="house-name"]').textContent, '\u{1F3E0} Manor');
assert.equal(house.querySelector('[data-iw-village-role="house-next"]').dataset.iwVillageRole, 'house-next');
assert.equal(house.querySelector('button').dataset.iwVillageAction, 'upgrade');
assert.equal(house.querySelectorAll('.iw-village-tier-pip').length, 5);
assert.equal(house.querySelectorAll('[data-iw-village-pip="held"]').length, 4, 'four of five tiers are held');

// The tier NUMBER is the join, not the name: a renamed house still resolves.
// (Negative control: break houseTier's digit read and this flips to house_0 /
// no art while the name-only path would still have answered.)
house.querySelector('[data-iw-village-role="house-name"]').textContent = '\u{1F3E0} Bastion';
house.querySelector('[data-iw-village-role="house-tier"]').textContent = 'Current tier: 5 • Base actions take 5s';
decorateVillagePanel({ root: housing, kind: 'housing' });
assert.equal(house.dataset.iwVillageTier, '5');
assert.match(sprite(art(house)), /house_5\.webp/, 'tier drives the hero, not the name');
assert.equal(house.querySelectorAll('[data-iw-village-pip="held"]').length, 5);

/* ---- teardown ----------------------------------------------------------- */

clearVillagePanel(addons);
clearVillagePanel(housing);
// Undo the two live-state edits the test made so the markup can be compared.
house.querySelector('p').textContent = '\u{1F3E0} Manor';
[...house.querySelectorAll('p')][1].textContent = 'Current tier: 4 • Base actions take 6s';
cards[3].querySelector('div.mt-2\\.5').remove();
copy.querySelector('p:last-child').remove();
copy.insertAdjacentHTML('beforeend',
  '<p class="text-sm font-semibold text-white">Voidiron Archive</p>' +
  '<p class="mt-0.5 text-[11px] text-white/55">+4 ATK • +7 XP/task • +8% Item Find • +2 smithing level</p>');
assert.equal(page.innerHTML, original, 'teardown restores all native markup');

console.log('Village building art, slot roles, install picker, housing hero and teardown passed.');
