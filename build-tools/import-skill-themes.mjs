/**
 * import-skill-themes.mjs
 *
 * Imports the nine environment-themed recolours of the skills UI atlas into the
 * skin, so each zone can carry frame chrome that matches its header artwork.
 *
 *   <source>/skills_ui_atlas_theme_<name>.webp  →  assets/skills-ui/theme_<name>.webp
 *   (corner_filigree cell, mirrored 2x2)        →  assets/skills-ui/panel_corners_<name>.webp
 *   <source>/zone-theme-map.json                →  assets/skills-ui/zone-theme-map.json  (provenance)
 *                                              →  src/modules/zoneThemes.js  (generated)
 *
 * Source art lives in the sibling sprites repo:
 *   ../idleWorlds-game-sprites-BC/assets/skills-ui-atlas/families
 * (override with argv[2]).
 *
 * WHY THE TWO OUTPUTS PER THEME
 *   - theme_<name>.webp is a straight recolour: identical 860x463 canvas and
 *     sprite positions to skills_ui_atlas.webp, so skills_ui_index.json and the
 *     sprite-window audit stay valid — only the pixels change. SkillsArtService
 *     and inventory.css read it through the `--iw-zone-atlas` CSS variable.
 *   - panel_corners_<name>.webp is the same crop-and-mirror make-panel-corners.mjs
 *     does for the base sheet: `border-image` slices from the edges of a
 *     standalone image and cannot address a region inside an atlas, so the four
 *     mirrored corners are baked into one 176x190 sheet here. ui-system.css,
 *     header.css and tooltip-engine.css read it through `--iw-corner-filigree`.
 *
 * HeaderRenderer.applyZoneTheme() maps the current zone to a theme (see
 * src/modules/zoneThemes.js) and points both variables at these files.
 *
 * This is a pure recolour + crop-and-mirror of art already produced upstream.
 * Re-run whenever the family atlases change.
 *
 * Usage:  node build-tools/import-skill-themes.mjs [sourceDir]
 *         npm run import:skill-themes
 */

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(ROOT, '..', 'idleWorlds-game-sprites-BC', 'assets', 'skills-ui-atlas', 'families');
const OUT_DIR = path.join(ROOT, 'assets', 'skills-ui');
const INDEX = path.join(ROOT, 'assets', 'skills_ui_index.json');
const MODULE_OUT = path.join(ROOT, 'src', 'modules', 'zoneThemes.js');

// Lossy webp: the family atlases ship as ~180 KB lossless PNGs-in-webp; the base
// skin atlas is a ~90 KB lossy webp. Match that so nine themes do not add 1.6 MB.
const QUALITY = 0.9;

const index = JSON.parse(await readFile(INDEX, 'utf8'));
const corner = index.entries.find(e => e.key === 'corner_filigree');
if (!corner) throw new Error('corner_filigree missing from skills_ui_index.json');

