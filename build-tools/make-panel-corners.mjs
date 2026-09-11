/**
 * make-panel-corners.mjs
 *
 * Produces the two standalone assets the forged inventory treatment needs:
 * panel_corners.webp and the repaired separator_flourish.webp.
 *
 * WHY THIS EXISTS
 * The inventory panel draws `corner_filigree` (skills_ui_atlas.webp, at
 * 6,362 88x95) in all four corners. Three of them must be mirrored, and a CSS
 * background layer cannot flip its source. `border-image` can hold four fixed
 * corners at once, but it slices from the edges of a standalone image — it
 * cannot address a region inside an atlas. So the four orientations are baked
 * into one 176x190 sheet here, and inventory.css consumes it as:
 *
 *   border-image: url('../assets/inventory/panel_corners.webp')
 *                 95 88 / 45px 42px / 0 stretch;
 *
 * The slice consumes the whole sheet, so the edge and middle regions are empty
 * by construction and only the four corners paint.
 *
 * This is a pure crop-and-mirror of art already in the repo. No resampling, no
 * new artwork. Re-run it whenever skills_ui_atlas.webp changes.
 *
 * Usage:  node build-tools/make-panel-corners.mjs
 */

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATLAS = path.join(ROOT, 'assets', 'skills_ui_atlas.webp');
const INDEX = path.join(ROOT, 'assets', 'skills_ui_index.json');
const OUT_DIR = path.join(ROOT, 'assets', 'inventory');
const OUT = path.join(OUT_DIR, 'panel_corners.webp');
const SEPARATOR_OUT = path.join(OUT_DIR, 'separator_flourish.webp');

const index = JSON.parse(await readFile(INDEX, 'utf8'));
const corner = index.entries.find(e => e.key === 'corner_filigree');
if (!corner) throw new Error('corner_filigree missing from skills_ui_index.json');
const separator = index.entries.find(e => e.key === 'separator_flourish');
if (!separator) throw new Error('separator_flourish missing from skills_ui_index.json');
// The base ornament has different source art from the themed family sheets.
// Its crystal axis is almost at the cell centre, measured in source pixels.
const SEPARATOR_ART_AXIS = 108.5;

const atlasDataUri =
  `data:image/webp;base64,${(await readFile(ATLAS)).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const derived = await page.evaluate(async ({ uri, c, s, separatorArtAxis }) => {
  const img = new Image();
  img.src = uri;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = c.width * 2;
  canvas.height = c.height * 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // top-left, then the three mirrored copies
  const put = (flipX, flipY, dx, dy) => {
    ctx.save();
    ctx.translate(dx + (flipX ? c.width : 0), dy + (flipY ? c.height : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, c.width, c.height);
    ctx.restore();
  };
  put(false, false, 0, 0);
  put(true, false, c.width, 0);
  put(false, true, 0, c.height);
  put(true, true, c.width, c.height);

  const divider = document.createElement('canvas');
  divider.width = s.width;
  divider.height = s.height;
  const dx = divider.getContext('2d');
  dx.drawImage(img, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height);
  const original = dx.getImageData(0, 0, divider.width, divider.height);
  const rebuilt = dx.createImageData(divider.width, divider.height);
  const destinationAxis = (divider.width - 1) / 2;
  for (let x = 0; x < divider.width; x += 1) {
    const sourceX = Math.round(separatorArtAxis + Math.abs(x - destinationAxis));
    if (sourceX < 0 || sourceX >= divider.width) continue;
    for (let y = 0; y < divider.height; y += 1) {
      const dest = (y * divider.width + x) * 4;
      const src = (y * divider.width + sourceX) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        rebuilt.data[dest + channel] = original.data[src + channel];
      }
    }
  }
  dx.putImageData(rebuilt, 0, 0);

  return {
    corners: canvas.toDataURL('image/webp', 1).split(',')[1],
    separator: divider.toDataURL('image/webp', 1).split(',')[1],
  };
}, { uri: atlasDataUri, c: corner, s: separator, separatorArtAxis: SEPARATOR_ART_AXIS });

await browser.close();
await mkdir(OUT_DIR, { recursive: true });
const bytes = Buffer.from(derived.corners, 'base64');
const separatorBytes = Buffer.from(derived.separator, 'base64');
await writeFile(OUT, bytes);
await writeFile(SEPARATOR_OUT, separatorBytes);

console.log(
  `Wrote ${path.relative(ROOT, OUT)} ` +
  `(${corner.width * 2}x${corner.height * 2}, ${(bytes.length / 1024).toFixed(1)} KB)`
);
console.log(
  `Wrote ${path.relative(ROOT, SEPARATOR_OUT)} ` +
  `(${separator.width}x${separator.height}, ${(separatorBytes.length / 1024).toFixed(1)} KB)`
);
