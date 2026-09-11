/**
 * import-village-art.mjs
 *
 * Imports the hand-painted Construction building icons and the five housing
 * tiers into the skin, for the Village route:
 *
 *   <src>/New Buildings/<Name>.png        →  assets/village/building_<tier>.webp
 *   <housing>/{camp,cottage,…}.png        →  assets/village/house_<tier>.webp
 *   <src>/construction_icon_manifest.json →  assets/village/buildings.json   (provenance)
 *                                         →  src/modules/villageBuildings.js (generated)
 *
 * Sources (override the building dir with argv[2]):
 *   ../idleWorlds-art-source/construction-2026-09-04
 *   ../idleWorlds-game-sprites-BC/assets/housing
 *
 * WHY TRIM-THEN-CONTAIN, NOT COVER
 *   These sources are transparent PNGs whose subject fills a different share of
 *   a different aspect ratio each time (1536x1024 through 1024x1536, with the
 *   building itself anywhere inside that). Cover-fitting them the way
 *   import-zone-headers.mjs fits a photographic strip would crop the spires off
 *   the tall ones and leave the wide ones swimming in empty alpha, so a row of
 *   medallions would read as wildly different sizes. Each source is therefore
 *   measured to its opaque bounding box first (alpha > ALPHA_FLOOR), then
 *   contain-fit into a square canvas at a fixed margin: every icon ends up
 *   optically the same weight regardless of what it was drawn on.
 *
 *   Aspect ratio is PRESERVED by the contain fit — a square output box with a
 *   non-square building is padded, never stretched. That matters here for the
 *   same reason it matters for the XP plaque (CLAUDE.md, "A sprite-backed box
 *   must keep its art's aspect ratio"): VillagePanels paints these through
 *   `background-size: contain`, so the box may be any shape without distorting.
 *
 * Usage:  node build-tools/import-village-art.mjs [buildingSourceDir]
 *         npm run import:village-art
 */

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(ROOT, '..', 'idleWorlds-art-source', 'construction-2026-09-04');
const HOUSING_DIR = path.resolve(ROOT, '..', 'idleWorlds-game-sprites-BC', 'assets', 'housing');
const OUT_DIR = path.join(ROOT, 'assets', 'village');
const MODULE_OUT = path.join(ROOT, 'src', 'modules', 'villageBuildings.js');

// 256px square at q0.82: the medallion renders at 96-116 CSS px, so this is a
// 2x source on a retina panel with room for the Housing hero's larger box.
const SIZE = 256;
const QUALITY = 0.82;
// Fraction of the canvas left as breathing room around the trimmed art. The
// medallion draws a frame around this box, so the subject must not touch it.
const MARGIN = 0.055;
// Below this the "transparent" background of a lossy source still carries
// stray alpha; trimming on > 0 would find the whole canvas opaque.
const ALPHA_FLOOR = 12;

// tier -> housing file. Names come from the game's own housing table
// (Camp/Cottage/Villa/Manor/Citadel); the art files are named for them.
const HOUSES = [
  { tier: 1, name: 'Camp', file: 'camp.png' },
  { tier: 2, name: 'Cottage', file: 'cottage.png' },
  { tier: 3, name: 'Villa', file: 'villa.png' },
  { tier: 4, name: 'Manor', file: 'manor.png' },
  { tier: 5, name: 'Citadel', file: 'citadel.png' },
];

const manifest = JSON.parse(await readFile(path.join(SRC_DIR, 'construction_icon_manifest.json'), 'utf8'));
const buildings = manifest.items
  .filter(item => item.family === 'building')
  .sort((a, b) => a.tier - b.tier);

if (!buildings.length) throw new Error(`No building items in ${SRC_DIR}/construction_icon_manifest.json`);

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir(OUT_DIR, { recursive: true });

