/**
 * import-skill-themes.mjs
 *
 * Imports the nine environment-themed recolours of the skills UI atlas into the
 * skin, so each zone can carry frame chrome that matches its header artwork.
 *
 *   <source>/skills_ui_atlas_theme_<name>.webp  →  assets/skills-ui/theme_<name>.webp
 *   (corner_filigree cell, mirrored 2x2)        →  assets/skills-ui/panel_corners_<name>.webp
 *   (separator_flourish, repaired at left tip)  →  assets/skills-ui/separator_flourish_<name>.webp
 *   <source>/zone-theme-map.json                →  assets/skills-ui/zone-theme-map.json  (provenance)
 *                                              →  src/modules/zoneThemes.js  (generated)
 *
 * Source art lives in the sibling sprites repo:
 *   ../idleWorlds-game-sprites-BC/assets/skills-ui-atlas/families
 * (override with argv[2]).
 *
 * WHY THE DERIVED OUTPUTS PER THEME
 *   - theme_<name>.webp retains the 860x463 LOGICAL canvas and sprite
 *     positions from skills_ui_atlas.webp, but may carry a higher physical
 *     pixel ratio declared by zone-theme-map.json. Percentage sprite windows
 *     stay valid while high-DPI browsers receive sharper source pixels.
 *   - panel_corners_<name>.webp is the same crop-and-mirror make-panel-corners.mjs
 *     does for the base sheet: `border-image` slices from the edges of a
 *     standalone image and cannot address a region inside an atlas, so the four
 *     mirrored corners are baked into one logical 176x190 sheet here. ui-system.css,
 *     header.css and tooltip-engine.css read it through `--iw-corner-filigree`.
 *   - separator_flourish_<name>.webp isolates the title divider. The upstream
 *     crystal is offset inside its cell and its left wing is malformed, so the
 *     intact right half is recentered and mirrored to make a truly bilateral
 *     ornament without changing the crystal's proportions.
 *
 * HeaderRenderer.applyZoneTheme() maps the current zone to a theme (see
 * src/modules/zoneThemes.js) and points all three artwork variables at these files.
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

// Canvas does not expose lossless WebP encoding. Theme atlases are copied byte
// for byte from the upstream lossless source; only the derived corner sheet is
// canvas-encoded, at maximum quality and the same high physical pixel ratio.
const CORNER_QUALITY = 1;

const index = JSON.parse(await readFile(INDEX, 'utf8'));
const corner = index.entries.find(e => e.key === 'corner_filigree');
if (!corner) throw new Error('corner_filigree missing from skills_ui_index.json');
const separator = index.entries.find(e => e.key === 'separator_flourish');
if (!separator) throw new Error('separator_flourish missing from skills_ui_index.json');
// Each family illustration places its crystal at a different horizontal point
// inside the shared atlas cell. Measure that axis per theme and pick the wing
// whose outer tip is complete. Values are logical pixels and scale with the
// source density. Lunar is the only family whose left wing is the intact one.
const SEPARATOR_ART = Object.freeze({
  celestial:          { axis: 109.5,  direction: 1 },
  'forged-metal':     { axis: 105.5,  direction: 1 },
  glacial:            { axis: 109.25, direction: 1 },
  infernal:           { axis: 107.5,  direction: 1 },
  'lunar-spectral':   { axis: 116,    direction: -1 },
  'runic-arcane':     { axis: 110,    direction: 1 },
  'tempest-oceanic':  { axis: 103.25, direction: 1 },
  verdant:            { axis: 95.75,  direction: 1 },
  voidborn:           { axis: 103.25, direction: 1 },
});

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

const pixelRatio = mapSource.pixelRatio;
if (!Number.isInteger(pixelRatio) || pixelRatio < 1) {
  console.error(`zone-theme-map.json pixelRatio must be a positive integer, got ${pixelRatio}`);
  process.exit(1);
}
if (mapSource.canvas?.width !== index.width || mapSource.canvas?.height !== index.height) {
  console.error('zone-theme-map.json logical canvas does not match skills_ui_index.json');
  process.exit(1);
}
const physicalWidth = index.width * pixelRatio;
const physicalHeight = index.height * pixelRatio;

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir(OUT_DIR, { recursive: true });

let total = 0;
for (const { theme, name } of themeFiles) {
  const separatorSpec = SEPARATOR_ART[theme];
  if (!separatorSpec) throw new Error(`separator geometry missing for theme "${theme}"`);
  const srcBytes = await readFile(path.join(SRC_DIR, name));
  const uri = `data:image/webp;base64,${srcBytes.toString('base64')}`;

  const { cornersB64, separatorB64, width, height } = await page.evaluate(async ({ uri, c, s, separatorSpec, pixelRatio, quality }) => {
    const img = new Image();
    img.src = uri;
    await img.decode();

    // corner_filigree cell, baked into a 2x2 mirrored sheet. Coordinates in
    // skills_ui_index.json are logical; source and destination pixels scale by
    // the declared physical density.
    const source = {
      x: c.x * pixelRatio,
      y: c.y * pixelRatio,
      width: c.width * pixelRatio,
      height: c.height * pixelRatio,
    };
    const corners = document.createElement('canvas');
    corners.width = source.width * 2;
    corners.height = source.height * 2;
    const cx = corners.getContext('2d');
    const put = (flipX, flipY, dx, dy) => {
      cx.save();
      cx.translate(dx + (flipX ? source.width : 0), dy + (flipY ? source.height : 0));
      cx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      cx.drawImage(img, source.x, source.y, source.width, source.height,
        0, 0, source.width, source.height);
      cx.restore();
    };
    put(false, false, 0, 0);
    put(true, false, source.width, 0);
    put(false, true, 0, source.height);
    put(true, true, source.width, source.height);

    const separatorSource = {
      x: s.x * pixelRatio,
      y: s.y * pixelRatio,
      width: s.width * pixelRatio,
      height: s.height * pixelRatio,
    };
    const separator = document.createElement('canvas');
    separator.width = separatorSource.width;
    separator.height = separatorSource.height;
    const sx = separator.getContext('2d');
    sx.drawImage(img, separatorSource.x, separatorSource.y,
      separatorSource.width, separatorSource.height,
      0, 0, separatorSource.width, separatorSource.height);

    // Build every column from the intact right half. The source crystal axis
    // is offset inside the cell, so map that axis to the exact destination
    // centre before reflecting. No original left-wing pixels survive.
    const original = sx.getImageData(0, 0, separator.width, separator.height);
    const rebuilt = sx.createImageData(separator.width, separator.height);
    const sourceAxis = separatorSpec.axis * pixelRatio;
    const destinationAxis = (separator.width - 1) / 2;
    for (let x = 0; x < separator.width; x += 1) {
      const sourceX = Math.round(
        sourceAxis + separatorSpec.direction * Math.abs(x - destinationAxis)
      );
      // A source axis can sit far enough from the cell centre that the mirrored
      // destination has more transparent margin than the chosen source side.
      if (sourceX < 0 || sourceX >= separator.width) continue;
      for (let y = 0; y < separator.height; y += 1) {
        const dest = (y * separator.width + x) * 4;
        const src = (y * separator.width + sourceX) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          rebuilt.data[dest + channel] = original.data[src + channel];
        }
      }
    }
    sx.putImageData(rebuilt, 0, 0);

    return {
      cornersB64: corners.toDataURL('image/webp', quality).split(',')[1],
      separatorB64: separator.toDataURL('image/webp', quality).split(',')[1],
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }, {
    uri, c: corner, s: separator, separatorSpec,
    pixelRatio, quality: CORNER_QUALITY,
  });

  if (width !== physicalWidth || height !== physicalHeight) {
    console.error(`${name} is ${width}x${height}, not ${physicalWidth}x${physicalHeight} — ` +
      `expected ${pixelRatio}x physical pixels for the ${index.width}x${index.height} logical atlas`);
    process.exit(1);
  }

  const atlasBytes = srcBytes;
  const cornersBytes = Buffer.from(cornersB64, 'base64');
  const separatorBytes = Buffer.from(separatorB64, 'base64');
  total += atlasBytes.length + cornersBytes.length + separatorBytes.length;
  await writeFile(path.join(OUT_DIR, `theme_${theme}.webp`), atlasBytes);
  await writeFile(path.join(OUT_DIR, `panel_corners_${theme}.webp`), cornersBytes);
  await writeFile(path.join(OUT_DIR, `separator_flourish_${theme}.webp`), separatorBytes);
  console.log(
    `theme_${theme}.webp  (${(atlasBytes.length / 1024).toFixed(0)} KB)   ` +
    `panel_corners_${theme}.webp  (${(cornersBytes.length / 1024).toFixed(0)} KB)   ` +
    `separator_flourish_${theme}.webp  (${(separatorBytes.length / 1024).toFixed(0)} KB)`
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
 * per-zone atlas, corner filigree and separator flourish; tests/zone-themes.test.mjs
 * pins the generated map in step and checks every referenced asset file exists.
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
  `(${(total / 1048576).toFixed(2)} MB total for ${themeFiles.length * 3} files)\n` +
  `Wrote ${path.relative(ROOT, MODULE_OUT)} + zone-theme-map.json — ${zoneCount} zones mapped`
);
