/**
 * Raid-boss gear sprites (AtlasService raid atlases, 2026-10-08).
 *
 * The raid gear lives in five per-raid atlases (assets/raid_gear/, vendored
 * from idleWorlds-game-sprites-BC's raid_artwork_manifest.json). Before they
 * were wired in, every raid item painted a placeholder: none was in the gear
 * or item atlas.
 *
 *   1. Every item in the raid index resolves to the RAID atlas, by item_id and
 *      by exact name, and its painted window lands on its own cell of its own
 *      raid's atlas (background-size = atlas/cell, position on the cell).
 *   2. The 18 raid items in the live items.json of 2026-10-08 all resolve.
 *   3. A raid name never falls through to the gear atlas's fallbacks (which
 *      strip a leading word or an "of X" and would paint another item).
 *   4. Gear and item resolution is unchanged for ordinary items.
 *
 * Runs the real AtlasService in Node, fed the extension's own asset files.
 * Negative control: drop the raid-by-id/name branches in resolve() and every
 * raid check fails.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const ROOT = resolvePath(import.meta.dirname, '..');
globalThis.document = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.fetch = async url => {
  const body = readFileSync(resolvePath(ROOT, String(url).replace(/^\/+/, '')), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
const realLog = console.log;
console.log = () => {};
console.warn = () => {};
const { AtlasService } = await import('../src/modules/AtlasService.js');
await AtlasService.ready();
console.log = realLog;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const index = JSON.parse(readFileSync(resolvePath(ROOT, 'assets/raid_gear/index.json'), 'utf8'));
console.log('\nraid atlases');
check('five raid atlases load', Object.keys(index.raids).sort().join() === 'ashmaw,grimjaw,morwenna,skarth,thessaly', Object.keys(index.raids).join());

const byId = index.items.map(i => [i.item_id, AtlasService.resolve({ id: i.item_id, name: i.name })]);
const wrongId = byId.filter(([id, r]) => r?.atlas !== 'raid' || r.entry.item_id !== id).map(([id]) => id);
check(`every raid item resolves by id to its raid cell (${index.items.length})`, !wrongId.length, wrongId.join(', '));
const byName = index.items.filter(i => AtlasService.resolve({ name: i.name })?.entry?.item_id !== i.item_id).map(i => i.name);
check('and by its exact name', !byName.length, byName.join(', '));

// The painted window: the stub element records what AtlasService writes.
const paintOf = ref => {
  const el = { style: {}, dataset: {}, querySelector: () => null };
  return AtlasService.paint(el, ref) ? { ...el.style, atlas: el.dataset.iwAtlas } : null;
};
const bad = [];
for (const item of index.items) {
  const atlas = index.raids[item.raid];
  const p = paintOf({ id: item.item_id });
  const size = `${(atlas.width / item.width) * 100}% ${(atlas.height / item.height) * 100}%`;
  const xp = atlas.width > item.width ? (item.x / (atlas.width - item.width)) * 100 : 0;
  const yp = atlas.height > item.height ? (item.y / (atlas.height - item.height)) * 100 : 0;
  if (!p || p.atlas !== 'raid' || !p.backgroundImage.includes(`raid_gear/${item.raid}.png`)
    || p.backgroundSize !== size || p.backgroundPosition !== `${xp.toFixed(6)}% ${yp.toFixed(6)}%`) bad.push(`${item.item_id} ${JSON.stringify(p)}`);
}
check('each paints its own cell of its own raid atlas', !bad.length, bad.slice(0, 3).join(' | '));

console.log('\nthe live raid items (items.json, 2026-10-08)');
const LIVE = [
  ['ashmaws_scale_helm', "Ashmaw's Scale Crest"], ['ashmaws_scale_chest', "Ashmaw's Scale Hauberk"], ['ashmaws_cinderheart_band', 'Cinderheart Band'],
  ['cindercore_fragment', 'Cindercore Fragment'], ['thessalys_storm_grips', "Thessaly's Storm Grips"], ['thessalys_stormstriders', "Thessaly's Stormstriders"],
  ['thessalys_tempest_lance', "Thessaly's Tempest Lance"], ['charged_core_shard', 'Charged Core Shard'], ['morwennas_hollow_crown', "Morwenna's Hollow Crown"],
  ['morwennas_hollow_legwraps', "Morwenna's Hollow Legwraps"], ['grimjaws_bound_plate', "Grimjaw's Bound Plate"], ['grimjaws_bound_greaves', "Grimjaw's Bound Greaves"],
  ['grimjaws_bound_gauntlets', "Grimjaw's Bound Gauntlets"], ['grimjaws_unbroken_march', "Grimjaw's Unbroken March"], ['skarths_rime_helm', "Skarth's Rime Crown"],
  ['skarths_rime_chest', "Skarth's Rime Hauberk"], ['skarths_frostheart', "Skarth's Frostheart"], ['skarths_hoarfrost_band', 'Hoarfrost Band'],
];
const missing = LIVE.filter(([id, name]) => AtlasService.resolve({ id, name })?.atlas !== 'raid').map(([, name]) => name);
check(`all ${LIVE.length} live raid items have a sprite`, !missing.length, missing.join(', '));
const nameOnly = LIVE.filter(([id, name]) => AtlasService.resolve({ name })?.entry?.item_id !== id).map(([, name]) => name);
check('a name alone (tooltips, quest lines) finds the raid art, never a gear fallback', !nameOnly.length, nameOnly.join(', '));

console.log('\nordinary items unchanged');
check('a gear item still resolves to the gear atlas', AtlasService.resolve({ name: 'Kingssteel Sword' })?.atlas === 'gear');
check('an upgraded gear item keeps its badge', AtlasService.resolve({ name: 'Kingssteel Sword+4' })?.badge === 4);
check('an item-atlas item still resolves by id', AtlasService.resolve({ id: 'copper_ore', name: 'Copper Ore' })?.atlas === 'item');
check('a gear icon new in this atlas revision resolves', AtlasService.resolve({ name: "Woodcutter's Axe" })?.atlas === 'gear');
check('an unknown item is still a placeholder', AtlasService.resolve({ id: 'no_such_item', name: 'No Such Item Anywhere' }) === null);

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall raid-gear-sprite checks passed');