const themeFiles = (await readdir(SRC_DIR))
  .map(name => {
    const m = /^skills_ui_atlas_theme_([a-z0-9-]+)\.webp$/i.exec(name);
    return m ? { theme: m[1], name } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.theme.localeCompare(b.theme));

if (!themeFiles.length) {
  console.error(`No "skills_ui_atlas_theme_*.webp" files in ${SRC_DIR}`);
  process.exit(1);
}

let mapSource = null;
try {
  mapSource = JSON.parse(await readFile(path.join(SRC_DIR, 'zone-theme-map.json'), 'utf8'));
} catch {
  console.error(`zone-theme-map.json not found beside the atlases in ${SRC_DIR}`);
  process.exit(1);
}

// zone number -> theme name, validated against the atlases we actually imported.
const importedThemes = new Set(themeFiles.map(t => t.theme));
const zoneThemes = {};
for (const [zoneStr, spec] of Object.entries(mapSource.zones || {})) {
  const zone = Number(zoneStr);
  if (!Number.isInteger(zone) || zone < 1) continue;
  if (!importedThemes.has(spec.theme)) {
    console.error(`zone ${zone} maps to unknown theme "${spec.theme}" — no matching atlas`);
    process.exit(1);
  }
  zoneThemes[zone] = spec.theme;
}
const zoneCount = Object.keys(zoneThemes).length;
if (zoneCount < 1) {
  console.error('zone-theme-map.json carried no usable zone entries');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir(OUT_DIR, { recursive: true });

let total = 0;
for (const { theme, name } of themeFiles) {
  const srcBytes = await readFile(path.join(SRC_DIR, name));
  const uri = `data:image/webp;base64,${srcBytes.toString('base64')}`;

  const { atlasB64, cornersB64, width, height } = await page.evaluate(async ({ uri, c, quality }) => {
    const img = new Image();
    img.src = uri;
    await img.decode();

    // 1. Straight recolour: re-encode the atlas as-is, no geometry change.
    const atlas = document.createElement('canvas');
    atlas.width = img.naturalWidth;
    atlas.height = img.naturalHeight;
    atlas.getContext('2d').drawImage(img, 0, 0);

    // 2. corner_filigree cell, baked into a 2x2 mirrored sheet — identical
    //    recipe to make-panel-corners.mjs so the border-image slice is unchanged.
    const corners = document.createElement('canvas');
    corners.width = c.width * 2;
    corners.height = c.height * 2;
    const cx = corners.getContext('2d');
    cx.imageSmoothingEnabled = false;
    const put = (flipX, flipY, dx, dy) => {
      cx.save();
      cx.translate(dx + (flipX ? c.width : 0), dy + (flipY ? c.height : 0));
      cx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      cx.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, c.width, c.height);
      cx.restore();
    };
    put(false, false, 0, 0);
    put(true, false, c.width, 0);
    put(false, true, 0, c.height);
    put(true, true, c.width, c.height);

    return {
      atlasB64: atlas.toDataURL('image/webp', quality).split(',')[1],
      cornersB64: corners.toDataURL('image/webp', 1).split(',')[1],
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }, { uri, c: corner, quality: QUALITY });

  if (width !== index.width || height !== index.height) {
    console.error(`${name} is ${width}x${height}, not ${index.width}x${index.height} — ` +
      `skills_ui_index.json would no longer describe it`);
    process.exit(1);
  }

  const atlasBytes = Buffer.from(atlasB64, 'base64');
  const cornersBytes = Buffer.from(cornersB64, 'base64');
  total += atlasBytes.length + cornersBytes.length;
  await writeFile(path.join(OUT_DIR, `theme_${theme}.webp`), atlasBytes);
  await writeFile(path.join(OUT_DIR, `panel_corners_${theme}.webp`), cornersBytes);
  console.log(
    `theme_${theme}.webp  (${(atlasBytes.length / 1024).toFixed(0)} KB)   ` +
    `panel_corners_${theme}.webp  (${(cornersBytes.length / 1024).toFixed(0)} KB)`
  );
}

await browser.close();

// Provenance copy + generated runtime map. Two artefacts, one source, so the
// test in tests/zone-themes.test.mjs can prove they never drift.
await writeFile(
  path.join(OUT_DIR, 'zone-theme-map.json'),
  JSON.stringify(mapSource, null, 2) + '\n'
);

const themeList = [...importedThemes].sort();
const entries = Object.keys(zoneThemes)
  .map(Number)
  .sort((a, b) => a - b)
  .map(z => `  ${z}: '${zoneThemes[z]}',`)
  .join('\n');
const module = `/**
 * zoneThemes.js — GENERATED by build-tools/import-skill-themes.mjs. Do not edit.
 *
 * Maps an IdleWorlds zone number to one of the nine environment frame themes.
 * Source of truth: assets/skills-ui/zone-theme-map.json (imported from the
 * sibling sprites repo). HeaderRenderer.applyZoneTheme() reads this to pick the
 * per-zone atlas + corner filigree; tests/zone-themes.test.mjs pins the two in
 * step and checks every referenced asset file exists.
 */

export const ZONE_THEMES = Object.freeze({
${entries}
});

export const THEME_NAMES = Object.freeze([
${themeList.map(t => `  '${t}',`).join('\n')}
]);

export function zoneTheme(zone) {
  return (Number.isInteger(zone) && ZONE_THEMES[zone]) || null;
}
`;
await writeFile(MODULE_OUT, module);

console.log(
  `\nImported ${themeFiles.length} themes to ${path.relative(ROOT, OUT_DIR)}/ ` +
  `(${(total / 1048576).toFixed(2)} MB total for ${themeFiles.length * 2} files)\n` +
  `Wrote ${path.relative(ROOT, MODULE_OUT)} + zone-theme-map.json — ${zoneCount} zones mapped`
);