/** Trim to the opaque bbox, then contain-fit into a SIZE x SIZE canvas. */
async function convert(absPath) {
  const bytes = await readFile(absPath);
  const ext = path.extname(absPath).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const uri = `data:${mime};base64,${bytes.toString('base64')}`;
  const out = await page.evaluate(async ({ uri, SIZE, QUALITY, MARGIN, ALPHA_FLOOR }) => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const measure = document.createElement('canvas');
    measure.width = img.naturalWidth;
    measure.height = img.naturalHeight;
    const mctx = measure.getContext('2d', { willReadFrequently: true });
    mctx.drawImage(img, 0, 0);
    const { data } = mctx.getImageData(0, 0, measure.width, measure.height);
    let x0 = measure.width, y0 = measure.height, x1 = -1, y1 = -1;
    for (let y = 0; y < measure.height; y++) {
      for (let x = 0; x < measure.width; x++) {
        if (data[(y * measure.width + x) * 4 + 3] <= ALPHA_FLOOR) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    // A fully transparent source would leave the bbox inverted; fall back to
    // the whole canvas rather than writing a zero-sized draw.
    if (x1 < x0 || y1 < y0) { x0 = 0; y0 = 0; x1 = measure.width - 1; y1 = measure.height - 1; }
    const sw = x1 - x0 + 1;
    const sh = y1 - y0 + 1;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const box = SIZE * (1 - MARGIN * 2);
    const scale = Math.min(box / sw, box / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(img, x0, y0, sw, sh, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);
    return {
      b64: canvas.toDataURL('image/webp', QUALITY).split(',')[1],
      trim: `${sw}x${sh} of ${measure.width}x${measure.height}`,
    };
  }, { uri, SIZE, QUALITY, MARGIN, ALPHA_FLOOR });
  return { bytes: Buffer.from(out.b64, 'base64'), source: bytes.length, trim: out.trim };
}

let total = 0;
const rows = [];
for (const item of buildings) {
  const src = path.join(SRC_DIR, item.source.path);
  const { bytes, source, trim } = await convert(src);
  const name = `building_${item.tier}.webp`;
  await writeFile(path.join(OUT_DIR, name), bytes);
  total += bytes.length;
  rows.push({ tier: item.tier, name: item.name, key: item.item_id, file: `village/${name}` });
  console.log(`${name.padEnd(18)} ← ${item.name.padEnd(30)} ${trim.padEnd(20)} ${(source / 1048576).toFixed(1)} MB → ${(bytes.length / 1024).toFixed(0)} KB`);
}

const houseRows = [];
for (const house of HOUSES) {
  const { bytes, source, trim } = await convert(path.join(HOUSING_DIR, house.file));
  const name = `house_${house.tier}.webp`;
  await writeFile(path.join(OUT_DIR, name), bytes);
  total += bytes.length;
  houseRows.push({ tier: house.tier, name: house.name, file: `village/${name}` });
  console.log(`${name.padEnd(18)} ← ${house.name.padEnd(30)} ${trim.padEnd(20)} ${(source / 1048576).toFixed(1)} MB → ${(bytes.length / 1024).toFixed(0)} KB`);
}

await browser.close();

await writeFile(path.join(OUT_DIR, 'buildings.json'), `${JSON.stringify({
  schema: 'idleworlds-fantasy-skin.village-art/v1',
  imported_from: manifest.schema,
  source_version: manifest.version,
  source_audited_on: manifest.audited_on,
  size: SIZE,
  buildings: rows,
  houses: houseRows,
}, null, 2)}\n`);

const literal = value => JSON.stringify(value);
await writeFile(MODULE_OUT, `/**
 * villageBuildings.js — GENERATED by build-tools/import-village-art.mjs. Do not edit.
 *
 * Village Add-on buildings and housing tiers, by DISPLAY NAME.
 *
 * The live page shows a building only by its rendered name ("Voidiron Archive")
 * — the item key it is really keyed by ("construction_building_tier_11") never
 * reaches the DOM — so name is the only join available, and this map is
 * normalised (lower-case, collapsed whitespace) for that lookup.
 * VillagePanels.resolveBuilding() owns the read; a name that misses falls back
 * to a generic sigil rather than an empty medallion.
 *
 * Source of truth: assets/village/buildings.json (imported from the art source
 * repo's construction_icon_manifest.json). tests/village-panels.test.mjs pins
 * the two in step and checks every referenced asset file exists.
 */

/** @type {Readonly<Record<string, { tier: number, name: string, file: string }>>} */
export const VILLAGE_BUILDINGS = Object.freeze({
${rows.map(r => `  ${literal(r.name.toLowerCase())}: Object.freeze({ tier: ${r.tier}, name: ${literal(r.name)}, file: ${literal(r.file)} }),`).join('\n')}
});

/** @type {Readonly<Record<string, { tier: number, name: string, file: string }>>} */
export const VILLAGE_HOUSES = Object.freeze({
${houseRows.map(r => `  ${literal(r.name.toLowerCase())}: Object.freeze({ tier: ${r.tier}, name: ${literal(r.name)}, file: ${literal(r.file)} }),`).join('\n')}
});
`);

console.log(
  `\nImported ${rows.length} buildings + ${houseRows.length} housing tiers to ${path.relative(ROOT, OUT_DIR)}/ ` +
  `(${SIZE}x${SIZE}, ${(total / 1048576).toFixed(2)} MB total, avg ${(total / (rows.length + houseRows.length) / 1024).toFixed(0)} KB)\n` +
  `Regenerated ${path.relative(ROOT, MODULE_OUT)}`
);
